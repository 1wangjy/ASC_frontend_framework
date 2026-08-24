const express = require('express');
const mongoose = require('mongoose');
const newDbService = require('../services/newDbService');
const GridFsBucketStorage = require('../services/gridFsBucketStorage');
const { normalizeUploadFilename } = require('../utils/uploadFilename');

// 连接MongoDB
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
let gridFsStorage = null;

exports.isAttachmentStorageReady = () => Boolean(
  gridFsStorage && mongoose.connection.readyState === 1
);

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
      // 如果有DOI，使用DOI作为文件名
      const ext = finalFilename.split('.').pop();
      // 移除DOI中的特殊字符，只保留字母、数字、连字符和点
      const doiFilename = lit.doi.replace(/[^a-zA-Z0-9\-\.]/g, '_');
      finalFilename = `${doiFilename}.${ext}`;
    }
    
    await gridFsStorage.upload(file.buffer, finalFilename, file.mimetype);

    try {
      await newDbService.updateLit(litId, {
        attachment: finalFilename
      });
    } catch (error) {
      await gridFsStorage.deleteByFilename(finalFilename).catch(() => {});
      throw error;
    }

    res.json({ success: true, data: { filename: finalFilename } });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 下载/预览附件
exports.getAttachment = async (req, res) => {
  try {
    const filename = req.params.filename;
    
    if (!gridFsStorage) {
      res.status(503).json({ success: false, error: 'MongoDB未连接，附件存储功能暂时不可用' });
      return;
    }

    const file = await gridFsStorage.findByFilename(filename);
    if (!file) {
      res.status(404).json({ success: false, error: '附件不存在' });
      return;
    }

    const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.set('Content-Type', file.contentType || file.metadata?.contentType || 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

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
    
    await gridFsStorage.deleteByFilename(lit.attachment);
    await newDbService.updateLit(litId, {
      attachment: null
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
