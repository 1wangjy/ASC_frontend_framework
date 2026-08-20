const database = require('../config/database');
const vectorService = require('../services/vectorService');
const localModelService = require('../services/localModelService');

class Model3Controller {
  // 提交工况指标
  async submitWorkingConditions(req, res) {
    try {
      const { temperature, pressure, time } = req.body;
      
      // 存储工况指标到数据库
      let conditionId;
      if (database.dbType === 'sqlite') {
        const result = await database.execute(
          'INSERT INTO working_conditions (temperature, pressure, time) VALUES (?, ?, ?)',
          [temperature, pressure, time]
        );
        conditionId = result.lastID;
      } else if (database.dbType === 'mongodb') {
        const { WorkingCondition } = require('../models/mongodb');
        const condition = await WorkingCondition.create({ temperature, pressure, time });
        conditionId = condition._id;
      }
      
      // 与本地服役预测模型通信
      const modelResult = await localModelService.communicateWithModel3({
        temperature,
        pressure,
        time
      });
      
      // 存储生成的embedding到数据库
      if (modelResult.embedding) {
        await vectorService.storeEmbedding('environment', conditionId, modelResult.embedding);
      }
      
      res.json({
        code: 200,
        message: 'Working conditions submitted successfully',
        data: {
          conditionId,
          embedding: modelResult.embedding ? modelResult.embedding.slice(0, 10) : null,
          environmentScore: modelResult.environmentScore
        }
      });
    } catch (error) {
      console.error('Error submitting working conditions:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new Model3Controller();
