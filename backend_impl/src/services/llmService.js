const axios = require('axios');
const vectorService = require('./vectorService');

class LLMService {
  // 调用LLM API生成回答
  async generateAnswer(question, context = '') {
    try {
      const response = await axios.post(
        process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant. Use the provided context to answer the question.'
            },
            {
              role: 'user',
              content: `Context: ${context}\n\nQuestion: ${question}`
            }
          ],
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling LLM API:', error);
      return 'Error generating answer. Please try again.';
    }
  }

  // Agent提问功能：结合向量搜索和LLM
  async agentQuery(question) {
    // 生成问题的向量
    const questionVector = await vectorService.generateEmbedding(question);
    
    // 搜索相关的向量数据
    const similarResults = await vectorService.searchSimilar('recipe', questionVector, 3);
    
    // 构建上下文
    let context = 'Relevant information from database:\n';
    similarResults.forEach(result => {
      context += `- ${result.vector.substring(0, 100)}... (similarity: ${result.similarity.toFixed(2)})\n`;
    });
    
    // 调用LLM生成回答
    return this.generateAnswer(question, context);
  }
}

module.exports = new LLMService();
