const axios = require('axios');

class LocalModelService {
  // 与本地性能预测模型通信
  async communicateWithModel1(data) {
    try {
      const response = await axios.post(
        process.env.LOCAL_MODEL1_URL || 'http://localhost:8000/model1',
        data,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error communicating with model1:', error.message);
      return {
        status: 'error',
        message: '性能预测模型服务不可用',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  }

  // 与本地配方优化模型通信
  async communicateWithModel2(data) {
    try {
      const response = await axios.post(
        process.env.LOCAL_MODEL2_URL || 'http://localhost:8001/model2',
        data,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error communicating with model2:', error.message);
      return {
        status: 'error',
        message: '配方优化模型服务不可用',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  }

  // 与本地服役预测模型通信
  async communicateWithModel3(data) {
    try {
      const response = await axios.post(
        process.env.LOCAL_MODEL3_URL || 'http://localhost:8002/model3',
        data,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error communicating with model3:', error.message);
      return {
        status: 'error',
        message: '服役预测模型服务不可用',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  }

}

module.exports = new LocalModelService();
