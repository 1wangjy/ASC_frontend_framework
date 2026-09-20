#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/resource3.bib from the two extra ASC literature trees.

Sources:
  ASC_Papers_2/Research papers/*.pdf            (English, mostly DOI-named files)
  ASC_Papers_2/知网-*/**.pdf                     (Chinese, filename = 标题-作者.pdf)
  ASC_Papers/Research papers/*.pdf              (English, possibly duplicating the above)

Per PDF:
  - DOI: from the filename when it encodes one (10.1000_xxx.yyy -> 10.1000/xxx.yyy);
         otherwise from the PDF metadata / first-page text (best effort).
  - title/author: PDF metadata (/Title,/Author) when usable, else
         for Chinese files: filename split on the last '-' -> title / author;
         for English files: first non-trivial line of page 1 as a fallback.
  - file = {<absolute path>} so the importer links the existing PDF in place
    (no copy) and records it in lit_file.

Writes a biblatex-ish file with a `collection=r3` header. Idempotent; safe to re-run.
Usage: python3 backend_impl/scripts/build_resource3_bib.py [--out data/resource3.bib]
"""
import re, sys, argparse
from pathlib import Path

ROOTS = [
    "/mnt/e/Dingding_data/2026_05_11_literature_pipeline_v4/ASC_Papers_2",
    "/mnt/e/Dingding_data/2026_05_11_literature_pipeline_v4/ASC_Papers/Research papers",
]
DEFAULT_OUT = Path(__file__).resolve().parent.parent.parent / "data" / "resource3.bib"

DOI_FILE_RE = re.compile(r'^(10\.\d{4,9})_(.+?)(?:\.pdf)?$', re.IGNORECASE)
JUNK_TITLE = re.compile(r'^(untitled|microsoft word|document\d*|pdf|scan\d*|paper\d*)$', re.IGNORECASE)


def doi_from_filename(stem: str):
    m = DOI_FILE_RE.match(stem)
    if not m:
        return ''
    tail = m.group(2).rstrip('.').strip()
    doi = f"{m.group(1)}/{tail}"
    # a trailing duplicate dot (e.g. ..pdf) leaves a dangling '.' in some names
    return doi.rstrip('.')


def pdf_meta(path: Path):
    """(title, author, doi) from PDF metadata, best effort; never raises."""
    try:
        from pypdf import PdfReader
        r = PdfReader(str(path))
        info = r.metadata or {}
        title = str(info.get('/Title') or '').strip()
        author = str(info.get('/Author') or '').strip()
        doi = ''
        if len(r.pages):
            head = (r.pages[0].extract_text() or '')[:4000]
            m = re.search(r'10\.\d{4,9}/[-._;()/:A-Za-z0-9]+', head)
            if m:
                doi = m.group(0).rstrip('.').rstrip(')')
        if not title and len(r.pages):
            lines = [l.strip() for l in (r.pages[0].extract_text() or '').splitlines()]
            lines = [l for l in lines if 12 <= len(l) <= 200 and not re.match(r'^(abstract|keywords|introduction|摘要|关键词)', l, re.I)]
            title = lines[0] if lines else ''
        return title, author, doi
    except Exception:
        return '', '', ''


def split_cn_name(stem: str):
    """Chinese filename 标题-作者(.pdf) -> (title, author)."""
    parts = stem.rsplit('-', 1)
    if len(parts) == 2 and parts[1] and len(parts[1]) <= 30:
        return parts[0].strip(), parts[1].strip()
    return stem.strip(), ''


# NoDOI_first_downloads_1987_T_YOSHITOMI_<Title>  /  NO_DOI_...
DOWNLOADER_RE = re.compile(r'^no_?doi_[^_]+_(\d{4})_([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*)_([^_]+)_(.+)$', re.I)
# NoDOI_4339_Qiao 等 - 2021 - <Title>  /  NO_DOI_2702_Sá和Cardoso - 2009 - <Title>
ZOTERO_RE = re.compile(r'^no_?doi_\d+_(.+?)\s*[-–]\s*(\d{4})\s*[-–]\s*(.+)$', re.I)


def parse_pdf_name(stem: str):
    """-> (title, author, year). Handles the three naming styles in the sources."""
    s = stem.strip()
    m = ZOTERO_RE.match(s)
    if m:
        author = re.sub(r'\s*(等|and others|et al\.?)\s*$', '', m.group(1).strip())
        return m.group(3).strip().rstrip('.'), author, m.group(2)
    m = DOWNLOADER_RE.match(s)
    if m:
        year, initials, surname, title = m.groups()
        return title.strip().rstrip('.'), f"{initials} {surname}".strip(), year
    if re.search(r'[\u4e00-\u9fff]', s):
        title, author = split_cn_name(s)
        return title, author, ''
    return '', '', ''


def bib_escape(v: str):
    return v.replace('\\', ' ').replace('{', '(').replace('}', ')').replace('\n', ' ').strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(DEFAULT_OUT))
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    entries = []
    seen = {}          # dedupe key -> entry index (DOI first, else title|author)
    stats = {'pdf': 0, 'skipped': 0, 'cn': 0, 'en': 0, 'with_doi': 0,
             'title_from_meta': 0, 'title_unresolved': 0}
    for root in ROOTS:
        base = Path(root)
        if not base.exists():
            print('missing root:', root, file=sys.stderr)
            continue
        for path in sorted(base.rglob('*.pdf')):
            stats['pdf'] += 1
            stem = path.stem
            is_cn = bool(re.search(r'[\u4e00-\u9fff]', stem))

            meta_title, meta_author, meta_doi = pdf_meta(path)
            doi = doi_from_filename(stem) or meta_doi
            name_title, name_author, year = parse_pdf_name(stem)
            if is_cn:
                # 中文/无 DOI：文件名（知网 标题-作者、NoDOI 下载器/Zotero 命名）比内嵌元数据可靠
                title, author = name_title or meta_title, name_author or meta_author
                stats['cn'] += 1
            else:
                stats['en'] += 1
                title, author = meta_title, meta_author
                if meta_title:
                    stats['title_from_meta'] += 1
                elif meta_author:
                    author = meta_author
            if not title or JUNK_TITLE.match(title):
                title, stats['title_unresolved'] = name_title or stem, stats['title_unresolved'] + 1
            if doi:
                stats['with_doi'] += 1

            # 去重：DOI 优先，其次 标题+作者（跨树同文只留一条）
            dkey = doi.lower() if doi else re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', (title + author).lower())
            if dkey in seen:
                stats['skipped'] += 1
                continue
            seen[dkey] = len(entries)

            ekey = re.sub(r'[^0-9A-Za-z]+', '_', doi or stem)[:60] or f'res3_{len(entries)}'
            entries.append({
                'type': 'article', 'key': ekey, 'title': bib_escape(title),
                'author': bib_escape(author), 'doi': doi, 'year': year, 'file': str(path),
            })

    lines = [
        '% resource3.bib — Resource3 收集（中文知网 + 英文 Research papers）',
        '% 来源：ASC_Papers_2 (含 知网-* 中文目录) 与 ASC_Papers/Research papers',
        '% 标记：collection=r3；file= 指向本机原始 PDF（不复制）',
        f'% 生成：{len(entries)} 条（扫描 pdf {stats["pdf"]}，重复跳过 {stats["skipped"]}，'
        f'中文 {stats["cn"]} / 英文 {stats["en"]}，含 DOI {stats["with_doi"]}，'
        f'标题取自 PDF 元数据 {stats["title_from_meta"]}，未解析 {stats["title_unresolved"]}）',
        '',
    ]
    for e in entries:
        lines.append(f"@article{{{e['key']},")
        if e['title']:
            lines.append(f"  title = {{{e['title']}}},")
        if e['author']:
            lines.append(f"  author = {{{e['author']}}},")
        if e['doi']:
            lines.append(f"  doi = {{{e['doi']}}},")
        if e.get('year'):
            lines.append(f"  year = {{{e['year']}}},")
        lines.append(f"  file = {{{e['file']}}},")
        lines.append("}")
        lines.append('')
    out.write_text('\n'.join(lines), encoding='utf-8')
    print(f"wrote {out} :: {len(entries)} entries; {stats}")


if __name__ == '__main__':
    main()
