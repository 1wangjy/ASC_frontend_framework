const express = require('express');
const { Readable } = require('node:stream');
const mongoose = require('mongoose');
const fileStoreService = require('../services/fileStoreService');
const newDbService = require('../services/newDbService');
const GridFsBucketStorage = require('../services/gridFsBucketStorage');
const pdfMetadataExtractorService = require('../services/pdfMetadataExtractorService');
const literatureMetadataService = require('../services/literatureMetadataService');
const { normalizeUploadFilename } = require('../utils/uploadFilename');

// 连接MongoDB
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
let gridFsStorage = null;

exports.isAttachmentStorageReady = () => Boolean(
  gridFsStorage && mongoose.connection.readyState === 1
);

/** 统一文件存储（GridFS asc_files + file_meta）是否可用 */
exports.isUnifiedStorageReady = () => fileStoreService.isReady();

// 尝试连接MongoDB，但不阻止应用启动
mongoose.connect(mongoURI).catch(err => {
  console.warn('MongoDB connection failed (attachment storage will be disabled):', err.message);
});

const conn = mongoose.connection;

// 初始化GridFS
conn.once('open', () => {
  try {
    gridFsStorage = new GridFsBucketStorage(conn.db, 'attachments');
    console.log('MongoDB connected for attachment storage');
  } catch (err) {
    console.warn('Failed to initialize GridFS:', err.message);
  }
});

// 上传附件
exports.uploadAttachment = async (req, res) => {
  try {
    await newDbService.connect();
    
    const litId = req.body.litId;
    const file = req.file;
    
    if (!litId || !file) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }
    
    if (!gridFsStorage) {
      res.status(503).json({ success: false, error: 'MongoDB未连接，附件存储功能暂时不可用' });
      return;
    }
    
    // 获取文献信息，检查是否有DOI
    const lit = await newDbService.getLit(litId);
    let finalFilename = normalizeUploadFilename(file.originalname);

    if (lit && lit.doi) {
      // 如果有DOI，使用DOI作为文件名（前端 attachment 字段沿用文件名语义）
      const ext = finalFilename.split('.').pop();
      const doiFilename = lit.doi.replace(/[^a-zA-Z0-9\-\.]/g, '_');
      finalFilename = `${doiFilename}.${ext}`;
    }

    // 统一文件存储：写入 GridFS asc_files + file_meta（含 doi/lit_id/visibility/sha256）
    const uploaded = await fileStoreService.uploadStream(Readable.from(file.buffer), {
      filename: finalFilename,
      mime: file.mimetype || 'application/pdf',
      doi: lit && lit.doi ? lit.doi : '',
      litId,
      visibility: 'public',   // 文献原文默认 public
      source: 'upload',
    });

    // 去向文献行回写：attachment 用**实际存储的文件名**（去重命中时可能是既有文件名），并记录 file_id
    const storedFilename = uploaded && uploaded.filename ? uploaded.filename : finalFilename;
    try {
      await newDbService.updateLit(litId, {
        attachment: storedFilename,
        file_id: uploaded.file_id,
      });
    } catch (error) {
      // 回写失败：不删已入库文件（可能有其它文献引用），仅记录并抛错
      console.error('Failed to update literature attachment fields:', error.message);
      throw error;
    }
    finalFilename = storedFilename;
    res.json({
      success: true,
      data: {
        filename: finalFilename,
        file_id: uploaded.file_id,
        visibility: uploaded.visibility,
        sha256: uploaded.sha256,
        deduped: Boolean(uploaded.deduped),
      },
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 下载/预览附件
exports.getAttachment = async (req, res) => {
  try {
    const filename = req.params.filename;

    // 统一存储优先：file_meta.filename → GridFS asc_files（支持 Range）
    const resolved = await fileStoreService.resolveByFilename(filename).catch(() => null);
    if (resolved && resolved.file && !resolved.legacy) {
      const filesController = require('./filesController');
      return filesController.streamFile(res, resolved.file, req.headers.range);
    }
    if (resolved && resolved.file && resolved.legacy) {
      const filesController = require('./filesController');
      return filesController.streamFile(res, resolved.file, req.headers.range);
    }

    if (!gridFsStorage) {
      res.status(503).json({ success: false, error: 'MongoDB未连接，附件存储功能暂时不可用' });
      return;
    }

    const file = await gridFsStorage.findByFilename(filename);
    if (!file) {
      res.status(404).json({ success: false, error: '附件不存在' });
      return;
    }

    res.set('Content-Type', file.contentType || file.metadata?.contentType || 'application/pdf');
    const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.set('Content-Disposition', `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);

    const readStream = gridFsStorage.openDownloadStream(file._id);
    readStream.once('error', (error) => {
      console.error('Error reading from GridFS:', error);
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
      else res.destroy(error);
    });
    readStream.pipe(res);
  } catch (error) {
    console.error('Error getting attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 删除附件
exports.removeAttachment = async (req, res) => {
  try {
    await newDbService.connect();
    
    const litId = req.params.litId;
    
    // 获取文献信息，找到附件文件名
    const lit = await newDbService.getLit(litId);
    if (!lit || !lit.attachment) {
      res.status(404).json({ success: false, error: '附件不存在' });
      return;
    }
    
    if (!gridFsStorage) {
      // 即使MongoDB未连接，也要更新文献记录，移除附件路径
      await newDbService.updateLit(litId, {
        attachment: null
      });
      res.json({ success: true, message: '附件记录已删除（MongoDB未连接，文件可能未实际删除）' });
      return;
    }
    
    // 统一存储：软删该文献的全部分片（pdf/md…）
    const files = await fileStoreService.findByLitId(litId).catch(() => []);
    for (const file of files) {
      await fileStoreService.softDelete(file.file_id).catch(() => {});
    }
    // 旧 bucket 兼容删除
    await gridFsStorage.deleteByFilename(lit.attachment).catch(() => {});

    await newDbService.updateLit(litId, {
      attachment: null,
      file_id: null,
    });

    res.json({ success: true, data: { deleted_files: files.length } });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 对 GridFS 中已经上传成功的 PDF 做单文件元数据提取。
exports.extractMetadata = async (req, res) => {
  try {
    await newDbService.connect();

    const lit = await newDbService.getLit(req.params.litId);
    if (!lit) {
      res.status(404).json({ success: false, error: '文献记录不存在' });
      return;
    }
    if (!lit.attachment) {
      res.status(409).json({ success: false, error: '该文献尚未上传附件' });
      return;
    }
    if (!gridFsStorage) {
      res.status(503).json({ success: false, error: 'MongoDB 未连接，无法读取附件' });
      return;
    }

    const unifiedStorage = {
      async findByFilename(filename) {
        const resolved = await fileStoreService.resolveByFilename(filename);
        if (!resolved || !resolved.file) return null;
        return { _id: resolved.file.file_id, filename: resolved.file.filename, contentType: resolved.file.mime };
      },
      openDownloadStream(fileId) {
        const { PassThrough } = require('node:stream');
        const out = new PassThrough();
        fileStoreService.openStream(String(fileId)).then((opened) => {
          if (!opened) return out.destroy(new Error('文件不存在'));
          opened.stream.once('error', (error) => out.destroy(error));
          opened.stream.pipe(out);
        }).catch((error) => out.destroy(error));
        return out;
      },
    };

    const result = await literatureMetadataService.extractAndPersistMetadata({
      litId: lit.lit_id,
      filename: lit.attachment,
      storage: unifiedStorage,
      dbService: newDbService,
      extractorService: pdfMetadataExtractorService,
      overwriteExisting: req.body?.overwriteExisting === true,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error extracting PDF metadata:', error.message);
    const status = error.code === 'LITERATURE_NOT_FOUND'
      ? 404
      : error.code === 'GRIDFS_ATTACHMENT_NOT_READY'
        ? 503
        : error.code === 'PDF_METADATA_NOT_CONFIGURED'
      || error.code === 'PDF_METADATA_START_FAILED'
      ? 503
      : error.code === 'PDF_METADATA_TIMEOUT'
        ? 504
        : 502;
    res.status(status).json({ success: false, error: error.message });
  }
};
