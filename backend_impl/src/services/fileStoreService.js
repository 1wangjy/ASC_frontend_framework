'use strict';

/**
 * 统一文件管理（MongoDB GridFS + `file_meta` 元数据集合）。
 *
 * 设计（findings F38）：
 * - 文件本体：GridFS bucket **`asc_files`**（旧 `attachments` bucket 仅作历史只读回退）。
 * - 元数据：集合 **`file_meta`**，按 DOI / sha256 / lit_id 建立索引，支持 public|private 标签。
 * - 幂等：`sha256` 唯一（内容去重）；`(doi_key, kind)` 唯一（同 DOI 同类型唯一）。
 * - 对外：`file_id`（GridFS ObjectId 的十六进制字符串）作为唯一标识；`filename` 用于前端旧接口兼容。
 */

const crypto = require('node:crypto');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

const BUCKET = 'asc_files';
const LEGACY_BUCKET = 'attachments';
const META = 'file_meta';
const DEFAULT_VISIBILITY = 'public';
const VISIBILITIES = new Set(['public', 'private']);

let clientPromise = null;
let indexPromise = null;
let clientRef = null;

function mongoUri() {
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
}

/** 连接（懒加载，失败即抛错由调用方转 503） */
async function getClient() {
  if (!clientPromise) {
    clientRef = new MongoClient(mongoUri(), { serverSelectionTimeoutMS: 8000 });
    clientPromise = clientRef.connect().catch((error) => {
      clientPromise = null;
      clientRef = null;
      throw new Error(`MongoDB 未连接：${error.message}`);
    });
  }
  return clientPromise;
}

async function getDb() {
  const client = await getClient();
  return client.db();
}

/** 索引只建一次（幂等） */
async function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const db = await getDb();
      const col = db.collection(META);
      // 注意：sha256 **不建唯一索引**。历史数据里可能存在同内容多行（例如同一篇文献重复导入），
      // 唯一索引构建会因 E11000 失败并把上传全部打挂（已踩）。内容去重在应用层做：
      // 上传完成后按 sha256 查一次，命中即复用并删掉本次新写的 GridFS 对象。
      await col.createIndex({ sha256: 1 }, { name: 'idx_sha256' });
      // 同一 DOI 允许多个版本（实测 44 组同 DOI PDF 中有 17 组字节不同），因此不做唯一约束；
      // 内容去重只靠 sha256，DOI 维度仅用于检索。
      await col.createIndex({ doi_key: 1, kind: 1 }, { name: 'idx_doi_kind' });
      await col.dropIndex('uniq_doi_kind').catch(() => {});
      await col.createIndex({ doi_key: 1 }, { name: 'idx_doi_key' });
      await col.createIndex({ lit_id: 1 }, { name: 'idx_lit_id' });
      await col.createIndex({ visibility: 1 }, { name: 'idx_visibility' });
      await col.createIndex({ filename: 1 }, { name: 'idx_filename' });
      return true;
    })().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

function normalizeDoi(value) {
  let doi = String(value || '').trim();
  if (/^doi:\s*/i.test(doi)) doi = doi.replace(/^doi:\s*/i, '');
  doi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim().toLowerCase();
  return doi.replace(/[.,;]+$/, '');
}

function kindOf(filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt') return 'txt';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'caj') return 'caj';
  return ext || 'bin';
}

function mimeOf(kind, fallback) {
  return fallback || ({
    pdf: 'application/pdf', md: 'text/markdown', txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }[kind] || 'application/octet-stream');
}

/** 文档 → 对外结构 */
function toFile(doc) {
  if (!doc) return null;
  return {
    file_id: doc.file_id,
    doi: doc.doi || null,
    lit_id: doc.lit_id || null,
    kind: doc.kind || null,
    filename: doc.filename || null,
    mime: doc.mime || null,
    size: doc.size || 0,
    sha256: doc.sha256 || null,
    visibility: doc.visibility || DEFAULT_VISIBILITY,
    source: doc.source || null,
    source_path: doc.source_path || null,
    aliases: Array.isArray(doc.aliases) ? doc.aliases : [],
    created_at: doc.created_at || null,
  };
}

/**
 * 流式上传。readable 可以是 fs.createReadStream 或 Readable.from(buffer)。
 * 返回 { ...file, deduped }；重复内容/同 DOI 同类型时返回既有记录（并清理本次写入）。
 */
async function uploadStream(readable, meta = {}) {
  const db = await getDb();
  await ensureIndexes();
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });

  const filename = String(meta.filename || 'unnamed').trim() || 'unnamed';
  const kind = meta.kind || kindOf(filename);
  const doiKey = normalizeDoi(meta.doi);
  const visibility = VISIBILITIES.has(meta.visibility) ? meta.visibility : DEFAULT_VISIBILITY;
  const mime = mimeOf(kind, meta.mime);

  const sha = crypto.createHash('sha256');
  let size = 0;
  const gridfsMetadata = {
    contentType: mime, kind, filename, doi: doiKey || null,
    lit_id: meta.litId || null, visibility, sha256: null,
  };
  const upload = bucket.openUploadStream(filename, { contentType: mime, metadata: gridfsMetadata });

  await new Promise((resolve, reject) => {
    readable.on('error', reject);
    upload.on('error', reject);
    upload.on('finish', resolve);
    readable.on('data', (chunk) => { sha.update(chunk); size += chunk.length; });
    readable.pipe(upload);
  });

  const sha256 = sha.digest('hex');
  const now = new Date();

  // 应用层内容去重（不依赖唯一索引）：同内容已存在 → 删新写入，复用既有记录
  const duplicate = await db.collection(META).findOne({ sha256, deleted_at: null }, { sort: { created_at: 1 } });
  if (duplicate) {
    await bucket.delete(upload.id).catch(() => {});
    const patch = { updated_at: now };
    if (meta.litId && !duplicate.lit_id) patch.lit_id = meta.litId;
    // 同内容不同文件名（文献库里既有重复件）→ 记录别名，保证旧链接仍可解析
    if (filename && filename !== duplicate.filename) {
      await db.collection(META).updateOne({ _id: duplicate._id }, { $addToSet: { aliases: filename } });
    }
    await db.collection(META).updateOne({ _id: duplicate._id }, { $set: patch });
    if (patch.lit_id) duplicate.lit_id = patch.lit_id;
    return { ...toFile(duplicate), deduped: true };
  }
  const doc = {
    file_id: upload.id.toString(),
    gridfs_id: upload.id,
    doi: doiKey || null,
    doi_key: doiKey || null,
    lit_id: meta.litId || null,
    kind,
    filename,
    mime,
    size,
    sha256,
    visibility,
    source: meta.source || 'upload',
    source_path: meta.sourcePath || null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  try {
    await db.collection(META).insertOne(doc);
  } catch (error) {
    // 去重命中：清掉本次写入，返回既有记录
    const existing = (error && error.code === 11000)
      ? await db.collection(META).findOne({ sha256, deleted_at: null })
      : null;
    if (!existing) {
      await bucket.delete(upload.id).catch(() => {});
      throw error;
    }
    await bucket.delete(upload.id).catch(() => {});
    if (meta.litId && !existing.lit_id) {
      await db.collection(META).updateOne({ _id: existing._id }, { $set: { lit_id: meta.litId, updated_at: now } });
      existing.lit_id = meta.litId;
    }
    return { ...toFile(existing), deduped: true };
  }

  // GridFS metadata 里的 sha256 补写（便于直接查 asc_files.files 的 metadata.doi/sha256）
  await db.collection(`${BUCKET}.files`).updateOne({ _id: upload.id }, { $set: { 'metadata.sha256': sha256 } }).catch(() => {});
  return { ...toFile(doc), deduped: false };
}

/** 追加文件名别名（同内容不同文件名时保证旧链接可解析） */
async function addAlias(fileId, alias) {
  const name = String(alias || '').trim();
  if (!name) return null;
  const db = await getDb();
  await db.collection(META).updateOne(
    { file_id: String(fileId), deleted_at: null },
    { $addToSet: { aliases: name }, $set: { updated_at: new Date() } },
  );
  return findById(fileId);
}

async function findByDoi(doi, options = {}) {
  const db = await getDb();
  await ensureIndexes();
  const doiKey = normalizeDoi(doi);
  if (!doiKey) return null;
  const filter = { doi_key: doiKey, deleted_at: null };
  if (options.kind) filter.kind = options.kind;
  if (options.visibility) filter.visibility = options.visibility;
  return toFile(await db.collection(META).findOne(filter, { sort: { created_at: 1 } }));
}

async function findById(fileId) {
  const db = await getDb();
  const doc = await db.collection(META).findOne({ file_id: String(fileId), deleted_at: null });
  return toFile(doc);
}

async function findBySha256(sha256) {
  const db = await getDb();
  return toFile(await db.collection(META).findOne({ sha256: String(sha256), deleted_at: null }));
}

async function findByLitId(litId) {
  const db = await getDb();
  const docs = await db.collection(META).find({ lit_id: String(litId), deleted_at: null }).sort({ kind: 1, created_at: 1 }).toArray();
  return docs.map(toFile);
}

/** 旧接口兼容：按文件名解析（file_meta.filename 优先，其次 GridFS 旧 bucket） */
async function resolveByFilename(filename) {
  const db = await getDb();
  // 先按当前文件名，再按别名（同一内容被不同文件名引用时，去重会留下别名）
  const meta = await db.collection(META).findOne(
    { $or: [{ filename: String(filename) }, { aliases: String(filename) }], deleted_at: null },
    { sort: { created_at: -1 } },
  );
  if (meta) return { file: toFile(meta), legacy: false };
  const legacy = await new GridFSBucket(db, { bucketName: LEGACY_BUCKET }).find({ filename: String(filename) })
    .sort({ uploadDate: -1 }).limit(1).next();
  if (!legacy) return null;
  return {
    file: {
      file_id: legacy._id.toString(), filename: legacy.filename, mime: legacy.contentType || 'application/pdf',
      size: legacy.length, kind: kindOf(legacy.filename), visibility: 'public', source: 'legacy-attachments',
    },
    legacy: true,
  };
}

/** 打开下载流（支持 Range: start/end 字节区间） */
async function openStream(fileId, range = null) {
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  const meta = await db.collection(META).findOne({ file_id: String(fileId), deleted_at: null });
  if (meta) {
    const id = meta.gridfs_id || new ObjectId(meta.file_id);
    const options = {};
    if (range && Number.isInteger(range.start)) options.start = range.start;
    if (range && Number.isInteger(range.end)) options.end = range.end;
    return { stream: bucket.openDownloadStream(id, options), file: toFile(meta) };
  }
  const legacy = new GridFSBucket(db, { bucketName: LEGACY_BUCKET }).find({ _id: toObjectId(fileId) }).limit(1).next();
  const legacyDoc = await legacy;
  if (!legacyDoc) return null;
  const options = {};
  if (range && Number.isInteger(range.start)) options.start = range.start;
  if (range && Number.isInteger(range.end)) options.end = range.end;
  return {
    stream: new GridFSBucket(db, { bucketName: LEGACY_BUCKET }).openDownloadStream(legacyDoc._id, options),
    file: { file_id: legacyDoc._id.toString(), filename: legacyDoc.filename, mime: legacyDoc.contentType || 'application/pdf', size: legacyDoc.length, kind: kindOf(legacyDoc.filename), visibility: 'public', source: 'legacy-attachments' },
  };
}

function toObjectId(value) {
  try { return new ObjectId(String(value)); } catch { return null; }
}

async function setVisibility(fileId, visibility) {
  if (!VISIBILITIES.has(visibility)) throw new Error(`visibility 只能是 public 或 private`);
  const db = await getDb();
  const result = await db.collection(META).updateOne(
    { file_id: String(fileId), deleted_at: null },
    { $set: { visibility, updated_at: new Date() } },
  );
  if (!result.matchedCount) return null;
  return findById(fileId);
}

async function softDelete(fileId) {
  const db = await getDb();
  const doc = await db.collection(META).findOne({ file_id: String(fileId), deleted_at: null });
  if (!doc) return false;
  await db.collection(META).updateOne({ _id: doc._id }, { $set: { deleted_at: new Date() } });
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  await bucket.delete(doc.gridfs_id || new ObjectId(doc.file_id)).catch((error) => {
    if (error && error.code !== 'ENOENT_FILE') throw error;
  });
  return true;
}

/** 维护：把 file_meta.lit_id 绑定到文献（上传后回写） */
async function linkLiterature(litId, fileId) {
  const db = await getDb();
  await db.collection(META).updateOne(
    { file_id: String(fileId), deleted_at: null },
    { $set: { lit_id: String(litId), updated_at: new Date() } },
  );
  return findById(fileId);
}

async function stats() {
  const db = await getDb();
  const col = db.collection(META);
  const [total, byVisibility, byKind, bytes] = await Promise.all([
    col.countDocuments({ deleted_at: null }),
    col.aggregate([{ $match: { deleted_at: null } }, { $group: { _id: '$visibility', n: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $match: { deleted_at: null } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $match: { deleted_at: null } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]).toArray(),
  ]);
  return {
    total,
    bytes: bytes[0] ? bytes[0].bytes : 0,
    by_visibility: Object.fromEntries(byVisibility.map((row) => [row._id || 'unknown', row.n])),
    by_kind: Object.fromEntries(byKind.map((row) => [row._id || 'unknown', row.n])),
    bucket: BUCKET,
    mongo_uri: mongoUri().replace(/\/\/[^@]*@/, '//***@'),
  };
}

async function isReady() {
  try {
    const db = await getDb();
    await ensureIndexes();
    return Boolean(db);
  } catch {
    return false;
  }
}

async function close() {
  if (clientRef) {
    await clientRef.close().catch(() => {});
    clientRef = null;
    clientPromise = null;
    indexPromise = null;
  }
}

module.exports = {
  BUCKET, LEGACY_BUCKET, META, DEFAULT_VISIBILITY, VISIBILITIES,
  normalizeDoi, kindOf, mimeOf,
  uploadStream, findByDoi, findById, findBySha256, findByLitId, addAlias,
  resolveByFilename, openStream, setVisibility, softDelete, linkLiterature,
  stats, isReady, ensureIndexes, close,
};
