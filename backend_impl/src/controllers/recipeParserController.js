const { spawn } = require('child_process');
const path = require('path');
const database = require('../config/database');

class RecipeParserController {
  constructor() {
    this.parseRecipe = this.parseRecipe.bind(this);
    this.submitFinalRecipe = this.submitFinalRecipe.bind(this);
  }

  async parseRecipe(req, res) {
    try {
      const { content } = req.body;
      
      if (!content) {
        return res.status(400).json({
          code: 400,
          message: 'Recipe content is required'
        });
      }
      
      // 获取所有原材料数据
      let materials = [];
      try {
        materials = await database.query('SELECT * FROM raw_material WHERE is_delete = 0');
      } catch (error) {
        console.error('Error loading materials:', error);
      }
      
      // 调用Python后端进行解析
      const result = await this.callPythonParser(content, materials);
      
      if (result.success) {
        // 打印embedding用于测试
        console.log('=== 配方Embedding ===');
        console.log('形状:', result.embedding_shape);
        console.log('矩阵 (前5行前10列):');
        if (result.embedding && result.embedding.length > 0) {
          result.embedding.slice(0, 5).forEach((row, i) => {
            console.log(`行 ${i + 1}:`, row.slice(0, 10).map(x => x.toFixed(4)));
          });
        }
        console.log('====================');
      }
      
      res.json({
        code: 200,
        message: 'Recipe parsed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error parsing recipe:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  callPythonParser(content, materials) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, '../../python/recipe_processor.py');
      // Windows 路径转为正斜杠，避免 Python 将反斜杠序列误解析为 Unicode 转义
      const pythonDir = path.dirname(pythonScript).replace(/\\/g, '/');
      
      // 创建一个临时的Python脚本来处理输入输出
      const tempScript = `
import sys
import json

# 添加项目路径（使用正斜杠路径，避免 unicodeescape 解析错误）
sys.path.insert(0, r'${pythonDir}')

from recipe_processor import RecipeProcessor

# 读取输入
input_data = json.loads(sys.stdin.read())
content = input_data['content']
materials = input_data['materials']

# 处理
processor = RecipeProcessor(materials)
result = processor.process(content)

# 输出结果
print(json.dumps(result, ensure_ascii=False))
`;
      
      const pythonCmd = process.env.PYTHON_CMD || 'python3';
      const pythonProcess = spawn(pythonCmd, ['-c', tempScript]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Python error:', stderr);
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (error) {
          console.error('Parse error:', stdout);
          reject(new Error('Failed to parse Python output'));
        }
      });
      
      // 发送输入数据
      pythonProcess.stdin.write(JSON.stringify({ content, materials }));
      pythonProcess.stdin.end();
    });
  }

  async submitFinalRecipe(req, res) {
    try {
      const { name, type, batch, components, testData } = req.body;
      
      if (!name || !type || !components || !Array.isArray(components)) {
        return res.status(400).json({
          code: 400,
          message: 'Recipe name, type, and components are required'
        });
      }
      
      // 导入idGenerator
      const idGenerator = require('../utils/idGenerator');
      
      // 处理组件，确保所有原料都在数据库中存在
      const processedComponents = [];
      for (const comp of components) {
        let materialId = comp.materialId || null;
        let mpId = null;
        
        // 检查材料是否存在
        if (materialId) {
          // 检查材料是否存在于数据库
          try {
            const materials = await database.query('SELECT * FROM mc_material WHERE mc_id = ?', [materialId]);
            if (materials.length === 0) {
              // 材料不存在，需要创建
              materialId = null;
            } else {
              // 材料存在，获取其MP ID
              const material = materials[0];
              if (material.component_list) {
                try {
                  const componentList = JSON.parse(material.component_list);
                  if (Array.isArray(componentList) && componentList.length > 0 && Array.isArray(componentList[0]) && componentList[0].length > 1) {
                    mpId = componentList[0][1];
                  }
                } catch (e) {
                  console.error('Error parsing component_list:', e);
                }
              }
            }
          } catch (error) {
            console.error('Error checking material:', error);
            materialId = null;
          }
        }
        
        // 如果材料不存在或没有MP ID，创建新的原料和物性记录
        if (!materialId || !mpId) {
          try {
            // 生成新的MP ID
            mpId = idGenerator.generateMpId();
            
            // 处理自定义物性
            let customProperties = [{ name: '', value: -1 }, { name: '', value: -1 }, { name: '', value: -1 }, { name: '', value: -1 }];
            if (comp.properties && Object.keys(comp.properties).length > 0) {
              customProperties = Object.entries(comp.properties).map(([key, value]) => ({
                name: key,
                value: value
              }));
              // 确保只有4个自定义物性
              customProperties = customProperties.slice(0, 4);
              // 如果不足4个，补充空值
              while (customProperties.length < 4) {
                customProperties.push({ name: '', value: -1 });
              }
            }
            
            // 创建物性记录
            await database.execute(
              'INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)',
              [
                mpId,
                JSON.stringify(Array(32).fill(-1)),
                JSON.stringify(customProperties),
                JSON.stringify([]),
                new Date().toISOString(),
                new Date().toISOString()
              ]
            );
            
            // 生成新的MC ID
            materialId = idGenerator.generateMcId();
            
            // 确定材料类型
            let materialType = comp.componentType || '支撑骨料';
            if (comp.original === '水' || comp.original === 'water' || comp.original === 'Water') {
              materialType = '水';
            }
            
            // 创建原料记录
            await database.execute(
              'INSERT INTO mc_material (mc_id, batch_no, type, component_list, is_mixed, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [
                materialId,
                '', // 批次号置空
                materialType, // 使用前端传递的类型
                JSON.stringify([[comp.original || 'New Material', mpId, JSON.stringify({}), 100]]),
                0,
                new Date().toISOString(),
                new Date().toISOString()
              ]
            );
            
            // 更新MP记录，关联MC ID
            await database.execute(
              'UPDATE mp_properties SET mc_ids = ?, update_time = ? WHERE mp_id = ?',
              [
                JSON.stringify([materialId]),
                new Date().toISOString(),
                mpId
              ]
            );
          } catch (error) {
            console.error('Error creating material and properties:', error);
            return res.status(500).json({
              code: 500,
              message: 'Error creating material: ' + error.message
            });
          }
        }
        
        processedComponents.push([
          comp.original || '',
          materialId,
          JSON.stringify({}),
          parseFloat(comp.percentage) || 0
        ]);
      }
      
      // 生成配方ID
      const recipeId = idGenerator.generateMrId();
      
      // 构建配方数据 - 适配mr_formula表结构
      const componentList = processedComponents;
      
      // 处理测试数据
      let tpIds = [];
      if (testData && Object.keys(testData).length > 0) {
        try {
          // 生成测试ID
          const testId = idGenerator.generateTpId();
          
          // 构建测试数据 - 适配tp_test_properties表结构
          const testParams = JSON.stringify({}); // 暂时为空，后续可以从前端获取
          const testResults = JSON.stringify({
            fixed: [], // 暂时为空，后续可以从前端获取
            custom: Object.entries(testData).map(([key, value]) => {
              // 检查value是否是对象，如果是，提取value和unit
              let testValue = value;
              let testUnit = '';
              if (typeof value === 'object' && value !== null) {
                testValue = value.value;
                testUnit = value.unit || '';
              }
              return {
                name: key,
                value: testValue,
                unit: testUnit
              };
            })
          });
          
          // 存储测试数据
          await database.execute(
            'INSERT INTO tp_test_properties (tp_id, mp_id, test_params, test_results, mr_ids, test_condition, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              testId,
              '', // 暂时为空，后续可以从前端获取
              testParams,
              testResults,
              JSON.stringify([recipeId]),
              '无', // 默认为无
              new Date().toISOString(),
              new Date().toISOString()
            ]
          );
          
          tpIds.push(testId);
        } catch (error) {
          console.error('Error saving test data:', error);
          // 测试数据保存失败不影响配方保存
        }
      }
      
      // 存储到数据库
      try {
        await database.execute(
          'INSERT INTO mr_formula (mr_id, formula_name, formula_type, batch_no, component_list, tp_ids, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            recipeId,
            name,
            type,
            batch || '',
            JSON.stringify(componentList),
            JSON.stringify(tpIds), // 直接关联测试ID
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      } catch (error) {
        console.error('Error saving formula:', error);
        return res.status(500).json({
          code: 500,
          message: 'Error saving formula: ' + error.message
        });
      }
      
      res.json({
        code: 200,
        message: 'Recipe submitted successfully',
        data: {
          recipeId,
          name,
          type,
          batch,
          components: processedComponents,
          tpIds
        }
      });
    } catch (error) {
      console.error('Error submitting final recipe:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error: ' + error.message
      });
    }
  }
}

module.exports = new RecipeParserController();
