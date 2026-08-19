const mongoose = require('mongoose');

class MongoDBInitializer {
  constructor(uri = 'mongodb://localhost:27017/asc-platform') {
    this.uri = uri;
    this.connection = null;
  }

  async init() {
    try {
      // 连接数据库
      this.connection = await mongoose.connect(this.uri);
      console.log('Connected to MongoDB');
      
      // 创建集合和索引
      await this.createCollections();
      console.log('MongoDB initialization completed');
    } catch (error) {
      console.error('MongoDB initialization error:', error);
      throw error;
    }
  }

  async createCollections() {
    // 原料数据集合
    const rawMaterialSchema = new mongoose.Schema({
      id: {
        type: String,
        unique: true,
        required: true
      },
      material_type: String,
      chemical_composition: String,
      chemical_embedding: [Number],
      physical_index: String,
      physical_embedding: [Number],
      category: String,
      particle_size: String,
      batch_meta: Object,
      ext_fields: Object,
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 配方数据集合
    const formulaSchema = new mongoose.Schema({
      id: {
        type: String,
        unique: true,
        required: true
      },
      raw_materials: Array,
      batch_meta: Object,
      ext_fields: Object,
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 外源物化数据集合
    const externalPhysicochemicalSchema = new mongoose.Schema({
      id: {
        type: Number,
        unique: true,
        required: true
      },
      material_id: String,
      chemical_properties: String,
      physical_properties: String,
      source: String,
      ext_fields: Object,
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 测试数据集合
    const testDataSchema = new mongoose.Schema({
      id: {
        type: String,
        unique: true,
        required: true
      },
      formula_id: String,
      test_time: Date,
      basic_index: Object,
      index_110_24h: Object,
      index_1450_24h: Object,
      index_1450_hot: Object,
      ext_fields: Object,
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 工况数据集合
    const workingConditionSchema = new mongoose.Schema({
      id: {
        type: String,
        unique: true,
        required: true
      },
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
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 服役数据集合
    const serviceDataSchema = new mongoose.Schema({
      id: {
        type: String,
        unique: true,
        required: true
      },
      formula_id: String,
      construction_length: Number,
      construction_thickness: Number,
      thickness_decay_vector: Array,
      ext_fields: Object,
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 知识库数据集合
    const knowledgeBaseSchema = new mongoose.Schema({
      id: {
        type: String,
        unique: true,
        required: true
      },
      type: String,
      title: String,
      content: String,
      embedding: [Number],
      source: String,
      ext_fields: Object,
      create_time: {
        type: Date,
        default: Date.now
      },
      update_time: {
        type: Date,
        default: Date.now
      },
      is_delete: {
        type: Number,
        default: 0
      }
    });
    
    // 创建集合
    const RawMaterial = mongoose.model('raw_material', rawMaterialSchema);
    const Formula = mongoose.model('formula', formulaSchema);
    const ExternalPhysicochemical = mongoose.model('external_physicochemical', externalPhysicochemicalSchema);
    const TestData = mongoose.model('test_data', testDataSchema);
    const WorkingCondition = mongoose.model('working_condition', workingConditionSchema);
    const ServiceData = mongoose.model('service_data', serviceDataSchema);
    const KnowledgeBase = mongoose.model('knowledge_base', knowledgeBaseSchema);
    
    // 创建索引
    await this.createIndexes(RawMaterial, [
      { fields: { material_type: 1 } },
      { fields: { id: 1 } }
    ]);
    
    await this.createIndexes(Formula, [
      { fields: { id: 1 } }
    ]);
    
    await this.createIndexes(ExternalPhysicochemical, [
      { fields: { material_id: 1 } },
      { fields: { id: 1 } }
    ]);
    
    await this.createIndexes(TestData, [
      { fields: { formula_id: 1 } },
      { fields: { id: 1 } }
    ]);
    
    await this.createIndexes(ServiceData, [
      { fields: { formula_id: 1 } },
      { fields: { id: 1 } }
    ]);
    
    await this.createIndexes(KnowledgeBase, [
      { fields: { type: 1 } },
      { fields: { id: 1 } }
    ]);
    
    // 为知识库集合创建向量索引（如果MongoDB支持）
    // 注意：实际环境中需要根据MongoDB版本和配置进行调整
    try {
      await KnowledgeBase.collection.createIndex({ embedding: 'vector' });
      console.log('Vector index created for knowledge_base');
    } catch (error) {
      console.warn('Vector index creation failed (may not be supported):', error.message);
    }

    // 用户集合
    const userSchema = new mongoose.Schema({
      id: { type: Number, unique: true, required: true },
      username: { type: String, unique: true, required: true },
      password: { type: String, required: true },
      role: { type: String, default: 'user' },
      is_delete: { type: Number, default: 0 },
      create_time: { type: Date, default: Date.now },
      update_time: { type: Date, default: Date.now }
    });
    const User = mongoose.model('users', userSchema);
    await this.createIndexes(User, [
      { fields: { username: 1 } },
      { fields: { id: 1 } }
    ]);

    // 创建默认 admin 用户
    const bcrypt = require('bcrypt');
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      const defaultPassword = 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await User.create({
        id: 1,
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('Default admin user created (username: admin, password: admin123)');
    } else {
      console.log('Admin user already exists');
    }
  }

  async createIndexes(model, indexes) {
    for (const index of indexes) {
      try {
        await model.collection.createIndex(index.fields);
        console.log(`Index created for ${model.modelName}:`, index.fields);
      } catch (error) {
        console.warn(`Index creation failed for ${model.modelName}:`, error.message);
      }
    }
  }

  async close() {
    if (this.connection) {
      await this.connection.disconnect();
      console.log('MongoDB connection closed');
    }
  }
}

module.exports = MongoDBInitializer;
