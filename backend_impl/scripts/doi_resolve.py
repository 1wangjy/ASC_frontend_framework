#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DOI resolution for local PDFs — filename -> embedded text -> Crossref/OpenAlex.

Chinese journal PDFs (CNKI) carry a DOI in the page header or metadata even when the
filename does not (e.g. 知网 files named 标题-作者.pdf), and some downloaded English
manuscripts print no DOI at all. This module resolves a DOI for every PDF, in order:

  1. DOI encoded in the filename (10.1000_xxx.yyy -> 10.1000/xxx.yyy)
  2. DOI printed in the PDF text (first pages, then all pages). Full-width characters
     and the intra-DOI spaces CNKI inserts are normalised away first.
  3. DOI from the PDF's embedded metadata (/doi, /Subject, XMP).
  4. Bibliographic lookup by title + author on Crossref, then OpenAlex — the result is
     only accepted when the returned title matches closely (guards against bad hits).

Results are cached in data/doi_cache.json (keyed by file path + size) so re-runs are cheap.
Library use:
    from doi_resolve import pdf_doi
    doi, source = pdf_doi(Path('/abs/x.pdf'), title='...', author='...')
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

UA = 'ASC-literature-pipeline/1.0 (mailto:literature@example.com)'
CACHE_PATH = Path(__file__).resolve().parent.parent.parent / 'data' / 'doi_cache.json'

# 全角 ASCII 区块 + 中文排版常见的全角标点
_FW_MAP = {chr(0xFF01 + i): chr(0x21 + i) for i in range(94)}
_FW_MAP.update({'．': '.', '／': '/', '﹒': '.', '⁄': '/', '－': '-', '　': ' ', '\u3000': ' '})
FW_TABLE = str.maketrans(_FW_MAP)

DOI_RE = re.compile(r'(?<![0-9A-Za-z])10\.\d{4,9}/[A-Za-z0-9._;()/:\-]{3,80}')


def normalize_text(text: str) -> str:
    return (text or '').translate(FW_TABLE)


def find_dois(text: str) -> list[str]:
    """All DOI-looking strings in `text`, handling CNKI's spaced/full-width rendering."""
    norm = normalize_text(text)
    compact = re.sub(r'\s+', '', norm)
    hits = DOI_RE.findall(norm) + DOI_RE.findall(compact)
    out, seen = [], set()
    for h in hits:
        h = h.rstrip('.').rstrip(')').rstrip(';').rstrip(',').rstrip('/')
        # pdf/html suffixes leak in from "…/10.1234/x.pdf" style URLs
        h = re.sub(r'(?:\.(?:pdf|html?|aspx))$', '', h, flags=re.I)
        if h.count('/') < 1 or len(h) < 8 or h.lower() in seen:
            continue
        seen.add(h.lower())
        out.append(h)
    return out


def pdf_text(path: Path, maxpages: int | None = None) -> str:
    """Best available text extraction: pypdf, else pdfminer, else ''."""
    best = ''
    for extractor in ('pypdf', 'pdfminer'):
        try:
            if extractor == 'pypdf':
                from pypdf import PdfReader
                reader = PdfReader(str(path))
                pages = reader.pages if maxpages is None else reader.pages[:maxpages]
                text = ''.join((p.extract_text() or '') for p in pages)
            else:
                from pdfminer.high_level import extract_text
                text = extract_text(str(path), maxpages=maxpages) or ''
        except Exception:
            continue
        # \x00-heavy output means the font has no usable ToUnicode map
        score = len(re.sub(r'[\x00-\x08\x0b-\x1f]', '', text))
        if score > len(best):
            best = text
        if score > 400:
            break
    return best


def _src_text(path: Path) -> str:
    try:
        return pdf_text(path, maxpages=2)
    except Exception:
        return ''


def pdf_doi_from_text(path: Path) -> str:
    """Scan the first pages, then the whole document, for a printed DOI.

    Candidates are tried longest-first: the same page often carries a truncated rendering
    ("10.3390/app120") alongside the full DOI ("10.3390/app12020704") that follows a line
    break, and only the registered form should win.
    """
    for maxpages in (3, None):
        text = pdf_text(path, maxpages=maxpages)
        hits = find_dois(text)
        if not hits:
            continue
        for h in sorted(hits, key=len, reverse=True):
            fixed = sanitize_doi(h, text=text)
            if fixed:
                return fixed
        return hits[0]
    return ''


def _meta_blob(path: Path) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        info = reader.metadata or {}
        return ' '.join(str(v) for v in info.values())
    except Exception:
        return ''


def _meta_doi(path: Path) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        info = reader.metadata or {}
        blob = ' '.join(str(v) for v in info.values())
        root = reader.trailer.get('/Root', {})
        meta = root.get('/Metadata') if hasattr(root, 'get') else None
        if meta is not None:
            try:
                blob += ' ' + meta.get_data().decode('utf-8', 'ignore')
            except Exception:
                pass
        hits = find_dois(blob)
        return hits[0] if hits else ''
    except Exception:
        return ''


def crossref_work(doi: str, timeout: int = 20):
    """Metadata for a DOI from Crossref -> {'title','author','year'} or None."""
    if not doi:
        return None
    try:
        data = _get_json('https://api.crossref.org/works/' + urllib.parse.quote(doi), timeout=timeout)
    except Exception:
        return None
    m = data.get('message') or {}
    title = (m.get('title') or [''])[0]
    authors = ', '.join(
        ' '.join(x for x in (a.get('given'), a.get('family')) if x) for a in (m.get('author') or [])
    )
    year = ''
    for k in ('published-print', 'published-online', 'issued'):
        parts = ((m.get(k) or {}).get('date-parts') or [[]])[0]
        if parts and parts[0]:
            year = str(parts[0])
            break
    return {'title': title, 'author': authors, 'year': year}


def doi_from_publisher_name(stem: str, timeout: int = 20):
    """`NoDOI_ff_<pii|suffix>` files: publisher IDs that map straight onto a DOI.

    Elsevier's legacy items are registered as 10.1016/<PII> (e.g. S0272-8842(01)00096-7);
    the NoDOI downloader prefixes Springer's 10.1007 suffix with 's'. Candidates are
    validated against Crossref before being accepted; Crossref's metadata is returned.
    """
    m = re.match(r'^no_?doi_(?:ff_)?(.+?)(?:\.pdf)?$', stem, re.I)
    if not m:
        return '', None
    raw = urllib.parse.unquote(m.group(1)).strip().rstrip('.')
    if not raw:
        return '', None
    cands = []
    if re.match(r'^s?\d{4,5}-\d{3}-\d{4}-\d$', raw, re.I):           # Springer-style suffix
        cands += ['10.1007/' + raw, '10.1007/' + raw.lower()]
    if re.match(r'^s?\d{4}-\d{4}\(\d{2}\)\d{5}-[\dA-Za-z]$', raw, re.I):  # Elsevier PII
        cands += ['10.1016/' + raw.upper()]
    for c in dict.fromkeys(cands):
        meta = crossref_work(c, timeout=timeout)
        if meta and meta.get('title'):
            return c, meta
    return '', None


ISIJ_RE = re.compile(r'ISIJ\s*International.{0,60}Vol\.?\s*(\d{1,3}).{0,40}pp\.?\s*(\d{1,5})', re.I | re.S)
ANNAL_RE = re.compile(r'Annales\s+Geophysicae.{0,40}?\b(\d{1,3})\b\s*,\s*(\d{1,5}).{0,40}?(\d{4})', re.I | re.S)


def derived_doi(text: str, timeout: int = 20):
    """DOl patterns publishers print in mastheads (validated against Crossref)."""
    if not text:
        return ''
    cands = []
    m = ISIJ_RE.search(text)
    if m:
        cands.append(f'10.2355/isijinternational.{int(m.group(1))}.{int(m.group(2))}')
    m = ANNAL_RE.search(text)
    if m:
        cands.append(f'10.5194/angeo-{int(m.group(1))}-{int(m.group(2))}-{m.group(3)}')
    for c in cands:
        if crossref_work(c, timeout=timeout):
            return c
    return ''


PII_RE = re.compile(r'\b(s?\d{4}-\d{4}\(\d{2}\)\d{5}-[\dA-Za-z])\b', re.I)
SPRINGER_RE = re.compile(r'\b(s?\d{4,5}-\d{3}-\d{4}-\d)\b', re.I)


def doi_from_pii_text(text: str, timeout: int = 20):
    """Publisher IDs appearing in metadata/titles ("PII: S0272-8842(01)00096-7") -> DOI."""
    for pat, prefix in ((PII_RE, '10.1016/'), (SPRINGER_RE, '10.1007/')):
        for raw in dict.fromkeys(pat.findall(text or '')):
            cand = prefix + (raw.upper() if prefix == '10.1016/' else raw.lower())
            if crossref_work(cand, timeout=timeout):
                return cand
    return ''


def ocr_text(path: Path, maxpages: int = 2, scale: float = 2.2) -> str:
    """Rendered-page OCR text ('' when pypdfium2/rapidocr are unavailable)."""
    global _OCR_ENGINE
    try:
        import numpy as np
        from pypdfium2 import PdfDocument
        from rapidocr_onnxruntime import RapidOCR
    except Exception:
        return ''
    try:
        if _OCR_ENGINE is None:
            _OCR_ENGINE = RapidOCR()
        ocr = _OCR_ENGINE
    except Exception:
        return ''
    try:
        doc = PdfDocument(str(path))
        chunks = []
        for i in range(min(maxpages, len(doc))):
            image = doc[i].render(scale=scale).to_pil()
            result, _ = ocr(np.array(image))
            chunks += [line[1] for line in (result or [])]
        return ' '.join(chunks)
    except Exception:
        return ''


def ocr_doi(path: Path, maxpages: int = 2, scale: float = 2.2) -> str:
    """DOI read off the rendered first pages; '' when nothing is found or OCR is missing."""
    hits = find_dois(ocr_text(path, maxpages=maxpages, scale=scale))
    return hits[0] if hits else ''


_OCR_ENGINE = None


def clean_meta_title(title: str) -> str:
    """Strip the markup/wrappers journal metadata leaves in /Title (<Subscript>, 'PII: ')."""
    t = re.sub(r'</?(?:Sub|Super)script>', '', title or '', flags=re.I)
    t = re.sub(r'<[^>]{1,20}>', '', t)
    t = re.sub(r'^(?:PII|DOI)\s*[:：]\s*', '', t, flags=re.I)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _similar(a: str, b: str) -> float:
    clean = lambda s: re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', (s or '').lower())
    a, b = clean(a), clean(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _get_json(url: str, timeout: int = 25):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8', 'ignore'))


def crossref_lookup(title: str, author: str = '', min_ratio: float = 0.9):
    """-> (doi, matched_title) or ('', '')."""
    if not title:
        return '', ''
    params = {'query.bibliographic': f"{title} {author}".strip(), 'rows': 5,
              'select': 'DOI,title,author'}
    url = 'https://api.crossref.org/works?' + urllib.parse.urlencode(params)
    try:
        data = _get_json(url)
    except Exception:
        return '', ''
    best, score = '', 0.0
    for item in (data.get('message', {}).get('items') or []):
        cand = (item.get('title') or [''])[0]
        r = _similar(title, cand)
        if r > score:
            best, score = item.get('DOI', ''), r
    return (best, title) if best and score >= min_ratio else ('', '')


def openalex_lookup(title: str, author: str = '', min_ratio: float = 0.9):
    if not title:
        return '', ''
    url = ('https://api.openalex.org/works?per-page=5&search='
           + urllib.parse.quote(f"{title} {author}".strip()) + '&mailto=literature@example.com')
    try:
        data = _get_json(url)
    except Exception:
        return '', ''
    best, score = '', 0.0
    for item in (data.get('results') or []):
        cand = item.get('title') or item.get('display_name') or ''
        r = _similar(title, cand)
        if r > score:
            best, score = (item.get('doi') or ''), r
    if best and score >= min_ratio:
        return best.replace('https://doi.org/', ''), title
    return '', ''


JUNK_SUFFIX_RE = re.compile(
    r'(?:https?|orcid|figure|figs?|table|tab|scheme|schemes|eq|equation|section|refs?|references'
    r'|online|suppl|received|accepted|published|abstract|keywords|corresponding'
    r'|academic|editor|editorial|citation|copyright|licen[cs]e|citation).*$', re.I)
_today_verified: dict = {}


def verify_doi(doi: str, timeout: int = 15) -> bool:
    """Authoritative check: is the DOI registered (doi.org handle) or in Crossref?"""
    if not doi:
        return False
    if doi in _today_verified:
        return _today_verified[doi]
    ok = False
    try:
        data = _get_json('https://doi.org/api/handles/' + urllib.parse.quote(doi), timeout=timeout)
        ok = (data.get('responseCode') == 1) and bool(data.get('values'))
    except Exception:
        ok = bool(crossref_work(doi, timeout=timeout))
    _today_verified[doi] = ok
    return ok


def sanitize_doi(doi: str, text: str = '', timeout: int = 15) -> str:
    """Repair the common extraction artifacts, then accept only registered DOIs.

    - cut a trailing word glued to the suffix ("…011figure", "…011table")
    - de-glue a trailing year ("…0112010" -> "…011")
    - truncation: a DOI cut mid-suffix (e.g. "10.13228/j.boyuan.issn1001") is completed
      from the printed text, where the full string usually appears unsplit
    """
    if not doi:
        return ''
    doi = doi.strip().rstrip('.,;:')
    m = JUNK_SUFFIX_RE.search(doi)
    if m and m.start() > 12:
        doi = doi[:m.start()].rstrip('.,;:-_/')
    cands = [doi]
    m = re.match(r'^(.*\.\d{2})\d{4}$', doi)
    if m:
        cands.append(m.group(1))
    # the full DOI may sit in the text with the tail our regex clipped
    if text:
        compact = re.sub(r'\s+', '', normalize_text(text))
        for c in list(cands):
            tail = re.escape(c[-18:])
            m2 = re.search(tail + r'[A-Za-z0-9._;()/:\-]{0,24}', compact)
            if m2:
                cands.append(m2.group(0).rstrip('.,;:'))
    # 尾部粘连（年份/页码）时，逐步缩短再校验
    for c in list(cands):
        for cut in range(1, 6):
            if len(c) - cut > 10 and c[-cut].isdigit():
                cands.append(c[:-cut])
    for c in dict.fromkeys(cands):
        if c and verify_doi(c, timeout=timeout):
            return c
    return ''


def load_cache(path: Path | None = None) -> dict:
    path = Path(path or CACHE_PATH)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_cache(cache: dict, path: Path | None = None) -> None:
    path = Path(path or CACHE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')


CACHE_VERSION = 6  # bump when the resolution chain changes so cached DOIs are re-verified


def _cache_key(path: Path) -> str:
    try:
        st = path.stat()
        return f'v{CACHE_VERSION}|{path}|{st.st_size}'
    except OSError:
        return f'v{CACHE_VERSION}|{path}'


def pdf_doi(path: Path, title: str = '', author: str = '', cache: dict | None = None,
            allow_network: bool = True, pause: float = 0.25):
    """Resolve a DOI for `path` -> (doi, source). `source` in
    {filename, text, metadata, crossref, openalex, none}."""
    path = Path(path)
    key = _cache_key(path)
    if cache is not None and key in cache and cache[key].get('doi'):
        c = cache[key]
        if verify_doi(c['doi']):
            return c['doi'], c.get('source', 'cache')

    stem = path.stem
    m = re.match(r'^(10\.\d{4,9})_(.+?)(?:\.pdf)?$', stem, re.I)
    doi, source = '', 'none'
    if m:
        prefix, tail = m.group(1), m.group(2).rstrip('.')
        # 文件名里 '_' 代表 '/'；有的 DOI 含多级斜杠（10.1088/1757-899x/170/1/012027）
        cands = [f'{prefix}/{tail}', f'{prefix}/' + tail.replace('_', '/')]
        doi, source = cands[0], 'filename'
        for c in cands[1:]:
            if verify_doi(c):
                doi = c
                break
        if doi == cands[0] and not verify_doi(doi):
            doi = ''  # let the text/metadata chain repair or extend it
            source = 'none'
    if not doi:
        doi = pdf_doi_from_text(path)
        if doi:
            source = 'text'
    if not doi:
        doi = _meta_doi(path)
        if doi:
            source = 'metadata'
    if not doi:
        doi = doi_from_pii_text(f'{stem} {_meta_blob(path)}')
        if doi:
            source = 'publisher-id'
    if not doi:
        doi, _meta = doi_from_publisher_name(stem)
        if doi:
            source = 'publisher-id'
    if not doi:
        # 文本层缺失（CNKI 老刊）或 DOI 未印在文本层时，渲染首页做 OCR
        text = pdf_text(path, maxpages=2)
        doi = ocr_doi(path)
        if doi:
            source = 'ocr'
        else:
            doi = derived_doi(text + ' ' + (ocr_text(path) or ''))
            if doi:
                source = 'derived'
    if not doi and allow_network and title:
        for lookup, name in ((crossref_lookup, 'crossref'), (openalex_lookup, 'openalex')):
            doi, _ = lookup(title, author)
            if doi:
                source = name
                break
            time.sleep(pause)
        time.sleep(pause)

    if doi and source in ('text', 'metadata', 'ocr'):
        doi = sanitize_doi(doi, text=_src_text(path))
    if doi:
        doi = doi.lower() if not re.search(r'[\u4e00-\u9fff]', doi) else doi
    if cache is not None:
        cache[key] = {'doi': doi, 'source': source, 'title': title[:200]}
    return doi, source


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Resolve a DOI for one PDF or a directory tree.')
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--title', default='', help='bibliographic title for network lookup')
    ap.add_argument('--no-network', action='store_true')
    a = ap.parse_args()
    cache = load_cache()
    for raw in a.paths:
        p = Path(raw)
        targets = sorted(p.rglob('*.pdf')) if p.is_dir() else [p]
        for f in targets:
            d, src = pdf_doi(f, title=a.title, cache=cache, allow_network=not a.no_network)
            print(f'{src:9s} {d or "-":45s} {f.name[:60]}')
        save_cache(cache)
