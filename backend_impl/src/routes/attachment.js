const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const multer = require('multer');

// 配置multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './data/attachments');
  },
  filename: function (req, file, cb) {
    const litId = req.body.litId;
    const ext = file.originalname.split('.').pop();
    cb(null, `${litId}.${ext}`);
  }
});

const upload = multer({ storage: storage });

// 上传附件
router.post('/upload', upload.single('file'), attachmentController.uploadAttachment);

// 下载/预览附件
router.get('/:filename', attachmentController.getAttachment);

// 删除附件
router.delete('/remove/:litId', attachmentController.removeAttachment);

// 测试MongoDB连接状态
router.get('/test', (req, res) => {
  try {
    // 检查gfs是否初始化
    const attachmentController = require('../controllers/attachmentController');
    // 这里我们直接检查mongoose连接状态
    const mongoose = require('mongoose');
    const isConnected = mongoose.connection.readyState === 1;
    
    if (isConnected) {
      res.json({ success: true, message: 'MongoDB连接成功' });
    } else {
      res.json({ success: false, message: 'MongoDB未连接' });
    }
  } catch (error) {
    console.error('Error testing MongoDB connection:', error);
    res.json({ success: false, message: '测试MongoDB连接时出错' });
  }
});

module.exports = router;
