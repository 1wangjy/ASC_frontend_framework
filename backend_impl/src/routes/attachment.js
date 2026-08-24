const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const multer = require('multer');

// GridFS 控制器需要 req.file.buffer，因此附件必须保存在内存中。
const upload = multer({ storage: multer.memoryStorage() });

function requirePdfUpload(req, res, next) {
  if (!req.file) return next();

  const hasPdfName = /\.pdf$/i.test(req.file.originalname || '');
  const hasPdfMime = req.file.mimetype === 'application/pdf';
  const hasPdfSignature = req.file.buffer?.subarray(0, 5).toString('ascii') === '%PDF-';

  if (!hasPdfName || !hasPdfMime || !hasPdfSignature) {
    res.status(400).json({ success: false, error: '只允许上传 PDF 文件' });
    return;
  }
  next();
}

// 上传附件
router.post('/upload', upload.single('file'), requirePdfUpload, attachmentController.uploadAttachment);

// 测试MongoDB连接状态
router.get('/test', (req, res) => {
  try {
    if (attachmentController.isAttachmentStorageReady()) {
      res.json({ success: true, message: 'MongoDB连接成功' });
    } else {
      res.status(503).json({ success: false, message: 'MongoDB未连接' });
    }
  } catch (error) {
    console.error('Error testing MongoDB connection:', error);
    res.status(503).json({ success: false, message: '测试MongoDB连接时出错' });
  }
});

// 删除附件
router.delete('/remove/:litId', attachmentController.removeAttachment);

// 下载/预览附件（动态路由必须放在 /test 之后）
router.get('/:filename', attachmentController.getAttachment);

module.exports = router;
