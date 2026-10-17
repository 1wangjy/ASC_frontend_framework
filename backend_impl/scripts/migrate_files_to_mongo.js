#!/usr/bin/env node
'use strict';

/**
 * 存量文献原文迁移：SQLite `lit_file` → MongoDB GridFS `asc_files` + `file_meta`。
 *
 * - 逐文件流式上传（不整文件读入内存），边传边算 sha256；
 * - 幂等：`lit_file.file_id` 已存在且 Mongo 里可达则跳过（`--force` 可强制重传）；
 * - 去重：内容相同（sha256）/ 同 DOI 同类型（doi_key+kind）时复用既有文件，并把该 `lit_file` 指向复用记录；
 * - 默认 `visibility='public'`（用户要求：文献默认 public）；`source='migration'`，`source_path` 留原本地路径；
 * - 回写：`lit_file.file_id` + `storage='mongo'`；`literature.file_id` = 该文献的主文件（优先与 attachment 同名的 PDF）；
 * - 输出 JSON 报告（含缺失清单），便于对账。
 *
 * 用法：
 *   node backend_impl/scripts/migrate_files_to_mongo.js --dry-run
 *   node backend_impl/scripts/migrate_files_to_mongo.js --apply
 *   node backend_impl/scripts/migrate_files_to_mongo.js --apply --limit 20
 *   node backend_impl/scripts/migrate_files_to_mongo.js --apply --only LIT000001
 */

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const fileStore = require('../src/services/fileStoreService');

const DB_PATH = path.join(__dirname, '..', 'data', 'sqlite', 'database.db');

function parseArgs(argv) {
  const args = { apply: false, force: false, limit: 0, only: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    else if (token === '--dry-run') args.apply = false;
    else if (token === '--force') args.force = true;
    else if (token === '--limit') args.limit = Number(argv[++i] || 0);
    else if (token === '--only') args.only = String(argv[++i] || '');
  }
  return args;
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new sqlite3.Database(DB_PATH);
  const where = ['1=1'];
  const params = [];
  if (args.only) { where.push('f.lit_id = ?'); params.push(args.only); }
  const rows = await all(db, `
    SELECT f.id AS file_row_id, f.lit_id, f.kind, f.filename, f.path, f.storage, f.size, f.sha256,
           f.mime, f.file_id AS existing_file_id,
           l.doi, l.title, l.collection, l.attachment
      FROM lit_file f JOIN literature l ON l.lit_id = f.lit_id
     WHERE ${where.join(' AND ')}
     ORDER BY f.lit_id, CASE f.kind WHEN 'pdf' THEN 0 ELSE 1 END, f.id`, params);
  const targets = args.limit ? rows.slice(0, args.limit) : rows;
  console.log(`待处理 lit_file 行：${targets.length}${args.limit ? `（总数 ${rows.length}，--limit ${args.limit}）` : ''}`);

  const report = {
    mode: args.apply ? 'APPLY' : 'DRY-RUN',
    rows: targets.length,
    uploaded: 0, deduped: 0, skipped: 0, missing: 0, errors: 0,
    bytes: 0,
    missing_paths: [],
    error_list: [],
    collection_stats: {},
    file_ids: {},
  };

  for (let index = 0; index < targets.length; index += 1) {
    const row = targets[index];
    const tag = `${row.lit_id}/${row.kind}/${row.filename}`;
    const bucket = (report.collection_stats[row.collection || ''] = report.collection_stats[row.collection || ''] || { rows: 0, uploaded: 0, deduped: 0, skipped: 0 });
    bucket.rows += 1;

    if (!args.force && row.existing_file_id) {
      const exists = await fileStore.findById(row.existing_file_id).catch(() => null);
      if (exists) { report.skipped += 1; bucket.skipped += 1; continue; }
    }
    if (!row.path || !fs.existsSync(row.path)) {
      report.missing += 1;
      report.missing_paths.push({ lit_id: row.lit_id, filename: row.filename, path: row.path });
      continue;
    }
    if (!args.apply) {
      const size = fs.statSync(row.path).size;
      report.bytes += size;
      report.uploaded += 1;
      bucket.uploaded += 1;
      continue;
    }

    try {
      const result = await fileStore.uploadStream(fs.createReadStream(row.path), {
        filename: row.filename,
        mime: row.mime || undefined,
        kind: row.kind,
        doi: row.doi || '',
        litId: row.lit_id,
        visibility: 'public',
        source: 'migration',
        sourcePath: row.path,
      });
      report.bytes += Number(result.size) || 0;
      if (result.deduped) { report.deduped += 1; bucket.deduped += 1; } else { report.uploaded += 1; bucket.uploaded += 1; }
      report.file_ids[row.lit_id] = report.file_ids[row.lit_id] || [];
      report.file_ids[row.lit_id].push({ kind: row.kind, file_id: result.file_id, filename: row.filename });
      await run(db, `UPDATE lit_file SET file_id = ?, storage = 'mongo' WHERE id = ?`, [result.file_id, row.file_row_id]);
    } catch (error) {
      report.errors += 1;
      report.error_list.push({ lit_id: row.lit_id, filename: row.filename, error: error.message });
    }
    if ((index + 1) % 200 === 0) {
      console.log(`  … ${index + 1}/${targets.length}｜uploaded ${report.uploaded}｜deduped ${report.deduped}｜errors ${report.errors}`);
    }
  }

  if (args.apply) {
    // literature.file_id = 主文件（优先 attachment 同名 PDF，否则首个 PDF，其次首个文件）
    const litIds = [...new Set(targets.map((row) => row.lit_id))];
    for (const litId of litIds) {
      const files = await all(db, `SELECT kind, filename, file_id FROM lit_file WHERE lit_id = ? AND file_id IS NOT NULL`, [litId]);
      if (!files.length) continue;
      const attachment = (await all(db, `SELECT attachment FROM literature WHERE lit_id = ?`, [litId]))[0]?.attachment || '';
      const primary = files.find((f) => f.kind === 'pdf' && f.filename === attachment)
        || files.find((f) => f.kind === 'pdf')
        || files[0];
      await run(db, `UPDATE literature SET file_id = ? WHERE lit_id = ?`, [primary.file_id, litId]);
    }
  }

  delete report.file_ids;
  console.log('\n=== 报告 ===');
  console.log(JSON.stringify(report, null, 2));
  await new Promise((resolve) => db.close(resolve));
  await fileStore.close();
}

main().catch(async (error) => {
  console.error('迁移失败：', error);
  process.exitCode = 1;
});
