const multer = require('multer');
const path = require('path');
const vectorService = require('../services/vectorService');

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './data/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

class EmbeddingController {
  // 上传embedding文件
  uploadFile = upload.single('file');

  // 处理文件上传
  async handleFileUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          code: 400,
          message: 'No file uploaded'
        });
      }

      // 加载上传的embedding文件
      const result = await vectorService.loadEmbeddingFile(req.file.path);

      res.json({
        code: 200,
        message: 'File uploaded successfully',
        data: {
          filename: req.file.filename,
          path: req.file.path,
          result
        }
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 向量搜索
  async searchVectors(req, res) {
    try {
      const { type, query } = req.body;

      // 生成查询向量
      const queryVector = await vectorService.generateEmbedding(query);

      // 搜索相似向量
      const results = await vectorService.searchSimilar(type, queryVector);

      res.json({
        code: 200,
        message: 'Vector search completed',
        data: results
      });
    } catch (error) {
      console.error('Error searching vectors:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new EmbeddingController();
