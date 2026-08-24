const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const Grid = require('gridfs-stream');
const newDbService = require('../services/newDbService');

// 连接MongoDB
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
let gfs = null;

exports.isAttachmentStorageReady = () => Boolean(
  gfs && mongoose.connection.readyState === 1
);

// 尝试连接MongoDB，但不阻止应用启动
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).catch(err => {
  console.warn('MongoDB connection failed (attachment storage will be disabled):', err.message);
});

const conn = mongoose.connection;

// 初始化GridFS
conn.once('open', () => {
  try {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('attachments');
    console.log('MongoDB connected for attachment storage');
  } catch (err) {
    console.warn('Failed to initialize GridFS:', err.message);
  }
});

// 配置multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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
    
    if (!gfs) {
      res.status(503).json({ success: false, error: 'MongoDB未连接，附件存储功能暂时不可用' });
      return;
    }
    
    // 获取文献信息，检查是否有DOI
    const lit = await newDbService.getLit(litId);
    let finalFilename = file.originalname;
    
    if (lit && lit.doi) {
      // 如果有DOI，使用DOI作为文件名
      const ext = finalFilename.split('.').pop();
      // 移除DOI中的特殊字符，只保留字母、数字、连字符和点
      const doiFilename = lit.doi.replace(/[^a-zA-Z0-9\-\.]/g, '_');
      finalFilename = `${doiFilename}.${ext}`;
    }
    
    // 创建GridFS写入流
    const writeStream = gfs.createWriteStream({
      filename: finalFilename,
      bucketName: 'attachments'
    });
    
    // 写入文件
    writeStream.write(file.buffer);
    writeStream.end();
    
    writeStream.on('finish', async () => {
      // 更新文献记录，添加附件路径
      await newDbService.updateLit(litId, {
        attachment: finalFilename
      });
      
      res.json({ success: true, data: { filename: finalFilename } });
    });
    
    writeStream.on('error', (error) => {
      console.error('Error writing to GridFS:', error);
      res.status(500).json({ success: false, error: error.message });
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
    
    if (!gfs) {
      res.status(503).json({ success: false, error: 'MongoDB未连接，附件存储功能暂时不可用' });
      return;
    }
    
    // 从GridFS中查找文件
    gfs.files.findOne({ filename: filename }, (err, file) => {
      if (err) {
        console.error('Error finding file in GridFS:', err);
        res.status(500).json({ success: false, error: err.message });
        return;
      }
      
      if (!file) {
        res.status(404).json({ success: false, error: '附件不存在' });
        return;
      }
      
      // 创建GridFS读取流
      const readStream = gfs.createReadStream({
        filename: filename,
        bucketName: 'attachments'
      });
      
      // 设置响应头
      res.set('Content-Type', file.contentType || 'application/pdf');
      res.set('Content-Disposition', `inline; filename="${filename}"`);
      
      // 管道流到响应
      readStream.pipe(res);
    });
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
    
    if (!gfs) {
      // 即使MongoDB未连接，也要更新文献记录，移除附件路径
      await newDbService.updateLit(litId, {
        attachment: null
      });
      res.json({ success: true, message: '附件记录已删除（MongoDB未连接，文件可能未实际删除）' });
      return;
    }
    
    // 从GridFS中删除文件
    gfs.remove({ filename: lit.attachment, bucketName: 'attachments' }, async (err, gridStore) => {
      if (err) {
        console.error('Error removing file from GridFS:', err);
        res.status(500).json({ success: false, error: err.message });
        return;
      }
      
      // 更新文献记录，移除附件路径
      await newDbService.updateLit(litId, {
        attachment: null
      });
      
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
