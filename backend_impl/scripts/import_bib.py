#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import a .bib into the ASC literature library (SQLite) + index its local pdf/md.

Decisions (per file-management plan):
  D1 local folder storage; D3 files under backend_impl/data/files/; D4 doi-first
  idempotency; D5 allow pdf/md/any (not pdf-only).

Matching for each entry:
  1) explicit BibTeX `file = {...}` (supports `a.pdf:b.pdf`, `a.pdf;b.md`, braces),
     resolved relative to the .bib directory;
  2) DOI-based filename match inside --roots: doi with '/',':','(',')',' ' → '_',
     matched against filenames like `100_10.1111_jace.19363.pdf|.md`.
Storage:
  default  reference-only  (record path + index row, NO copy)
  --copy   copies files into <store-root>/<lit_id>/<file>

Idempotent: key = normalized doi; else sha1(title+authors+year); else citation key.
Table lit_file(lit_id,kind,filename,path,storage,size,sha256,mime,source) is created
if missing.

Usage:
  python3 backend_impl/scripts/import_bib.py /mnt/e/pdfs/ref_20260911.bib            # dry-run
  python3 backend_impl/scripts/import_bib.py <bib> --apply                           # reference import
  python3 backend_impl/scripts/import_bib.py <bib> --apply --copy                    # copy into data/files
  python3 backend_impl/scripts/import_bib.py <bib> --apply --roots /mnt/e/pdfs/asc_01,/mnt/e/pdfs/asc_02
"""
import sys, os, re, json, sqlite3, hashlib, shutil, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DB_DEFAULT = HERE.parent / "data" / "sqlite" / "database.db"
STORE_DEFAULT = HERE.parent / "data" / "files"
ROOTS_DEFAULT = ["/mnt/e/pdfs/asc_01", "/mnt/e/pdfs/asc_02", "/mnt/e/pdfs/ASC_Handbook"]

LIT_FILE_DDL = """
CREATE TABLE IF NOT EXISTS lit_file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lit_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- pdf | md | other
  filename TEXT NOT NULL,
  path TEXT NOT NULL,               -- source path (reference) or stored rel path (copy)
  storage TEXT NOT NULL,            -- ref | local
  size INTEGER,
  sha256 TEXT,
  mime TEXT,
  source TEXT,                      -- bib | manual
  create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lit_id, kind, filename)
);
CREATE INDEX IF NOT EXISTS idx_lit_file_lit ON lit_file(lit_id);
CREATE INDEX IF NOT EXISTS idx_lit_file_sha ON lit_file(sha256);
"""


# ───────────────────────── BibTeX parser (tolerant) ─────────────────────────
def _read_braced(s, i):
    """s[i] == '{'; return (content, next_index) with balanced braces."""
    depth = 0
    start = i
    while i < len(s):
        c = s[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return s[start + 1:i], i + 1
        i += 1
    return s[start + 1:], i


def parse_bib(text):
    entries = []
    i = 0
    n = len(text)
    while True:
        at = text.find('@', i)
        if at < 0:
            break
        m = re.match(r'@(\w+)\s*\{', text[at:])
        if not m:
            i = at + 1
            continue
        etype = m.group(1).lower()
        body_start = at + m.end()          # after '{'
        # key up to first comma
        comma = text.find(',', body_start)
        if comma < 0:
            break
        key = text[body_start:comma].strip()
        # parse fields until matching close brace of the entry
        depth = 1
        j = comma + 1
        while j < n and depth > 0:
            c = text[j]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            j += 1
        body = text[comma + 1:j - 1]
        fields = {}
        for fm in re.finditer(r'([A-Za-z][A-Za-z0-9_]*)\s*=\s*', body):
            name = fm.group(1).lower()
            k = fm.end()
            if k >= len(body):
                break
            if body[k] == '{':
                val, _ = _read_braced(body, k)
            elif body[k] == '"':
                end = body.find('"', k + 1)
                val = body[k + 1:end] if end > 0 else body[k + 1:]
            else:
                end = body.find(',', k)
                val = body[k:end if end > 0 else len(body)]
            # biblatex 用 {..}/{..} 保护大小写与间距：入库前去掉花括号，压缩空白
            cleaned = re.sub(r'[{}]', '', val)
            fields[name] = re.sub(r'\s+', ' ', cleaned).strip()
        entries.append({'type': etype, 'key': key, 'fields': fields})
        i = j
    return entries


def clean_authors(raw):
    if not raw:
        return ''
    raw = re.sub(r'[{}\\]', '', raw)
    parts = [p.strip() for p in re.split(r'\s+and\s+', raw) if p.strip()]
    return '; '.join(parts)


def norm_doi(doi):
    return (doi or '').strip().lower().rstrip('.')


def doi_to_fname(doi):
    return re.sub(r'[^0-9a-zA-Z\.\-]', '_', norm_doi(doi))


# ───────────────────────── file matching ─────────────────────────
def scan_roots(roots):
    """Return (by_name, by_token). by_token keys the DOI-encoded part of
    filenames shaped '<seq>_<encoded-doi>.<ext>' (exact match to doi_to_fname)."""
    by_name = {}
    by_token = {}
    for r in roots:
        p = Path(r)
        if not p.is_dir():
            continue
        for f in p.iterdir():
            if not f.is_file():
                continue
            by_name.setdefault(f.name.lower(), f)
            m = re.match(r'^\d+_(.+?)\.(pdf|md|txt|docx|rtf|other)$', f.name, re.IGNORECASE)
            if m:
                by_token.setdefault(m.group(1).lower(), []).append(f)
    return by_name, by_token


def match_entry(entry, by_name, by_token, roots):
    """Return list of (kind, Path)."""
    f = entry['fields']
    out = []
    # 1) explicit file field
    for key in ('file', 'attachment', 'pdf', 'local'):
        if key in f and f[key]:
            for part in re.split(r'[;|]', f[key]):
                part = part.strip().strip('{}')
                part = re.sub(r'^.*?:', '', part)   # strip 'desc:' prefix
                if not part:
                    continue
                cand = Path(part)
                if not cand.is_absolute():
                    cand = Path(entry['_bibdir']) / part
                if cand.is_file():
                    out.append((cand.suffix.lstrip('.').lower() or 'other', cand))
    if out:
        return out
    # 2) doi-based EXACT filename-token match
    doi = norm_doi(f.get('doi', ''))
    if doi:
        enc = doi_to_fname(doi).lower()
        for p in by_token.get(enc, []):
            kind = p.suffix.lstrip('.').lower() or 'other'
            out.append((kind, p))
    return out


def mime_of(kind):
    return {'pdf': 'application/pdf', 'md': 'text/markdown',
            'txt': 'text/plain', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}.get(kind, 'application/octet-stream')


def sha256_file(p, limit=None):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def normalize_text(value):
    """归一化：小写 + 仅保留字母数字与 CJK（用于无 DOI 条目的去重键）。"""
    return re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', (value or '').lower())


def dedupe_key_of(doi, title, authors, year):
    """DOI 优先；无 DOI（中文文献常见）时用 归一化(标题|作者|年份) 的 sha1。"""
    if doi:
        return 'doi:' + doi
    raw = '%s|%s|%s' % (normalize_text(title), normalize_text(authors), year or '')
    return 't:' + hashlib.sha1(raw.encode('utf-8')).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bib')
    ap.add_argument('--db', default=str(DB_DEFAULT))
    ap.add_argument('--store-root', default=str(STORE_DEFAULT))
    ap.add_argument('--roots', default=','.join(ROOTS_DEFAULT))
    ap.add_argument('--collection', default='', help='collection 标记（如 aug / sep），写入 literature.collection')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--copy', action='store_true')
    args = ap.parse_args()

    bibdir = str(Path(args.bib).resolve().parent)
    text = open(args.bib, encoding='utf-8', errors='ignore').read()
    entries = parse_bib(text)
    for e in entries:
        e['_bibdir'] = bibdir
    roots = [r for r in args.roots.split(',') if r.strip()]
    by_name, by_token = scan_roots(roots)

    conn = sqlite3.connect(args.db)
    conn.executescript(LIT_FILE_DDL)
    cur = conn.cursor()
    cols = [r[1] for r in cur.execute('PRAGMA table_info(literature)').fetchall()]
    if 'collection' not in cols:
        cur.execute('ALTER TABLE literature ADD COLUMN collection TEXT')
        print('added literature.collection column')
    if 'dedupe_key' not in cols:
        cur.execute('ALTER TABLE literature ADD COLUMN dedupe_key TEXT')
        print('added literature.dedupe_key column')
    # 性能：DOI 查找需索引（否则每条目全表扫描 O(n^2)）+ 预载现有 DOI->lit_id
    cur.execute('CREATE INDEX IF NOT EXISTS idx_literature_doi ON literature(lower(doi))')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_literature_collection ON literature(collection)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_literature_dedupe_key ON literature(dedupe_key)')
    cur.execute("UPDATE literature SET dedupe_key = 'doi:' || lower(doi) "
                "WHERE (dedupe_key IS NULL OR dedupe_key = '') AND doi IS NOT NULL AND doi <> ''")
    existing_by_dedupe = {}
    for row in cur.execute("SELECT dedupe_key, lit_id FROM literature WHERE dedupe_key IS NOT NULL AND dedupe_key <> '' AND is_delete=0").fetchall():
        existing_by_dedupe.setdefault(row[0], row[1])
    existing_by_doi = {}
    for row in cur.execute("SELECT lower(doi), lit_id FROM literature WHERE doi IS NOT NULL AND doi <> '' AND is_delete=0").fetchall():
        if row[0]:
            existing_by_doi.setdefault(row[0], row[1])
    # next lit_id sequence
    row = cur.execute("SELECT COALESCE(MAX(CAST(substr(lit_id,4) AS INTEGER)),0) FROM literature WHERE lit_id LIKE 'LIT%'").fetchone()
    seq = row[0] if row else 0

    collection = (args.collection or '').strip()
    stats = {'entries': len(entries), 'matched': 0, 'pdf': 0, 'md': 0, 'unmatched': 0,
             'inserted': 0, 'updated': 0, 'files': 0}
    unmatched_keys = []

    for e in entries:
        f = e['fields']
        doi = norm_doi(f.get('doi', ''))
        title = f.get('title', '').strip()
        authors = clean_authors(f.get('author', ''))
        year = None
        try:
            year = int(re.sub(r'\D', '', f.get('year', ''))[:4]) if f.get('year') else None
        except Exception:
            year = None

        files = match_entry(e, by_name, by_token, roots)
        if files:
            stats['matched'] += 1
            for kind, _ in files:
                if kind in ('pdf', 'md'):
                    stats[kind] += 1
        else:
            stats['unmatched'] += 1
            unmatched_keys.append(e['key'])

        if not args.apply:
            continue

        # 幂等键：DOI 优先，无 DOI 时 标题+作者+年份 归一化哈希（中文文献去重）
        dedupe_key = dedupe_key_of(doi, title, authors, year)
        existing = None
        if doi:
            existing = existing_by_doi.get(doi)
        if not existing:
            existing = existing_by_dedupe.get(dedupe_key)
        if existing:
            lit_id = existing
            stats['updated'] += 1
        else:
            seq += 1
            lit_id = 'LIT%06d' % seq
            stats['inserted'] += 1
            if doi:
                existing_by_doi[doi] = lit_id
        existing_by_dedupe[dedupe_key] = lit_id

        primary = None
        if files:
            # prefer pdf as the literature.attachment
            pdfs = [p for k, p in files if k == 'pdf']
            primary = (pdfs[0] if pdfs else files[0][1]).name

        cur.execute(
            """INSERT INTO literature (lit_id,title,authors,journal,year,volume,number,pages,doi,
                                       abstract,note,entry_type,attachment,collection,dedupe_key,
                                       create_time,update_time,is_delete)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0)
               ON CONFLICT(lit_id) DO UPDATE SET
                 title=excluded.title, authors=excluded.authors, journal=excluded.journal, year=excluded.year,
                 volume=excluded.volume, number=excluded.number, pages=excluded.pages, doi=excluded.doi,
                 abstract=excluded.abstract, note=excluded.note, entry_type=excluded.entry_type,
                 attachment=COALESCE(literature.attachment, excluded.attachment),
                 collection=COALESCE(NULLIF(literature.collection,''), excluded.collection),
                 update_time=CURRENT_TIMESTAMP""",
            (lit_id, title, authors, f.get('journal') or f.get('journaltitle') or '', year,
             f.get('volume', ''), f.get('number', ''), f.get('pages', ''), f.get('doi', ''),
             f.get('abstract', ''), f.get('note', ''), e['type'], primary, collection, dedupe_key))

        if args.apply and (stats['inserted'] + stats['updated']) % 500 == 0:
            conn.commit()
        for kind, p in files:
            if args.copy:
                dest_dir = Path(args.store_root) / lit_id
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / p.name
                if not dest.exists():
                    shutil.copy2(p, dest)
                stored_path = str(dest.relative_to(Path(args.store_root)))
                storage = 'local'
                size = dest.stat().st_size
            else:
                stored_path = str(p)
                storage = 'ref'
                size = p.stat().st_size
            cur.execute(
                """INSERT INTO lit_file (lit_id,kind,filename,path,storage,size,mime,source)
                   VALUES (?,?,?,?,?,?,?, 'bib')
                   ON CONFLICT(lit_id,kind,filename) DO UPDATE SET
                     path=excluded.path, storage=excluded.storage, size=excluded.size,
                     mime=excluded.mime, sha256=NULL""",
                (lit_id, kind, p.name, stored_path, storage, size, mime_of(kind)))
            stats['files'] += 1

    if args.apply:
        conn.commit()

    print(json.dumps(stats, ensure_ascii=False))
    if unmatched_keys:
        print('unmatched (first 20):', unmatched_keys[:20])
    print('collection:', collection or '(none)', '| mode:', 'APPLY' if args.apply else 'DRY-RUN', '| copy:', args.copy,
          '| roots:', roots, '| db:', args.db)
    conn.close()


if __name__ == '__main__':
    main()
