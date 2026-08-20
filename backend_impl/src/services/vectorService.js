const axios = require('axios');
const database = require('../config/database');

class VectorService {
  // 生成文本向量
  async generateEmbedding(text) {
    try {
      // 这里使用OpenAI API生成向量，实际项目中可以替换为其他embedding服务
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: text,
          model: 'text-embedding-ada-002'
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error.message);
      return null;
    }
  }

  // 存储向量到数据库
  async storeEmbedding(type, sourceId, vector) {
    if (database.dbType === 'sqlite') {
      const vectorStr = JSON.stringify(vector);
      await database.execute(
        'INSERT INTO embeddings (type, source_id, vector) VALUES (?, ?, ?)',
        [type, sourceId, vectorStr]
      );
    } else if (database.dbType === 'mongodb') {
      const { Embedding } = require('../models/mongodb');
      await Embedding.create({ type, source_id: sourceId, vector });
    }
  }

  // 向量相似度搜索
  async searchSimilar(type, queryVector, limit = 5) {
    if (database.dbType === 'sqlite') {
      // SQLite中简单的向量搜索实现
      const embeddings = await database.query('SELECT * FROM embeddings WHERE type = ?', [type]);
      const results = embeddings.map(embedding => {
        const vector = JSON.parse(embedding.vector);
        const similarity = this.calculateSimilarity(queryVector, vector);
        return { ...embedding, similarity };
      });
      return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    } else if (database.dbType === 'mongodb') {
      // MongoDB中的向量搜索
      const { Embedding } = require('../models/mongodb');
      // 实际项目中可以使用MongoDB的向量搜索功能
      const embeddings = await Embedding.find({ type });
      const results = embeddings.map(embedding => {
        const similarity = this.calculateSimilarity(queryVector, embedding.vector);
        return { ...embedding.toObject(), similarity };
      });
      return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }
  }

  // 计算向量相似度（余弦相似度）
  calculateSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (norm1 * norm2);
  }

  // 加载embedding文件
  async loadEmbeddingFile(filePath) {
    // 实际项目中实现文件加载逻辑
    console.log('Loading embedding file:', filePath);
    return { status: 'success', message: 'Embedding file loaded' };
  }
}

module.exports = new VectorService();
