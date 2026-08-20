const database = require('../config/database');
const { spawn } = require('child_process');
const path = require('path');

class Model4Controller {
  constructor() {
    this.reconstruct = this.reconstruct.bind(this);
    this.generateAnimation = this.generateAnimation.bind(this);
    this.generateStatic = this.generateStatic.bind(this);
  }

  async reconstruct(req, res) {
    try {
      const { stlContent, tempPoints } = req.body;
      
      if (!stlContent || !tempPoints) {
        return res.status(400).json({
          code: 400,
          message: 'STL content and temperature points are required'
        });
      }

      const result = {
        code: 200,
        message: 'Temperature field reconstructed successfully',
        data: {
          stlContent: stlContent,
          tempPoints: tempPoints,
          timestamp: new Date().toISOString()
        }
      };

      res.json(result);
    } catch (error) {
      console.error('Error in model4 reconstruct:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  async generateAnimation(req, res) {
    try {
      const scriptPath = path.join(__dirname, '../../python/stl_generator.py');
      const pythonCmd = process.env.PYTHON_CMD || 'python3';
      const pythonProcess = spawn(pythonCmd, [scriptPath]);
      
      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', stderrData);
          return res.status(500).json({
            code: 500,
            message: 'Failed to generate animation',
            error: stderrData
          });
        }

        try {
          const result = JSON.parse(stdoutData);
          if (result.success) {
            res.json({
              code: 200,
              message: 'Animation frames generated successfully',
              data: result
            });
          } else {
            res.status(500).json({
              code: 500,
              message: 'Failed to generate animation',
              error: result.error
            });
          }
        } catch (parseError) {
          console.error('Failed to parse Python output:', parseError);
          res.status(500).json({
            code: 500,
            message: 'Failed to parse animation data',
            error: parseError.message
          });
        }
      });
    } catch (error) {
      console.error('Error in generateAnimation:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  async generateStatic(req, res) {
    try {
      const scriptPath = path.join(__dirname, '../../python/stl_generator.py');
      const pythonCmd = process.env.PYTHON_CMD || 'python3';
      const pythonProcess = spawn(pythonCmd, [scriptPath, 'static']);
      
      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', stderrData);
          return res.status(500).json({
            code: 500,
            message: 'Failed to generate static gutter',
            error: stderrData
          });
        }

        try {
          const result = JSON.parse(stdoutData);
          if (result.success) {
            res.json({
              code: 200,
              message: 'Static gutter generated successfully',
              data: result
            });
          } else {
            res.status(500).json({
              code: 500,
              message: 'Failed to generate static gutter',
              error: result.error
            });
          }
        } catch (parseError) {
          console.error('Failed to parse Python output:', parseError);
          res.status(500).json({
            code: 500,
            message: 'Failed to parse static gutter data',
            error: parseError.message
          });
        }
      });
    } catch (error) {
      console.error('Error in generateStatic:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new Model4Controller();
