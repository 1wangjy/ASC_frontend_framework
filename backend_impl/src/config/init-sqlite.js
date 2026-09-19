const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

class SQLiteInitializer {
  constructor(dbPath = './data/sqlite/database.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('SQLite connection error:', err);
          reject(err);
          return;
        }
        console.log('Connected to SQLite database');
        this.enableForeignKeys().then(() => {
          this.createTables().then(resolve).catch(reject);
        }).catch(reject);
      });
    });
  }

  async enableForeignKeys() {
    return new Promise((resolve, reject) => {
      this.db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          console.error('Error enabling foreign keys:', err);
          reject(err);
        } else {
          console.log('Foreign keys enabled');
          resolve();
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      const createTablesSql = `
        -- MP表：物质基础性质表
        CREATE TABLE IF NOT EXISTS mp_properties (
          mp_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          fixed_properties TEXT NOT NULL,
          custom_properties TEXT NOT NULL,
          mc_ids TEXT NOT NULL,
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- TP表：测试性质数据表
        CREATE TABLE IF NOT EXISTS tp_test_properties (
          tp_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          mp_id TEXT,
          test_params TEXT NOT NULL,
          test_results TEXT NOT NULL,
          mr_ids TEXT NOT NULL,
          test_condition TEXT DEFAULT '无',
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- MC表：原料数据表
        CREATE TABLE IF NOT EXISTS mc_material (
          mc_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          batch_no TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('支撑骨料', '抗侵蚀原料', '抗氧化剂', '填充细粉', '结合剂', '水', '其他')),
          component_list TEXT NOT NULL,
          is_mixed BOOLEAN NOT NULL,
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- MR表：配方数据表
        CREATE TABLE IF NOT EXISTS mr_formula (
          mr_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          formula_name TEXT NOT NULL,
          formula_type TEXT NOT NULL CHECK(formula_type IN ('铁线配方', '渣线配方', '烧成带配方', '过渡带配方', '其他', '未分类')),
          batch_no TEXT NOT NULL,
          component_list TEXT NOT NULL,
          tp_ids TEXT NOT NULL,
          fe_ids TEXT DEFAULT '[]',
          ru_ids TEXT DEFAULT '[]',
          creator TEXT,
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- FE表：工况数据表
        CREATE TABLE IF NOT EXISTS fe_working_condition (
          fe_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          condition_name TEXT NOT NULL,
          condition_type TEXT NOT NULL,
          condition_params TEXT NOT NULL,
          mr_ids TEXT NOT NULL,
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- RU表：服役数据表
        CREATE TABLE IF NOT EXISTS ru_service_data (
          ru_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          service_name TEXT NOT NULL,
          service_type TEXT NOT NULL,
          service_params TEXT NOT NULL,
          fe_ids TEXT NOT NULL,
          mr_ids TEXT NOT NULL,
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- 文献表
        CREATE TABLE IF NOT EXISTS literature (
          lit_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
          title TEXT NOT NULL,
          authors TEXT,
          journal TEXT,
          year INTEGER,
          volume TEXT,
          number TEXT,
          pages TEXT,
          doi TEXT,
          abstract TEXT,
          note TEXT,
          entry_type TEXT,
          attachment TEXT,
          collection TEXT,           -- 文献收集批次标记（如 aug / sep）
          create_time TIMESTAMP NOT NULL,
          update_time TIMESTAMP NOT NULL,
          is_delete INTEGER DEFAULT 0
        );

        -- 工况数据表（保留原有结构向后兼容）
        CREATE TABLE IF NOT EXISTS working_condition (
          id TEXT PRIMARY KEY,
          occur_time DATETIME,
          location TEXT,
          molten_iron_temp FLOAT,
          pressure FLOAT,
          outlet_height FLOAT,
          outlet_angle FLOAT,
          flow_rate FLOAT,
          outlet_time TEXT,
          frequency INTEGER,
          molten_iron_composition TEXT,
          ext_fields TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- 服役数据表（保留原有结构向后兼容）
        CREATE TABLE IF NOT EXISTS service_data (
          id TEXT PRIMARY KEY,
          formula_id TEXT,
          construction_length FLOAT,
          construction_thickness FLOAT,
          thickness_decay_vector TEXT,
          ext_fields TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- 知识库数据表（保留原有结构）
        CREATE TABLE IF NOT EXISTS knowledge_base (
          id TEXT PRIMARY KEY,
          type TEXT,
          title TEXT,
          content TEXT,
          embedding TEXT,
          source TEXT,
          ext_fields TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- 用户表（保留原有结构）
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- 向量表
        CREATE TABLE IF NOT EXISTS embeddings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          vector TEXT NOT NULL,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- Model1: 配方提交记录
        CREATE TABLE IF NOT EXISTS recipes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          content TEXT,
          vector TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- Model2: 测试指标记录
        CREATE TABLE IF NOT EXISTS test_indicators (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recipe_id INTEGER,
          value REAL,
          type TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- Model3: 工况记录
        CREATE TABLE IF NOT EXISTS working_conditions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          temperature REAL,
          pressure REAL,
          time REAL,
          vector TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0
        );

        -- ===== 统一 ML 预测数据集 (录自 ./private/*.npy, 隐私本地) =====
        -- 每样本 = 一个配方(formula): 变长 n 个组分的 51 维特征(含 PC1..PC20 等),
        -- X_global 3 维, y_labels 为各目标性质(按温度)的均值/方差等。
        CREATE TABLE IF NOT EXISTS ml_formula (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dataset_source TEXT NOT NULL,
          recipe_id TEXT NOT NULL,
          n_components INTEGER NOT NULL DEFAULT 0,
          x_global TEXT NOT NULL DEFAULT '[]',
          x_global_names TEXT NOT NULL DEFAULT '[]',
          y_labels TEXT NOT NULL DEFAULT '{}',
          remark TEXT DEFAULT '',
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_delete INTEGER DEFAULT 0,
          UNIQUE(dataset_source, recipe_id)
        );

        -- 组分层: 每个 (source, recipe_id) 的每个组分一行, 51 特征以 JSON 存 (宽松容纳更多 PC/特征)
        CREATE TABLE IF NOT EXISTS ml_formula_component (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dataset_source TEXT NOT NULL,
          recipe_id TEXT NOT NULL,
          comp_index INTEGER NOT NULL,
          material_id TEXT,
          ratio_pct REAL,
          component_features TEXT NOT NULL DEFAULT '{}',
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(dataset_source, recipe_id, comp_index)
        );

        CREATE INDEX IF NOT EXISTS idx_ml_formula_source ON ml_formula(dataset_source);
        CREATE INDEX IF NOT EXISTS idx_ml_formula_source_recipe ON ml_formula(dataset_source, recipe_id);
        CREATE INDEX IF NOT EXISTS idx_ml_comp_source_recipe ON ml_formula_component(dataset_source, recipe_id);

        -- ML 数据集元数据 / 特征归一化统计 (供后续训练口径统一, 特征名与统计存库)
        CREATE TABLE IF NOT EXISTS ml_dataset_meta (
          dataset_source TEXT PRIMARY KEY,
          sample_count INTEGER NOT NULL DEFAULT 0,
          total_component_count INTEGER NOT NULL DEFAULT 0,
          comp_feature_names TEXT NOT NULL DEFAULT '[]',
          global_feature_names TEXT NOT NULL DEFAULT '[]',
          y_feature_keys TEXT NOT NULL DEFAULT '[]',
          dataset_version TEXT DEFAULT '1',
          ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          remark TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS ml_feature_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dataset_source TEXT NOT NULL,
          feature_name TEXT NOT NULL,
          feature_kind TEXT NOT NULL CHECK(feature_kind IN ('comp','global')),
          count INTEGER NOT NULL DEFAULT 0,
          mean REAL,
          std REAL,
          min REAL,
          max REAL,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(dataset_source, feature_name, feature_kind)
        );

        -- 文献内容文件索引 (local provider 引用/存储条目)
        CREATE TABLE IF NOT EXISTS lit_file (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lit_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          storage TEXT NOT NULL,
          size INTEGER,
          sha256 TEXT,
          mime TEXT,
          source TEXT,
          create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(lit_id, kind, filename)
        );
        CREATE INDEX IF NOT EXISTS idx_lit_file_lit ON lit_file(lit_id);
        CREATE INDEX IF NOT EXISTS idx_lit_file_sha ON lit_file(sha256);

        -- 创建索引
        CREATE INDEX IF NOT EXISTS idx_mp_mc_ids ON mp_properties(mc_ids);
        CREATE INDEX IF NOT EXISTS idx_tp_mr_ids ON tp_test_properties(mr_ids);
        CREATE INDEX IF NOT EXISTS idx_mc_type ON mc_material(type);
        CREATE INDEX IF NOT EXISTS idx_mr_formula_type ON mr_formula(formula_type);
        CREATE INDEX IF NOT EXISTS idx_mr_tp_ids ON mr_formula(tp_ids);
        CREATE INDEX IF NOT EXISTS idx_fe_condition_type ON fe_working_condition(condition_type);
        CREATE INDEX IF NOT EXISTS idx_fe_mr_ids ON fe_working_condition(mr_ids);
        CREATE INDEX IF NOT EXISTS idx_ru_service_type ON ru_service_data(service_type);
        CREATE INDEX IF NOT EXISTS idx_ru_fe_ids ON ru_service_data(fe_ids);
        CREATE INDEX IF NOT EXISTS idx_ru_mr_ids ON ru_service_data(mr_ids);
        CREATE INDEX IF NOT EXISTS idx_embeddings_type ON embeddings(type);
        CREATE INDEX IF NOT EXISTS idx_embeddings_source_id ON embeddings(source_id);
      `;

      this.db.exec(createTablesSql, (err) => {
        if (err) {
          console.error('Error creating tables:', err);
          reject(err);
        } else {
          console.log('SQLite tables created successfully');
          this.ensureLiteratureAttachmentColumn()
            .then(() => this.ensureLiteratureCollectionColumn())
            .then(() => this.initBasicData())
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  async ensureLiteratureCollectionColumn() {
    const columns = await new Promise((resolve, reject) => {
      this.db.all('PRAGMA table_info(literature)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    if (columns.some(column => column.name === 'collection')) return;
    await this.dbRun('ALTER TABLE literature ADD COLUMN collection TEXT', []);
    console.log('Added literature.collection column');
  }

  async ensureLiteratureAttachmentColumn() {
    const columns = await new Promise((resolve, reject) => {
      this.db.all('PRAGMA table_info(literature)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (columns.some(column => column.name === 'attachment')) return;
    await this.dbRun('ALTER TABLE literature ADD COLUMN attachment TEXT', []);
    console.log('Added literature.attachment column');
  }

  async initBasicData() {
    console.log('Initializing basic data...');
    
    const defaultUsername = 'admin';
    const defaultPassword = require('crypto').randomBytes(8).toString('hex');
    
    try {
      // 创建 admin 用户
      const row = await new Promise((resolve, reject) => {
        this.db.get('SELECT id FROM users WHERE username = ?', [defaultUsername], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
      
      if (!row) {
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        await this.dbRun(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          [defaultUsername, hashedPassword, 'admin']
        );
        console.log('Default admin user created');
        console.log(`========================================`);
        console.log(`Admin credentials: ${defaultUsername} / ${defaultPassword}`);
        console.log(`IMPORTANT: Please change this password immediately!`);
        console.log(`========================================`);
      } else {
        console.log('Admin user already exists');
      }
      
      // 插入样例业务数据（如果表为空）
      await this.initSampleData();
    } catch (error) {
      console.error('Error initializing basic data:', error);
      throw error;
    }
  }

  dbRun(sql, params) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  async initSampleData() {
    // 检查是否已有样例数据（幂等性）
    const hasData = await new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as cnt FROM mp_properties', (err, row) => {
        if (err) return reject(err);
        resolve(row && row.cnt > 0);
      });
    });
    if (hasData) {
      console.log('[init-sample] Sample data already exists, skipping');
      return;
    }

    console.log('[init-sample] Inserting sample data...');

    const samples = {
      mp: [
        {
          mp_id: 'MP_000001',
          fixed_properties: JSON.stringify([2.7,1.5,1000,50,1.2,0.8,1500,20,80,30,1.5,0.05,25,0.1,10,5,8,12,0.5,0.3,0.2,0.1,0.05,0.02,0.01,0.005,0.001,0.0005,0.0001,0.00005,0.00001]),
          custom_properties: JSON.stringify([{name:'纯度',value:99.5},{name:'粒度',value:100},{name:'颜色',value:1},{name:'硬度',value:8.5}]),
          mc_ids: JSON.stringify(['MC_000001'])
        },
        {
          mp_id: 'MP_000002',
          fixed_properties: JSON.stringify([3.2,2.0,1200,60,1.5,1.0,1600,25,85,35,1.8,0.06,28,0.12,12,6,9,14,0.6,0.4,0.25,0.15,0.08,0.03,0.015,0.008,0.002,0.001,0.0005,0.0002,0.0001]),
          custom_properties: JSON.stringify([{name:'纯度',value:98.5},{name:'粒度',value:120},{name:'颜色',value:2},{name:'硬度',value:9.0}]),
          mc_ids: JSON.stringify(['MC_000002'])
        },
        {
          mp_id: 'MP_000003',
          fixed_properties: JSON.stringify([2.1,1.0,800,40,0.8,0.5,1300,15,75,25,1.2,0.04,22,0.08,8,4,7,10,0.4,0.2,0.15,0.08,0.04,0.01,0.008,0.004,0.0008,0.0004,0.0002,0.0001,0.00005]),
          custom_properties: JSON.stringify([{name:'纯度',value:99.0},{name:'粒度',value:80},{name:'颜色',value:3},{name:'硬度',value:7.5}]),
          mc_ids: JSON.stringify(['MC_000003'])
        }
      ],
      mc: [
        { mc_id:'MC_000001', batch_no:'No.250303', type:'支撑骨料', component_list: JSON.stringify([['高铝铝土','MP_000001','{}',100]]), is_mixed: 0 },
        { mc_id:'MC_000002', batch_no:'No.250303', type:'抗侵蚀原料', component_list: JSON.stringify([['碳化硅','MP_000002','{}',100]]), is_mixed: 0 },
        { mc_id:'MC_000003', batch_no:'No.250303', type:'抗氧化剂', component_list: JSON.stringify([['金属铝粉','MP_000003','{}',100]]), is_mixed: 0 }
      ],
      mr: [
        {
          mr_id:'MR_000001', formula_name:'铁线配方A', formula_type:'铁线配方', batch_no:'No.250303',
          component_list: JSON.stringify([['高铝铝土','MC_000001','{}',70],['碳化硅','MC_000002','{}',20],['金属铝粉','MC_000003','{}',10]]),
          tp_ids: JSON.stringify(['TP_000001']), fe_ids:'[]', ru_ids:'[]', creator:'admin'
        },
        {
          mr_id:'MR_000002', formula_name:'渣线配方B', formula_type:'渣线配方', batch_no:'No.250303',
          component_list: JSON.stringify([['高铝铝土','MC_000001','{}',60],['碳化硅','MC_000002','{}',30],['金属铝粉','MC_000003','{}',10]]),
          tp_ids: JSON.stringify(['TP_000002']), fe_ids:'[]', ru_ids:'[]', creator:'admin'
        }
      ],
      tp: [
        {
          tp_id:'TP_000001', mp_id:'MP_000001',
          test_params: JSON.stringify({temperature:1100,time:24,atmosphere:'air'}),
          test_results: JSON.stringify({fixed:[120,50,2.6,20,1.1,0.7,1450,18,78,28,1.4,0.04,24,0.09,9,4,7,11,0.4,0.2,0.15,0.08,0.04,0.01,0.008,0.004,0.0008,0.0004,0.0002,0.0001,0.00005],custom:[{name:'耐压强度',value:120},{name:'抗折强度',value:50},{name:'体积密度',value:2.6},{name:'显气孔率',value:20}]}),
          mr_ids: JSON.stringify(['MR_000001']), test_condition:'110C24H'
        },
        {
          tp_id:'TP_000002', mp_id:'MP_000002',
          test_params: JSON.stringify({temperature:1450,time:24,atmosphere:'air'}),
          test_results: JSON.stringify({fixed:[150,60,3.1,15,1.4,0.9,1550,23,83,33,1.7,0.05,27,0.11,11,5,8,13,0.5,0.3,0.2,0.12,0.06,0.02,0.012,0.006,0.0015,0.0008,0.0003,0.00015,0.00008],custom:[{name:'耐压强度',value:150},{name:'抗折强度',value:60},{name:'体积密度',value:3.1},{name:'显气孔率',value:15}]}),
          mr_ids: JSON.stringify(['MR_000002']), test_condition:'1450C24H'
        }
      ]
    };

    const now = new Date().toISOString();

    for (const mp of samples.mp) {
      await this.dbRun(
        'INSERT OR IGNORE INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time, is_delete) VALUES (?,?,?,?,?,?,?)',
        [mp.mp_id, mp.fixed_properties, mp.custom_properties, mp.mc_ids, now, now, 0]
      );
    }
    console.log('[init-sample] MP data inserted (3 rows)');

    for (const mc of samples.mc) {
      await this.dbRun(
        'INSERT OR IGNORE INTO mc_material (mc_id, batch_no, type, component_list, is_mixed, create_time, update_time, is_delete) VALUES (?,?,?,?,?,?,?,?)',
        [mc.mc_id, mc.batch_no, mc.type, mc.component_list, mc.is_mixed, now, now, 0]
      );
    }
    console.log('[init-sample] MC data inserted (3 rows)');

    for (const mr of samples.mr) {
      await this.dbRun(
        'INSERT OR IGNORE INTO mr_formula (mr_id, formula_name, formula_type, batch_no, component_list, tp_ids, fe_ids, ru_ids, creator, create_time, update_time, is_delete) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [mr.mr_id, mr.formula_name, mr.formula_type, mr.batch_no, mr.component_list, mr.tp_ids, mr.fe_ids, mr.ru_ids, mr.creator, now, now, 0]
      );
    }
    console.log('[init-sample] MR data inserted (2 rows)');

    for (const tp of samples.tp) {
      await this.dbRun(
        'INSERT OR IGNORE INTO tp_test_properties (tp_id, mp_id, test_params, test_results, mr_ids, test_condition, create_time, update_time, is_delete) VALUES (?,?,?,?,?,?,?,?,?)',
        [tp.tp_id, tp.mp_id, tp.test_params, tp.test_results, tp.mr_ids, tp.test_condition, now, now, 0]
      );
    }
    console.log('[init-sample] TP data inserted (2 rows)');
    console.log('[init-sample] All sample data inserted successfully');
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('SQLite database closed');
    }
  }
}

module.exports = SQLiteInitializer;
