const path = require('path');
const database = require('../config/database');
const PropertiesService = require('../services/propertiesService');

// 允许的表名白名单（防止SQL注入）
const ALLOWED_TABLES = [
  'mp_properties', 'mc_material', 'tp_test_properties',
  'fe_working_condition', 'ru_service_data', 'mr_formula',
  'knowledge_base', 'users', 'literature',
  'working_condition', 'service_data', 'embeddings', 'raw_material'
];

function validateTableName(table) {
  if (!ALLOWED_TABLES.includes(table)) {
    const error = new Error(`Invalid table name: ${table}`);
    error.statusCode = 400;
    throw error;
  }
  return table;
}

// 获取数据库路径信息
exports.getDatabasePaths = (req, res) => {
  const sqlitePath = './data/sqlite/database.db';
  const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
  
  res.json({
    code: 200,
    message: 'Database paths retrieved successfully',
    data: {
      sqlite: sqlitePath,
      mongodb: mongodbUri
    }
  });
};

// 获取表格数据
exports.getTableData = async (req, res) => {
  const { table } = req.params;
  try {
    validateTableName(table);
  } catch (err) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  
  try {
    // 构建查询语句
    const rows = await database.query(`SELECT * FROM ${table} WHERE is_delete = 0`);
    
    // 解析JSON字段
    const parsedRows = rows.map(row => {
      const parsedRow = { ...row };
      
      // 处理物化性质字段（使用纯相原料物化性质）
      if (table === 'raw_material' && parsedRow.physical_properties) {
        try {
          const { propertyArray, customProperties } = PropertiesService.parsePureFromDatabase(parsedRow.physical_properties);
          parsedRow.physical_properties_display = PropertiesService.formatPureForDisplay(propertyArray, customProperties);
          parsedRow.physical_properties_raw = parsedRow.physical_properties;
        } catch (e) {
          parsedRow.physical_properties_display = parsedRow.physical_properties;
        }
      }
      
      // 解析其他JSON字段
      Object.keys(parsedRow).forEach(key => {
        if (key !== 'physical_properties_display' && key !== 'physical_properties_raw' && typeof parsedRow[key] === 'string') {
          try {
            parsedRow[key] = JSON.parse(parsedRow[key]);
          } catch (e) {
            // 不是JSON，保持原样
          }
        }
      });
      
      return parsedRow;
    });
    
    res.json(parsedRows);
  } catch (err) {
    console.error('Error querying database:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
};

// 生成唯一ID
function generateId(prefix, useTimestamp = false) {
  if (useTimestamp) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 8);
    return `${timestamp}-${random}`;
  } else {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${random}`;
  }
}

// 添加数据
exports.addData = async (req, res) => {
  const { table } = req.params;
  try {
    validateTableName(table);
  } catch (err) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  const data = req.body;
  
  try {
    // 处理测试数据表的特殊情况
    if (table === 'tp_test_properties' && data.recipeId && data.testResults) {
      // 生成测试ID
      const tpId = generateId('TP');
      
      // 构建测试数据
      const testParams = JSON.stringify({});
      const testResults = JSON.stringify({
        fixed: [],
        custom: Object.entries(data.testResults).map(([key, value]) => {
          let testValue = value;
          let testUnit = '';
          if (typeof value === 'object' && value !== null) {
            testValue = value.value;
            testUnit = value.unit || '';
          }
          return { name: key, value: testValue, unit: testUnit };
        })
      });
      
      // 构建插入语句
      const query = `INSERT INTO tp_test_properties (tp_id, mp_id, test_params, test_results, mr_ids, test_condition, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const values = [tpId, '', testParams, testResults, JSON.stringify([data.recipeId]), '无', new Date().toISOString(), new Date().toISOString()];
      
      await database.execute(query, values);
      
      // 更新配方数据，将测试ID添加到tp_ids字段中
      try {
        const rows = await database.query('SELECT tp_ids FROM mr_formula WHERE mr_id = ?', [data.recipeId]);
        let tpIds = [];
        if (rows && rows[0] && rows[0].tp_ids) {
          try {
            tpIds = JSON.parse(rows[0].tp_ids);
            if (!Array.isArray(tpIds)) tpIds = [];
          } catch (e) {
            tpIds = [];
          }
        }
        if (!tpIds.includes(tpId)) {
          tpIds.push(tpId);
        }
        await database.execute(
          'UPDATE mr_formula SET tp_ids = ?, update_time = ? WHERE mr_id = ?',
          [JSON.stringify(tpIds), new Date().toISOString(), data.recipeId]
        );
      } catch (err) {
        console.error('Error updating formula tp_ids:', err.message);
      }
      
      return res.json({ success: true, id: tpId });
    }
    
    // 处理JSON字段
    const processedData = { ...data };
    
    if (table === 'raw_material' && !processedData.id) {
      processedData.id = generateId('RM', true);
    }
    
    if (table === 'raw_material' && processedData.physical_properties) {
      try {
        const { propertyArray, customProperties } = PropertiesService.parsePureInput(processedData.physical_properties);
        processedData.physical_properties = PropertiesService.pureToDatabase(propertyArray, customProperties);
      } catch (e) {
        console.error('Error parsing physical properties:', e);
      }
    }
    
    Object.keys(processedData).forEach(key => {
      if (key !== 'physical_properties' && typeof processedData[key] === 'object' && processedData[key] !== null) {
        processedData[key] = JSON.stringify(processedData[key]);
      }
    });
    
    const columns = Object.keys(processedData).join(', ');
    const placeholders = Object.keys(processedData).map(() => '?').join(', ');
    const values = Object.values(processedData);
    
    const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const result = await database.execute(query, values);
    
    res.json({ success: true, id: processedData.id || result.lastID });
  } catch (error) {
    console.error('Error inserting data:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
};

// 更新数据
exports.updateData = async (req, res) => {
  const { table, id } = req.params;
  try {
    validateTableName(table);
  } catch (err) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  const data = req.body;
  
  try {
    // 处理JSON字段
    const processedData = { ...data };
    
    if (table === 'raw_material' && processedData.physical_properties) {
      try {
        const { propertyArray, customProperties } = PropertiesService.parsePureInput(processedData.physical_properties);
        processedData.physical_properties = PropertiesService.pureToDatabase(propertyArray, customProperties);
      } catch (e) {
        console.error('Error parsing physical properties:', e);
      }
    }
    
    Object.keys(processedData).forEach(key => {
      if (key !== 'physical_properties' && typeof processedData[key] === 'object' && processedData[key] !== null) {
        processedData[key] = JSON.stringify(processedData[key]);
      }
    });
    
    processedData.update_time = new Date().toISOString();
    
    const setClause = Object.keys(processedData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(processedData), id];
    
    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    const result = await database.execute(query, values);
    
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('Error updating data:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
};

// 删除数据（软删除）
exports.deleteData = async (req, res) => {
  const { table, id } = req.params;
  try {
    validateTableName(table);
  } catch (err) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  
  try {
    const query = `UPDATE ${table} SET is_delete = 1 WHERE id = ?`;
    const result = await database.execute(query, [id]);
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('Error deleting data:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
};