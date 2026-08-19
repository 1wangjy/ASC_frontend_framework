const llmService = require('../services/llmService');

class LLMController {
  // LLM Agent提问
  async agentQuery(req, res) {
    try {
      const { question } = req.body;

      if (!question) {
        return res.status(400).json({
          code: 400,
          message: 'Question is required'
        });
      }

      // 调用LLM Agent服务
      const answer = await llmService.agentQuery(question);

      res.json({
        code: 200,
        message: 'Agent query completed',
        data: {
          question,
          answer
        }
      });
    } catch (error) {
      console.error('Error processing agent query:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new LLMController();
