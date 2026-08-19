const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
const vectorService = require('../services/vectorService');

class Database {
  constructor() {
    this.dbType = process.env.DB_TYPE || 'sqlite';
    this.db = null;
    this.models = {};
  }

  async connect() {
    if (this.dbType === 'sqlite') {
      return this.connectSQLite();
    } else if (this.dbType === 'mongodb') {
      return this.connectMongoDB();
    }
    throw new Error('Unsupported database type');
  }

  connectSQLite() {
    const dbPath = process.env.DB_PATH || './data/sqlite/database.db';
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('SQLite connection error:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  async connectMongoDB() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
    try {
      await mongoose.connect(uri);
      console.log('Connected to MongoDB');
      this.db = mongoose.connection;
      this.loadMongoDBModels();
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  loadMongoDBModels() {
    // 加载MongoDB模型
    const rawMaterialSchema = new mongoose.Schema({
      id: { type: String, unique: true, required: true },
      material_type: String,
      chemical_composition: String,
      chemical_embedding: [Number],
      physical_index: String,
      physical_embedding: [Number],
      category: String,
      particle_size: String,
      batch_meta: Object,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    const formulaSchema = new mongoose.Schema({
      id: { type: String, unique: true, required: true },
      raw_materials: Array,
      batch_meta: Object,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    const externalPhysicochemicalSchema = new mongoose.Schema({
      id: { type: Number, unique: true, required: true },
      material_id: String,
      chemical_properties: String,
      physical_properties: String,
      source: String,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    const testDataSchema = new mongoose.Schema({
      id: { type: String, unique: true, required: true },
      formula_id: String,
      test_time: Date,
      basic_index: Object,
      index_110_24h: Object,
      index_1450_24h: Object,
      index_1450_hot: Object,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    const workingConditionSchema = new mongoose.Schema({
      id: { type: String, unique: true, required: true },
      occur_time: Date,
      location: String,
      molten_iron_temp: Number,
      pressure: Number,
      outlet_height: Number,
      outlet_angle: Number,
      flow_rate: Number,
      outlet_time: String,
      frequency: Number,
      molten_iron_composition: String,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    const serviceDataSchema = new mongoose.Schema({
      id: { type: String, unique: true, required: true },
      formula_id: String,
      construction_length: Number,
      construction_thickness: Number,
      thickness_decay_vector: Array,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    const knowledgeBaseSchema = new mongoose.Schema({
      id: { type: String, unique: true, required: true },
      type: String,
      title: String,
      content: String,
      embedding: [Number],
      source: String,
      ext_fields: Object,
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now },
      is_delete: { type: Number, default: 0 }
    });

    this.models = {
      raw_material: mongoose.model('raw_material', rawMaterialSchema),
      formula: mongoose.model('formula', formulaSchema),
      external_physicochemical: mongoose.model('external_physicochemical', externalPhysicochemicalSchema),
      test_data: mongoose.model('test_data', testDataSchema),
      working_condition: mongoose.model('working_condition', workingConditionSchema),
      service_data: mongoose.model('service_data', serviceDataSchema),
      knowledge_base: mongoose.model('knowledge_base', knowledgeBaseSchema)
    };
  }

  // 通用创建方法
  async create(collection, data) {
    if (this.dbType === 'sqlite') {
      return this.createSQLite(collection, data);
    } else if (this.dbType === 'mongodb') {
      return this.createMongoDB(collection, data);
    }
  }

  async createSQLite(collection, data) {
    // 处理JSON字段
    const processedData = { ...data };
    for (const key in processedData) {
      if (typeof processedData[key] === 'object' && processedData[key] !== null) {
        processedData[key] = JSON.stringify(processedData[key]);
      }
    }

    const keys = Object.keys(processedData);
    const values = Object.values(processedData);
    const placeholders = keys.map(() => '?').join(', ');

    const sql = `INSERT INTO ${collection} (${keys.join(', ')}) VALUES (${placeholders})`;

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      });
    });
  }

  async createMongoDB(collection, data) {
    const Model = this.models[collection];
    if (!Model) {
      throw new Error(`Model ${collection} not found`);
    }

    const document = new Model(data);
    return await document.save();
  }

  // 通用读取方法
  async read(collection, query = {}, options = {}) {
    if (this.dbType === 'sqlite') {
      return this.readSQLite(collection, query, options);
    } else if (this.dbType === 'mongodb') {
      return this.readMongoDB(collection, query, options);
    }
  }

  async readSQLite(collection, query, options) {
    let sql = `SELECT * FROM ${collection} WHERE is_delete = 0`;
    const params = [];

    // 构建查询条件
    for (const key in query) {
      if (key === 'ext_fields') {
        // 处理扩展字段查询
        for (const extKey in query[key]) {
          sql += ` AND json_extract(ext_fields, '$.${extKey}') = ?`;
          params.push(query[key][extKey]);
        }
      } else {
        sql += ` AND ${key} = ?`;
        params.push(query[key]);
      }
    }

    // 添加排序
    if (options.sort) {
      sql += ` ORDER BY ${options.sort}`;
    }

    // 添加分页
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // 解析JSON字段
          const processedRows = rows.map(row => {
            const processedRow = { ...row };
            for (const key in processedRow) {
              try {
                processedRow[key] = JSON.parse(processedRow[key]);
              } catch (e) {
                // 不是JSON，保持原样
              }
            }
            return processedRow;
          });
          resolve(processedRows);
        }
      });
    });
  }

  async readMongoDB(collection, query, options) {
    const Model = this.models[collection];
    if (!Model) {
      throw new Error(`Model ${collection} not found`);
    }

    // 处理查询条件
    const mongooseQuery = { is_delete: 0 };
    for (const key in query) {
      if (key === 'ext_fields') {
        // 处理扩展字段查询
        for (const extKey in query[key]) {
          mongooseQuery[`ext_fields.${extKey}`] = query[key][extKey];
        }
      } else {
        mongooseQuery[key] = query[key];
      }
    }

    // 构建查询
    let mongooseQueryBuilder = Model.find(mongooseQuery);

    // 添加排序
    if (options.sort) {
      mongooseQueryBuilder = mongooseQueryBuilder.sort(options.sort);
    }

    // 添加分页
    if (options.limit) {
      mongooseQueryBuilder = mongooseQueryBuilder.limit(options.limit);
    }

    return await mongooseQueryBuilder.exec();
  }

  // 通用更新方法
  async update(collection, query, data) {
    if (this.dbType === 'sqlite') {
      return this.updateSQLite(collection, query, data);
    } else if (this.dbType === 'mongodb') {
      return this.updateMongoDB(collection, query, data);
    }
  }

  async updateSQLite(collection, query, data) {
    // 处理JSON字段
    const processedData = { ...data };
    for (const key in processedData) {
      if (typeof processedData[key] === 'object' && processedData[key] !== null) {
        processedData[key] = JSON.stringify(processedData[key]);
      }
    }

    const setClause = Object.keys(processedData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(processedData);

    let whereClause = 'is_delete = 0';
    for (const key in query) {
      whereClause += ` AND ${key} = ?`;
      values.push(query[key]);
    }

    const sql = `UPDATE ${collection} SET ${setClause} WHERE ${whereClause}`;

    return new Promise((resolve, reject) => {
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async updateMongoDB(collection, query, data) {
    const Model = this.models[collection];
    if (!Model) {
      throw new Error(`Model ${collection} not found`);
    }

    // 处理查询条件
    const mongooseQuery = { is_delete: 0 };
    for (const key in query) {
      mongooseQuery[key] = query[key];
    }

    return await Model.updateMany(mongooseQuery, { $set: data });
  }

  // 通用删除方法（软删除）
  async delete(collection, query) {
    if (this.dbType === 'sqlite') {
      return this.deleteSQLite(collection, query);
    } else if (this.dbType === 'mongodb') {
      return this.deleteMongoDB(collection, query);
    }
  }

  async deleteSQLite(collection, query) {
    let whereClause = 'is_delete = 0';
    const params = [];

    for (const key in query) {
      whereClause += ` AND ${key} = ?`;
      params.push(query[key]);
    }

    const sql = `UPDATE ${collection} SET is_delete = 1 WHERE ${whereClause}`;

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async deleteMongoDB(collection, query) {
    const Model = this.models[collection];
    if (!Model) {
      throw new Error(`Model ${collection} not found`);
    }

    // 处理查询条件
    const mongooseQuery = { is_delete: 0 };
    for (const key in query) {
      mongooseQuery[key] = query[key];
    }

    return await Model.updateMany(mongooseQuery, { $set: { is_delete: 1 } });
  }

  // 向量搜索方法
  async vectorSearch(collection, vector, field = 'embedding', limit = 5) {
    if (this.dbType === 'sqlite') {
      return this.vectorSearchSQLite(collection, vector, field, limit);
    } else if (this.dbType === 'mongodb') {
      return this.vectorSearchMongoDB(collection, vector, field, limit);
    }
  }

  async vectorSearchSQLite(collection, vector, field, limit) {
    // 从数据库中获取所有数据
    const sql = `SELECT * FROM ${collection} WHERE is_delete = 0`;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // 计算相似度
          const results = [];
          for (const row of rows) {
            try {
              const storedVector = JSON.parse(row[field]);
              const similarity = this.calculateSimilarity(vector, storedVector);
              results.push({ ...row, similarity });
            } catch (e) {
              // 跳过无法解析的向量
            }
          }

          // 按相似度排序并返回前N个
          results.sort((a, b) => b.similarity - a.similarity);
          resolve(results.slice(0, limit));
        }
      });
    });
  }

  async vectorSearchMongoDB(collection, vector, field, limit) {
    const Model = this.models[collection];
    if (!Model) {
      throw new Error(`Model ${collection} not found`);
    }

    // 这里使用简单的相似度计算，实际环境中可以使用MongoDB的向量搜索功能
    const documents = await Model.find({ is_delete: 0 }).exec();
    const results = [];

    for (const doc of documents) {
      const storedVector = doc[field];
      if (storedVector) {
        const similarity = this.calculateSimilarity(vector, storedVector);
        results.push({ ...doc.toObject(), similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  // 计算向量相似度（余弦相似度）
  calculateSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      return 0;
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  // 生成向量并存储
  async generateEmbedding(collection, id, field, text) {
    try {
      const vector = await vectorService.generateEmbedding(text);
      await this.update(collection, { id }, { [field]: vector });
      return vector;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  // 关联查询
  async getRelatedData(formulaId) {
    const relatedData = {
      formula: null,
      rawMaterials: [],
      testData: [],
      serviceData: []
    };

    // 查询配方
    relatedData.formula = (await this.read('formula', { id: formulaId }))[0];

    if (relatedData.formula) {
      // 查询原料
      if (relatedData.formula.raw_materials) {
        const rawMaterialIds = relatedData.formula.raw_materials.map(item => item.material_id);
        for (const materialId of rawMaterialIds) {
          const materials = await this.read('raw_material', { id: materialId });
          if (materials.length > 0) {
            relatedData.rawMaterials.push(materials[0]);
          }
        }
      }

      // 查询测试数据
      relatedData.testData = await this.read('test_data', { formula_id: formulaId });

      // 查询服役数据
      relatedData.serviceData = await this.read('service_data', { formula_id: formulaId });
    }

    return relatedData;
  }

  close() {
    if (this.dbType === 'sqlite' && this.db) {
      this.db.close();
    } else if (this.dbType === 'mongodb' && this.db) {
      mongoose.disconnect();
    }
  }
}

module.exports = new Database();
