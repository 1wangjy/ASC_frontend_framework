#!/usr/bin/env node
'use strict';

/**
 * 逐条核验：文献原文是否真实、正确地进入了 MongoDB（及前端链路可用）。
 *
 * 检查项（每条文献/每个文件）：
 *  1. `lit_file.file_id` / `literature.file_id` 是否已回填；
 *  2. Mongo `file_meta` 是否存在（未软删）、`asc_files.files` 是否存在；
 *  3. **sha256 对账**：Mongo 记录 vs 本地原件（本地存在时）；
 *  4. **HTTP 可下载**：`GET /api/files/<file_id>/stream` 返回 200/206；
 *  5. **前端契约**：`GET /api/attachment/<attachment>` 返回 200/206（前端预览/下载用的就是这个 URL）；
 *  6. 孤儿：Mongo 里有、但没有任何 `lit_file` 引用的文件。
 *
 * 用法：
 *   node backend_impl/scripts/verify_literature_files.js                 # 全量
 *   node backend_impl/scripts/verify_literature_files.js --limit 50      # 抽样
 *   node backend_impl/scripts/verify_literature_files.js --skip-hash     # 跳过本地哈希（快）
 *   node backend_impl/scripts/verify_literature_files.js --json out.json # 报告落文件
 */

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { MongoClient, ObjectId } = require('mongodb');

const DB_PATH = path.join(__dirname, '..', 'data', 'sqlite', 'database.db');
const API = process.env.VERIFY_API_BASE || 'http://127.0.0.1:3001';

function parseArgs(argv) {
  const args = { limit: 0, skipHash: false, json: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i] || 0);
    else if (argv[i] === '--skip-hash') args.skipHash = true;
    else if (argv[i] === '--json') args.json = String(argv[++i] || '');
  }
  return args;
}

const all = (db, sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

function sha256File(file) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', () => resolve(null));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 本机 HTTP 一律走 curl `--noproxy '*'`（该环境设了 HTTP_PROXY，node fetch 会被打到代理） */
function httpStatus(url) {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync('curl', ['--noproxy', '*', '-s', '-o', '/dev/null', '-w', '%{http_code}',
    '-H', 'Range: bytes=0-0', '-m', '20', url], { encoding: 'utf8' });
  if (result.error) return `ERR:${result.error.message}`;
  const code = Number(String(result.stdout || '').trim());
  return Number.isFinite(code) && code > 0 ? code : `ERR:${result.stdout}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new sqlite3.Database(DB_PATH);
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform');
  await client.connect();
  const metaCol = client.db().collection('file_meta');
  const filesCol = client.db().collection('asc_files.files');

  let rows = await all(db, `
    SELECT f.id AS row_id, f.lit_id, f.kind, f.filename, f.path, f.storage, f.size, f.sha256 AS local_sha,
           f.file_id, l.attachment, l.doi, l.collection
      FROM lit_file f LEFT JOIN literature l ON l.lit_id = f.lit_id
     ORDER BY f.lit_id, f.id`);
  if (args.limit) rows = rows.slice(0, args.limit);

  const report = {
    checked_at: new Date().toISOString(),
    api: API,
    rows: rows.length,
    ok: 0,
    with_file_id: 0,
    missing_file_id: [],
    mongo_missing: [],
    gridfs_missing: [],
    hash_mismatch: [],
    stream_failed: [],
    attachment_failed: [],
    orphans: [],
    literature_rows: 0,
    literature_with_attachment: 0,
    literature_missing_file_id: [],
    literature_missing_mongo: [],
  };

  const seenFileIds = new Set();
  for (const row of rows) {
    const litFile = { lit_id: row.lit_id, filename: row.filename, kind: row.kind };
    if (!row.file_id) {
      report.missing_file_id.push(litFile);
      continue;
    }
    report.with_file_id += 1;
    seenFileIds.add(row.file_id);

    const meta = await metaCol.findOne({ file_id: row.file_id, deleted_at: null });
    if (!meta) { report.mongo_missing.push({ ...litFile, file_id: row.file_id }); continue; }
    const gridfs = await filesCol.findOne({ _id: meta.gridfs_id || new ObjectId(row.file_id) }, { projection: { length: 1 } });
    if (!gridfs) { report.gridfs_missing.push({ ...litFile, file_id: row.file_id }); continue; }

    if (!args.skipHash && row.path && fs.existsSync(row.path)) {
      const localHash = await sha256File(row.path);
      if (localHash && localHash !== meta.sha256) {
        report.hash_mismatch.push({ ...litFile, file_id: row.file_id, local: localHash, mongo: meta.sha256 });
        continue;
      }
    }

    const status = await httpStatus(`${API}/api/files/${row.file_id}/stream`);
    if (status !== 200 && status !== 206) {
      report.stream_failed.push({ ...litFile, file_id: row.file_id, status });
      continue;
    }
    report.ok += 1;
  }

  // 前端契约：有 attachment 的文献行 → /api/attachment/<filename>
  const litRows = await all(db, `
    SELECT lit_id, attachment, doi, file_id FROM literature
     WHERE COALESCE(attachment,'') <> '' ORDER BY lit_id`);
  report.literature_rows = litRows.length;
  report.literature_with_attachment = litRows.length;
  for (const lit of litRows) {
    if (!lit.file_id) report.literature_missing_file_id.push({ lit_id: lit.lit_id, attachment: lit.attachment });
    else {
      const meta = await metaCol.findOne({ file_id: lit.file_id, deleted_at: null }, { projection: { file_id: 1 } });
      if (!meta) report.literature_missing_mongo.push({ lit_id: lit.lit_id, file_id: lit.file_id });
    }
    const status = await httpStatus(`${API}/api/attachment/${encodeURIComponent(lit.attachment)}`);
    if (status !== 200 && status !== 206) {
      report.attachment_failed.push({ lit_id: lit.lit_id, attachment: lit.attachment, status });
    }
  }

  // 孤儿：Mongo 有、lit_file 无引用
  const allMeta = await metaCol.find({ deleted_at: null }, { projection: { file_id: 1, filename: 1, lit_id: 1, size: 1 } }).toArray();
  for (const item of allMeta) {
    if (!seenFileIds.has(item.file_id)) {
      report.orphans.push({ file_id: item.file_id, filename: item.filename, lit_id: item.lit_id, size: item.size });
    }
  }

  console.log('=== 核验汇总 ===');
  console.log(JSON.stringify({
    rows: report.rows,
    ok: report.ok,
    with_file_id: report.with_file_id,
    missing_file_id: report.missing_file_id.length,
    mongo_missing: report.mongo_missing.length,
    gridfs_missing: report.gridfs_missing.length,
    hash_mismatch: report.hash_mismatch.length,
    stream_failed: report.stream_failed.length,
    literature_rows: report.literature_rows,
    literature_missing_file_id: report.literature_missing_file_id.length,
    literature_missing_mongo: report.literature_missing_mongo.length,
    attachment_failed: report.attachment_failed.length,
    orphans: report.orphans.length,
  }, null, 2));
  for (const key of ['missing_file_id', 'mongo_missing', 'gridfs_missing', 'hash_mismatch', 'stream_failed', 'literature_missing_file_id', 'literature_missing_mongo', 'attachment_failed', 'orphans']) {
    if (report[key].length) console.log(`\n--- ${key}（前 5）---\n`, JSON.stringify(report[key].slice(0, 5), null, 2));
  }
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n报告已写入 ${args.json}`);
  }

  await client.close();
  await new Promise((resolve) => db.close(resolve));
}

main().catch((error) => {
  console.error('核验失败：', error);
  process.exitCode = 1;
});
