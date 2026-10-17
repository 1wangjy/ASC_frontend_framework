'use strict';

/**
 * 统一文件管理接口（MongoDB GridFS + file_meta）。
 *
 * 路由前缀：`/api/files`
 *   POST   /upload                multipart: file, doi?, litId?, visibility?, source?
 *   GET    /by-doi/:doi           ?kind=pdf&visibility=public → 元数据
 *   GET    /by-doi/:doi/stream    → 文件流（支持 Range）
 *   GET    /by-lit/:litId         → 该文献的全部文件元数据
 *   GET    /:fileId/meta
 *   GET    /:fileId/stream        → 文件流（支持 Range）
 *   PATCH  /:fileId/visibility    body: { visibility: 'public' | 'private' }
 *   DELETE /:fileId               软删（同时删 GridFS 对象）
 *   GET    /stats
 */

const { Readable } = require('node:stream');
const fileStoreService = require('../services/fileStoreService');

function parseRange(header, size) {
  if (!header || !size) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null) {
    // 后缀范围：bytes=-500 → 最后 500 字节
    const suffix = end === null ? 0 : end;
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

function disposition(filename, mime) {
  const ascii = String(filename || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const mode = String(mime || '').startsWith('application/pdf') ? 'inline' : 'attachment';
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename || 'file')}`;
}

async function streamFile(res, file, rangeHeader) {
  const size = Number(file.size) || 0;
  const range = parseRange(rangeHeader, size);
  const opened = await fileStoreService.openStream(file.file_id, range);
  if (!opened) return res.status(404).json({ success: false, error: '文件不存在' });

  res.set('Content-Type', file.mime || 'application/octet-stream');
  res.set('Content-Disposition', disposition(file.filename, file.mime));
  res.set('Accept-Ranges', 'bytes');
  if (range) {
    res.status(206);
    res.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.set('Content-Length', String(range.end - range.start + 1));
  } else if (size) {
    res.set('Content-Length', String(size));
  }
  opened.stream.once('error', (error) => {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    else res.destroy(error);
  });
  opened.stream.pipe(res);
}

exports.upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '缺少文件字段 file' });
    const { doi = '', litId = '', visibility = 'public', source = 'upload', kind = '' } = req.body || {};
    const result = await fileStoreService.uploadStream(Readable.from(req.file.buffer), {
      filename: req.file.originalname,
      mime: req.file.mimetype,
      kind: kind || undefined,
      doi,
      litId: litId || undefined,
      visibility,
      source,
    });
    if (litId && result && result.file_id) await fileStoreService.linkLiterature(litId, result.file_id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('files.upload error:', error);
    const status = /MongoDB 未连接/.test(error.message) ? 503 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.byDoi = async (req, res) => {
  try {
    const file = await fileStoreService.findByDoi(req.params.doi, {
      kind: req.query.kind || undefined,
      visibility: req.query.visibility || undefined,
    });
    if (!file) return res.status(404).json({ success: false, error: '该 DOI 暂无原文' });
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

exports.byDoiStream = async (req, res) => {
  try {
    const file = await fileStoreService.findByDoi(req.params.doi, {
      kind: req.query.kind || undefined,
      visibility: req.query.visibility || undefined,
    });
    if (!file) return res.status(404).json({ success: false, error: '该 DOI 暂无原文' });
    await streamFile(res, file, req.headers.range);
  } catch (error) {
    if (!res.headersSent) res.status(503).json({ success: false, error: error.message });
  }
};

exports.byLitId = async (req, res) => {
  try {
    res.json({ success: true, data: await fileStoreService.findByLitId(req.params.litId) });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

exports.meta = async (req, res) => {
  try {
    const file = await fileStoreService.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: '文件不存在' });
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

exports.stream = async (req, res) => {
  try {
    const file = await fileStoreService.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, error: '文件不存在' });
    await streamFile(res, file, req.headers.range);
  } catch (error) {
    if (!res.headersSent) res.status(503).json({ success: false, error: error.message });
  }
};

exports.setVisibility = async (req, res) => {
  try {
    const { visibility } = req.body || {};
    const file = await fileStoreService.setVisibility(req.params.fileId, String(visibility || ''));
    if (!file) return res.status(404).json({ success: false, error: '文件不存在' });
    res.json({ success: true, data: file });
  } catch (error) {
    const status = /visibility/.test(error.message) ? 400 : 503;
    res.status(status).json({ success: false, error: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const removed = await fileStoreService.softDelete(req.params.fileId);
    if (!removed) return res.status(404).json({ success: false, error: '文件不存在' });
    res.json({ success: true });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

exports.stats = async (req, res) => {
  try {
    res.json({ success: true, data: await fileStoreService.stats() });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

exports.streamFile = streamFile;
exports.parseRange = parseRange;

exports.health = async (req, res) => {
  const ready = await fileStoreService.isReady();
  res.status(ready ? 200 : 503).json({ success: ready, data: { ready } });
};
