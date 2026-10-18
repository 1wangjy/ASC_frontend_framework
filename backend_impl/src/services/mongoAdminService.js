'use strict';

/**
 * MongoDB 可视化管理后端（只读浏览 + 索引管理 + 聚合统计）。
 *
 * 设计约束（安全）：
 * - 禁止 `$where` / `$function` / `$accumulator`（可在服务端执行脚本）；
 * - 聚合禁止 `$out` / `$merge`（会写库）；
 * - 查询强制分页上限（`limit ≤ 200`）、聚合输出上限 500；
 * - 集合名白名单校验，拒绝 `system.*`；
 * - 不提供任意文档删除/写入（文件删除走 `/api/files/:id` 的统一语义）。
 */

const { ObjectId } = require('mongodb');
const fileStore = require('./fileStoreService');

const MAX_LIMIT = 200;
const MAX_AGGREGATE = 500;
const DANGEROUS_OPERATORS = new Set(['$where', '$function', '$accumulator']);
const WRITE_STAGES = new Set(['$out', '$merge']);
const COLLECTION_RE = /^[A-Za-z0-9_][A-Za-z0-9_.$-]{0,119}$/;
const DEFAULT_FILE_SEARCH_FIELDS = ['filename', 'doi', 'doi_key', 'lit_id', 'aliases'];

function assertCollectionName(name) {
  const value = String(name || '').trim();
  if (!COLLECTION_RE.test(value) || value.startsWith('system.')) {
    const error = new Error('非法集合名');
    error.status = 400;
    throw error;
  }
  return value;
}

/** 递归检查 filter/pipeline 中的危险操作符（读取型操作符放行）。 */
function assertSafeQuery(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeQuery(item, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_OPERATORS.has(key)) {
      const error = new Error(`不允许的操作符：${key}`);
      error.status = 400;
      throw error;
    }
    assertSafeQuery(child, depth + 1);
  }
}

function clampLimit(value, fallback = 50, max = MAX_LIMIT) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

/** BSON → 纯 JSON（ObjectId/Date/二进制/Long 等），并限制单文档体积。 */
function toJsonSafe(value, depth = 0) {
  if (depth > 8) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[binary ${value.length}B]`;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => toJsonSafe(item, depth + 1));
    if (value.length > 100) items.push(`…(+${value.length - 100})`);
    return items;
  }
  if (typeof value === 'object') {
    // Long / Decimal128 / Binary 等驱动类型：优先用 toString 摘要
    if (typeof value._bsontype === 'string') {
      if (value._bsontype === 'Binary') return `[binary ${value.length?.()}B]`;
      if (typeof value.toString === 'function') return value.toString();
    }
    const out = {};
    let index = 0;
    for (const [key, child] of Object.entries(value)) {
      if (index++ >= 80) { out['…'] = '(+more fields)'; break; }
      out[key] = toJsonSafe(child, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 4000) return `${value.slice(0, 4000)}…(${value.length} chars)`;
  return value;
}

async function getDb() {
  return fileStore.getDb();
}

let statusCache = { at: 0, value: null };

/** 服务器与库的总览信息（10s 缓存；避免每次刷新都做全库统计） */
async function status() {
  if (statusCache.value && Date.now() - statusCache.at < 10000) return statusCache.value;
  const db = await getDb();
  const admin = db.admin();
  const buildInfo = await admin.command({ buildInfo: 1 }).catch(() => ({}));
  const serverStatus = await admin.command({ serverStatus: 1 }).catch(() => ({}));
  const dbStats = await db.command({ dbStats: 1 }).catch(() => ({}));
  const collections = await db.listCollections().toArray();
  const buckets = new Set();
  for (const item of collections) {
    if (item.name.endsWith('.files')) buckets.add(item.name.slice(0, -'.files'.length));
  }
  const bucketStats = [];
  for (const name of buckets) {
    const files = await db.collection(`${name}.files`).countDocuments().catch(() => 0);
    const agg = await db.collection(`${name}.files`).aggregate([{ $group: { _id: null, bytes: { $sum: '$length' } } }]).toArray().catch(() => []);
    const chunks = await db.collection(`${name}.chunks`).countDocuments().catch(() => 0);
    bucketStats.push({ name, files, chunks, bytes: agg[0]?.bytes || 0 });
  }
  const meta = await fileStore.stats().catch(() => null);
  const out = {
    db: db.databaseName,
    version: buildInfo.version || null,
    uptime_seconds: serverStatus.uptime || null,
    collections: collections.length,
    objects: dbStats.objects || null,
    data_size: dbStats.dataSize || null,
    storage_size: dbStats.storageSize || null,
    indexes: dbStats.indexes || null,
    buckets: bucketStats,
    file_meta: meta,
  };
  statusCache = { at: Date.now(), value: out };
  return out;
}

/** 集合列表（含文档数/体积/索引数） */
async function listCollections() {
  const db = await getDb();
  const items = await db.listCollections().toArray();
  const out = [];
  for (const item of items) {
    let count = null;
    let size = null;
    let indexCount = null;
    try {
      count = await db.collection(item.name).estimatedDocumentCount();
      const stats = await db.command({ collStats: item.name });
      size = stats.size || null;
      indexCount = stats.nindexes || null;
    } catch { /* view 或统计不可用 */ }
    out.push({
      name: item.name,
      type: item.type || 'collection',
      count,
      size,
      indexes: indexCount,
      is_gridfs: /\.(files|chunks)$/.test(item.name),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 采样集合的可搜索字符串字段（用于无字段指定的关键词搜索） */
async function sampleSearchFields(collection) {
  const db = await getDb();
  const sample = await db.collection(collection).find({}).limit(20).toArray();
  const fields = new Set();
  for (const doc of sample) {
    for (const [key, value] of Object.entries(doc)) {
      if (typeof value === 'string' && !fields.has(key) && !key.startsWith('_')) fields.add(key);
    }
  }
  return [...fields].slice(0, 12);
}

/** 文档查询（分页 + 关键词 + 过滤/排序） */
async function find(collection, options = {}) {
  const name = assertCollectionName(collection);
  const db = await getDb();
  const col = db.collection(name);
  const limit = clampLimit(options.limit, 50);
  const skip = Math.max(0, Number(options.skip) || 0);
  const filter = options.filter && typeof options.filter === 'object' ? options.filter : {};
  assertSafeQuery(filter);

  let effectiveFilter = filter;
  const keyword = String(options.q || '').trim();
  if (keyword) {
    const fields = Array.isArray(options.qFields) && options.qFields.length
      ? options.qFields.map(String)
      : await sampleSearchFields(name);
    if (!fields.length) fields.push('_id');
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const or = fields.map((field) => ({ [field]: regex }));
    effectiveFilter = Object.keys(filter).length ? { $and: [filter, { $or: or }] } : { $or: or };
  }

  const sort = options.sort && typeof options.sort === 'object' ? options.sort : { _id: -1 };
  let cursor = col.find(effectiveFilter).sort(sort).skip(skip).limit(limit);
  if (options.projection && typeof options.projection === 'object') cursor = cursor.project(options.projection);
  const docs = await cursor.toArray();
  const total = await col.countDocuments(effectiveFilter);
  return {
    collection: name,
    docs: docs.map((doc) => toJsonSafe(doc)),
    total,
    limit,
    skip,
    search_fields: keyword ? (options.qFields?.length ? options.qFields : await sampleSearchFields(name)) : [],
  };
}

async function listIndexes(collection) {
  const name = assertCollectionName(collection);
  const db = await getDb();
  const indexes = await db.collection(name).indexes();
  return indexes.map((index) => ({
    name: index.name,
    keys: index.key,
    unique: Boolean(index.unique),
    sparse: Boolean(index.sparse),
    partialFilterExpression: index.partialFilterExpression || null,
    hidden: Boolean(index.hidden),
  }));
}

async function createIndex(collection, payload = {}) {
  const name = assertCollectionName(collection);
  const keys = payload.keys && typeof payload.keys === 'object' ? payload.keys : null;
  if (!keys || !Object.keys(keys).length) {
    const error = new Error('缺少索引字段（keys）'); error.status = 400; throw error;
  }
  for (const value of Object.values(keys)) {
    if (![1, -1, 'text', 'hashed'].includes(value)) {
      const error = new Error('索引方向仅支持 1 / -1 / "text" / "hashed"'); error.status = 400; throw error;
    }
  }
  const options = { name: payload.name || undefined };
  if (payload.unique) options.unique = true;
  if (payload.sparse) options.sparse = true;
  if (!options.name) delete options.name;
  const db = await getDb();
  const indexName = await db.collection(name).createIndex(keys, options);
  return { collection: name, index: indexName };
}

async function dropIndex(collection, indexName) {
  const name = assertCollectionName(collection);
  const target = String(indexName || '').trim();
  if (!target || target === '_id_') {
    const error = new Error('不能删除 _id 索引'); error.status = 400; throw error;
  }
  const db = await getDb();
  await db.collection(name).dropIndex(target);
  return { collection: name, dropped: target };
}

async function aggregate(collection, payload = {}) {
  const name = assertCollectionName(collection);
  const pipeline = Array.isArray(payload.pipeline) ? payload.pipeline : [];
  if (!pipeline.length) {
    const error = new Error('缺少聚合管道'); error.status = 400; throw error;
  }
  for (const stage of pipeline) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      const error = new Error('聚合阶段格式不合法'); error.status = 400; throw error;
    }
    const op = Object.keys(stage)[0];
    if (WRITE_STAGES.has(op)) {
      const error = new Error(`聚合不允许写库阶段：${op}`); error.status = 400; throw error;
    }
    assertSafeQuery(stage);
  }
  const limit = clampLimit(payload.limit, 100, MAX_AGGREGATE);
  const db = await getDb();
  const rows = await db.collection(name).aggregate([...pipeline, { $limit: limit }]).toArray();
  return { collection: name, rows: rows.map((row) => toJsonSafe(row)), limit };
}

/** 文件导航：file_meta 列表（关键词/可见性/类型/文献/DOI） */
async function listFiles(options = {}) {
  const db = await getDb();
  const limit = clampLimit(options.limit, 30);
  const skip = Math.max(0, Number(options.skip) || 0);
  const filter = { deleted_at: options.includeDeleted ? undefined : null };
  if (options.visibility) filter.visibility = String(options.visibility);
  if (options.kind) filter.kind = String(options.kind);
  if (options.litId) filter.lit_id = String(options.litId);
  if (options.doi) filter.doi_key = fileStore.normalizeDoi(options.doi);
  if (filter.deleted_at === undefined) delete filter.deleted_at;

  const keyword = String(options.q || '').trim();
  if (keyword) {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = DEFAULT_FILE_SEARCH_FIELDS.map((field) => ({ [field]: regex }));
  }

  const col = db.collection(fileStore.META);
  const [items, total, kinds, visibilities, bytes] = await Promise.all([
    col.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
    col.aggregate([{ $match: filter }, { $group: { _id: '$kind', n: { $sum: 1 }, bytes: { $sum: '$size' } } }, { $sort: { n: -1 } }]).toArray(),
    col.aggregate([{ $match: filter }, { $group: { _id: '$visibility', n: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $match: filter }, { $group: { _id: null, bytes: { $sum: '$size' } } }]).toArray(),
  ]);

  return {
    items: items.map((doc) => ({
      file_id: doc.file_id,
      filename: doc.filename,
      kind: doc.kind,
      mime: doc.mime,
      size: doc.size,
      sha256: doc.sha256,
      doi: doc.doi,
      lit_id: doc.lit_id,
      visibility: doc.visibility,
      source: doc.source,
      aliases: Array.isArray(doc.aliases) ? doc.aliases : [],
      created_at: doc.created_at,
      deleted_at: doc.deleted_at,
      stream_url: `/api/files/${doc.file_id}/stream`,
    })),
    total,
    limit,
    skip,
    totals: {
      bytes: bytes[0]?.bytes || 0,
      by_kind: Object.fromEntries(kinds.map((row) => [row._id || 'unknown', { n: row.n, bytes: row.bytes }])),
      by_visibility: Object.fromEntries(visibilities.map((row) => [row._id || 'unknown', row.n])),
    },
  };
}

/** GridFS bucket 浏览：文件列表（支持按 bucket 名） */
async function listBucketFiles(bucket, options = {}) {
  const db = await getDb();
  const bucketName = String(bucket || fileStore.BUCKET).trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,80}$/.test(bucketName)) {
    const error = new Error('非法 bucket 名'); error.status = 400; throw error;
  }
  const limit = clampLimit(options.limit, 30);
  const skip = Math.max(0, Number(options.skip) || 0);
  const filter = {};
  if (options.q) {
    filter.filename = new RegExp(String(options.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const col = db.collection(`${bucketName}.files`);
  const [items, total, agg] = await Promise.all([
    col.find(filter).sort({ uploadDate: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
    col.aggregate([{ $match: filter }, { $group: { _id: null, bytes: { $sum: '$length' } } }]).toArray(),
  ]);
  return {
    bucket: bucketName,
    items: items.map((file) => ({
      id: file._id?.toString?.() || String(file._id),
      filename: file.filename,
      length: file.length,
      uploadDate: file.uploadDate,
      contentType: file.contentType || file.metadata?.contentType || null,
      metadata: toJsonSafe(file.metadata || {}),
    })),
    total,
    limit,
    skip,
    bytes: agg[0]?.bytes || 0,
  };
}

module.exports = {
  MAX_LIMIT,
  assertCollectionName,
  assertSafeQuery,
  clampLimit,
  toJsonSafe,
  status,
  listCollections,
  find,
  listIndexes,
  createIndex,
  dropIndex,
  aggregate,
  listFiles,
  listBucketFiles,
};
