const sqlite3 = require('sqlite3').verbose();
const idGenerator = require('../utils/idGenerator');
const { PURE_MATERIAL_PROPERTIES, TEST_PROPERTIES } = require('../config/properties-def');

class NewDbService {
  constructor(dbPath = './data/sqlite/database.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('SQLite connection error:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database for new tables');
          this.db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
              console.error('Error enabling foreign keys:', err);
            }
            resolve();
          });
        }
      });
    });
  }

  async initFixedProperties() {
    return new Array(32).fill(-1);
  }

  async initCustomProperties() {
    return [
      { name: '', value: -1 },
      { name: '', value: -1 },
      { name: '', value: -1 },
      { name: '', value: -1 }
    ];
  }

  async createMp(fixedProperties = null, customProperties = null) {
    const mpId = idGenerator.generateMpId();
    const now = idGenerator.getCurrentTimestamp();
    const fixedProps = fixedProperties || await this.initFixedProperties();
    const customProps = customProperties || await this.initCustomProperties();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)`;
      const params = [
        mpId,
        JSON.stringify(fixedProps),
        JSON.stringify(customProps),
        JSON.stringify([]),
        now,
        now
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            mp_id: mpId,
            fixed_properties: fixedProps,
            custom_properties: customProps,
            mc_ids: [],
            create_time: now,
            update_time: now
          });
        }
      });
    });
  }

  async getMp(mpId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mp_properties WHERE mp_id = ?';
      this.db.get(sql, [mpId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            ...row,
            fixed_properties: JSON.parse(row.fixed_properties),
            custom_properties: JSON.parse(row.custom_properties),
            mc_ids: JSON.parse(row.mc_ids)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateMp(mpId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        if (typeof updates[key] === 'object' && updates[key] !== null) {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    params.push(mpId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE mp_properties SET ${setClauses.join(', ')} WHERE mp_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async addMcToMp(mpId, mcId) {
    const mp = await this.getMp(mpId);
    if (!mp) {
      throw new Error('MP not found');
    }
    
    const mcIds = [...mp.mc_ids];
    if (!mcIds.includes(mcId)) {
      mcIds.push(mcId);
      await this.updateMp(mpId, { mc_ids: mcIds });
    }
  }

  async removeMcFromMp(mpId, mcId) {
    const mp = await this.getMp(mpId);
    if (!mp) {
      throw new Error('MP not found');
    }
    
    const mcIds = mp.mc_ids.filter(id => id !== mcId);
    await this.updateMp(mpId, { mc_ids: mcIds });
  }

  async getAllMps() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mp_properties';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            fixed_properties: JSON.parse(row.fixed_properties),
            custom_properties: JSON.parse(row.custom_properties),
            mc_ids: JSON.parse(row.mc_ids)
          })));
        }
      });
    });
  }

  async getAllTps() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM tp_test_properties';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            test_params: this.parseJsonSafely(row.test_params, {}),
            test_results: this.parseJsonSafely(row.test_results, {}),
            mr_ids: this.parseJsonSafely(row.mr_ids, [])
          })));
        }
      });
    });
  }

  async getAllMcs() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mc_material';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            component_list: this.parseJsonSafely(row.component_list, []),
            is_mixed: !!row.is_mixed
          })));
        }
      });
    });
  }

  async getAllMrs() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mr_formula';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            component_list: this.parseJsonSafely(row.component_list, []),
            tp_ids: this.parseJsonSafely(row.tp_ids, [])
          })));
        }
      });
    });
  }

  parseJsonSafely(jsonString, defaultValue = null) {
    try {
      return jsonString ? JSON.parse(jsonString) : defaultValue;
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return defaultValue;
    }
  }

  async getAllFes() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM fe_working_condition';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            condition_params: this.parseJsonSafely(row.condition_params, {}),
            mr_ids: this.parseJsonSafely(row.mr_ids, [])
          })));
        }
      });
    });
  }

  async getAllRus() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM ru_service_data';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            service_params: this.parseJsonSafely(row.service_params, {}),
            fe_ids: this.parseJsonSafely(row.fe_ids, []),
            mr_ids: this.parseJsonSafely(row.mr_ids, [])
          })));
        }
      });
    });
  }

  async createTp(mpId, testParams = {}, testResults = null, testCondition = '无') {
    const tpId = idGenerator.generateTpId();
    const now = idGenerator.getCurrentTimestamp();
    const defaultResults = {
      fixed: await this.initFixedProperties(),
      custom: await this.initCustomProperties()
    };

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO tp_test_properties (tp_id, mp_id, test_params, test_results, mr_ids, test_condition, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        tpId,
        mpId,
        JSON.stringify(testParams),
        JSON.stringify(testResults || defaultResults),
        JSON.stringify([]),
        testCondition,
        now,
        now
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            tp_id: tpId,
            mp_id: mpId,
            test_params: testParams,
            test_results: testResults || defaultResults,
            mr_ids: [],
            test_condition: testCondition,
            create_time: now,
            update_time: now
          });
        }
      });
    });
  }

  async getTp(tpId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM tp_test_properties WHERE tp_id = ?';
      this.db.get(sql, [tpId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            ...row,
            test_params: JSON.parse(row.test_params),
            test_results: JSON.parse(row.test_results),
            mr_ids: JSON.parse(row.mr_ids)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateTp(tpId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        if (typeof updates[key] === 'object' && updates[key] !== null) {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    params.push(tpId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE tp_test_properties SET ${setClauses.join(', ')} WHERE tp_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async addMrToTp(tpId, mrId) {
    const tp = await this.getTp(tpId);
    if (!tp) {
      throw new Error('TP not found');
    }
    
    const mrIds = [...tp.mr_ids];
    if (!mrIds.includes(mrId)) {
      mrIds.push(mrId);
      await this.updateTp(tpId, { mr_ids: mrIds });
    }
  }

  async removeMrFromTp(tpId, mrId) {
    const tp = await this.getTp(tpId);
    if (!tp) {
      throw new Error('TP not found');
    }
    
    const mrIds = tp.mr_ids.filter(id => id !== mrId);
    await this.updateTp(tpId, { mr_ids: mrIds });
  }

  async createMc(batchNo, type, componentList = []) {
    const mcId = idGenerator.generateMcId();
    const now = idGenerator.getCurrentTimestamp();
    const isMixed = componentList.length > 1;

    const components = componentList.length === 0 
      ? [[batchNo, null, JSON.stringify({}), 100]]
      : componentList;

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO mc_material (mc_id, batch_no, type, component_list, is_mixed, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        mcId,
        batchNo,
        type,
        JSON.stringify(components),
        isMixed ? 1 : 0,
        now,
        now
      ];

      this.db.run(sql, params, async (err) => {
        if (err) {
          reject(err);
        } else {
          try {
            for (const component of components) {
              const [, mpId] = component;
              if (mpId) {
                await this.addMcToMp(mpId, mcId);
              }
            }
            resolve({
              mc_id: mcId,
              batch_no: batchNo,
              type: type,
              component_list: components,
              is_mixed: isMixed,
              create_time: now,
              update_time: now
            });
          } catch (updateErr) {
            reject(updateErr);
          }
        }
      });
    });
  }

  async getMc(mcId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mc_material WHERE mc_id = ?';
      this.db.get(sql, [mcId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            ...row,
            component_list: JSON.parse(row.component_list),
            is_mixed: !!row.is_mixed
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateMc(mcId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    if (updates.component_list) {
      updates.is_mixed = updates.component_list.length > 1 ? 1 : 0;
    }
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        if (typeof updates[key] === 'object' && updates[key] !== null) {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    params.push(mcId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE mc_material SET ${setClauses.join(', ')} WHERE mc_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async createMr(formulaName, formulaType, componentList = [], tpIds = [], creator = null, batchNo = null) {
    const mrId = idGenerator.generateMrId();
    const now = idGenerator.getCurrentTimestamp();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO mr_formula (mr_id, formula_name, formula_type, batch_no, component_list, tp_ids, creator, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        mrId,
        formulaName,
        formulaType,
        batchNo,
        JSON.stringify(componentList),
        JSON.stringify(tpIds),
        creator,
        now,
        now
      ];

      this.db.run(sql, params, async (err) => {
        if (err) {
          reject(err);
        } else {
          try {
            for (const tpId of tpIds) {
              await this.addMrToTp(tpId, mrId);
            }
            resolve({
              mr_id: mrId,
              formula_name: formulaName,
              formula_type: formulaType,
              batch_no: batchNo,
              component_list: componentList,
              tp_ids: tpIds,
              creator: creator,
              create_time: now,
              update_time: now
            });
          } catch (updateErr) {
            reject(updateErr);
          }
        }
      });
    });
  }

  async getMr(mrId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mr_formula WHERE mr_id = ?';
      this.db.get(sql, [mrId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            ...row,
            component_list: JSON.parse(row.component_list),
            tp_ids: JSON.parse(row.tp_ids)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateMr(mrId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        if (typeof updates[key] === 'object' && updates[key] !== null) {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    params.push(mrId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE mr_formula SET ${setClauses.join(', ')} WHERE mr_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async addTpToMr(mrId, tpId) {
    const mr = await this.getMr(mrId);
    if (!mr) {
      throw new Error('MR not found');
    }
    
    const tpIds = [...mr.tp_ids];
    if (!tpIds.includes(tpId)) {
      tpIds.push(tpId);
      await this.updateMr(mrId, { tp_ids: tpIds });
      await this.addMrToTp(tpId, mrId);
    }
  }

  async removeTpFromMr(mrId, tpId) {
    const mr = await this.getMr(mrId);
    if (!mr) {
      throw new Error('MR not found');
    }
    
    const tpIds = mr.tp_ids.filter(id => id !== tpId);
    await this.updateMr(mrId, { tp_ids: tpIds });
    await this.removeMrFromTp(tpId, mrId);
  }

  async createFe(conditionName, conditionType, conditionParams = {}, mrIds = []) {
    const feId = idGenerator.generateFeId();
    const now = idGenerator.getCurrentTimestamp();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO fe_working_condition (fe_id, condition_name, condition_type, condition_params, mr_ids, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        feId,
        conditionName,
        conditionType,
        JSON.stringify(conditionParams),
        JSON.stringify(mrIds),
        now,
        now
      ];

      this.db.run(sql, params, async (err) => {
        if (err) {
          reject(err);
        } else {
          try {
            for (const mrId of mrIds) {
              await this.addFeToMr(mrId, feId);
            }
            resolve({
              fe_id: feId,
              condition_name: conditionName,
              condition_type: conditionType,
              condition_params: conditionParams,
              mr_ids: mrIds,
              create_time: now,
              update_time: now
            });
          } catch (updateErr) {
            reject(updateErr);
          }
        }
      });
    });
  }

  async getFe(feId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM fe_working_condition WHERE fe_id = ?';
      this.db.get(sql, [feId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            ...row,
            condition_params: JSON.parse(row.condition_params),
            mr_ids: JSON.parse(row.mr_ids)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateFe(feId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        if (typeof updates[key] === 'object' && updates[key] !== null) {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    params.push(feId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE fe_working_condition SET ${setClauses.join(', ')} WHERE fe_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async addMrToFe(feId, mrId) {
    const fe = await this.getFe(feId);
    if (!fe) {
      throw new Error('FE not found');
    }
    
    const mrIds = [...fe.mr_ids];
    if (!mrIds.includes(mrId)) {
      mrIds.push(mrId);
      await this.updateFe(feId, { mr_ids: mrIds });
    }
  }

  async removeMrFromFe(feId, mrId) {
    const fe = await this.getFe(feId);
    if (!fe) {
      throw new Error('FE not found');
    }
    
    const mrIds = fe.mr_ids.filter(id => id !== mrId);
    await this.updateFe(feId, { mr_ids: mrIds });
  }

  async createRu(serviceName, serviceType, serviceParams = {}, feIds = [], mrIds = []) {
    const ruId = idGenerator.generateRuId();
    const now = idGenerator.getCurrentTimestamp();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO ru_service_data (ru_id, service_name, service_type, service_params, fe_ids, mr_ids, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        ruId,
        serviceName,
        serviceType,
        JSON.stringify(serviceParams),
        JSON.stringify(feIds),
        JSON.stringify(mrIds),
        now,
        now
      ];

      this.db.run(sql, params, async (err) => {
        if (err) {
          reject(err);
        } else {
          try {
            for (const feId of feIds) {
              await this.addRuToFe(feId, ruId);
            }
            for (const mrId of mrIds) {
              await this.addRuToMr(mrId, ruId);
            }
            resolve({
              ru_id: ruId,
              service_name: serviceName,
              service_type: serviceType,
              service_params: serviceParams,
              fe_ids: feIds,
              mr_ids: mrIds,
              create_time: now,
              update_time: now
            });
          } catch (updateErr) {
            reject(updateErr);
          }
        }
      });
    });
  }

  async getRu(ruId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM ru_service_data WHERE ru_id = ?';
      this.db.get(sql, [ruId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            ...row,
            service_params: JSON.parse(row.service_params),
            fe_ids: JSON.parse(row.fe_ids),
            mr_ids: JSON.parse(row.mr_ids)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  async updateRu(ruId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        if (typeof updates[key] === 'object' && updates[key] !== null) {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    params.push(ruId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE ru_service_data SET ${setClauses.join(', ')} WHERE ru_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async addFeToMr(mrId, feId) {
    const mr = await this.getMr(mrId);
    if (!mr) {
      throw new Error('MR not found');
    }
    
    if (!mr.fe_ids) {
      mr.fe_ids = [];
    }
    const feIds = [...mr.fe_ids];
    if (!feIds.includes(feId)) {
      feIds.push(feId);
      await this.updateMr(mrId, { fe_ids: feIds });
    }
  }

  async addRuToFe(feId, ruId) {
    const fe = await this.getFe(feId);
    if (!fe) {
      throw new Error('FE not found');
    }
    
    if (!fe.ru_ids) {
      fe.ru_ids = [];
    }
    const ruIds = [...fe.ru_ids];
    if (!ruIds.includes(ruId)) {
      ruIds.push(ruId);
      await this.updateFe(feId, { ru_ids: ruIds });
    }
  }

  async addRuToMr(mrId, ruId) {
    const mr = await this.getMr(mrId);
    if (!mr) {
      throw new Error('MR not found');
    }
    
    if (!mr.ru_ids) {
      mr.ru_ids = [];
    }
    const ruIds = [...mr.ru_ids];
    if (!ruIds.includes(ruId)) {
      ruIds.push(ruId);
      await this.updateMr(mrId, { ru_ids: ruIds });
    }
  }

  async deleteMp(mpId) {
    return new Promise(async (resolve, reject) => {
      try {
        // 1. 检查是否有MC记录引用该MP
        const mcRecords = await new Promise((resolve, reject) => {
          const sql = 'SELECT * FROM mc_material';
          this.db.all(sql, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
        
        const referencingMcIds = [];
        for (const mc of mcRecords) {
          try {
            const componentList = JSON.parse(mc.component_list);
            if (Array.isArray(componentList)) {
              for (const component of componentList) {
                if (Array.isArray(component) && component[1] === mpId) {
                  referencingMcIds.push(mc.mc_id);
                  break;
                }
              }
            }
          } catch (e) {
            console.error('Error parsing component_list:', e);
          }
        }
        
        // 2. 软删除MP记录
        await new Promise((resolve, reject) => {
          const sql = 'UPDATE mp_properties SET is_delete = 1, update_time = ? WHERE mp_id = ?';
          this.db.run(sql, [new Date().toISOString(), mpId], function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({ changes: this.changes });
            }
          });
        });
        
        // 3. 更新MC记录，移除对该MP的引用
        for (const mcId of referencingMcIds) {
          const mc = mcRecords.find(m => m.mc_id === mcId);
          if (mc) {
            try {
              const componentList = JSON.parse(mc.component_list);
              if (Array.isArray(componentList)) {
                // 移除对该MP的引用
                const updatedComponentList = componentList.map(component => {
                  if (Array.isArray(component) && component[1] === mpId) {
                    // 将MPID设置为null，以便前端显示红框标记
                    return [component[0], null, component[2], component[3]];
                  }
                  return component;
                });
                
                await new Promise((resolve, reject) => {
                  const sql = 'UPDATE mc_material SET component_list = ?, update_time = ? WHERE mc_id = ?';
                  this.db.run(sql, [JSON.stringify(updatedComponentList), new Date().toISOString(), mcId], function(err) {
                    if (err) {
                      reject(err);
                    } else {
                      resolve({ changes: this.changes });
                    }
                  });
                });
              }
            } catch (e) {
              console.error('Error updating MC component_list:', e);
            }
          }
        }
        
        resolve({ 
          changes: 1, 
          referencingMcIds, 
          message: referencingMcIds.length > 0 ? `该物性被 ${referencingMcIds.length} 个原料引用，已从原料中移除引用` : '物性删除成功' 
        });
      } catch (error) {
        console.error('Error deleting MP:', error);
        reject(error);
      }
    });
  }

  async deleteTp(tpId) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE tp_test_properties SET is_delete = 1, update_time = ? WHERE tp_id = ?';
      this.db.run(sql, [new Date().toISOString(), tpId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async deleteMc(mcId) {
    return new Promise(async (resolve, reject) => {
      try {
        // 1. 检查是否有MR记录引用该MC
        const mrRecords = await new Promise((resolve, reject) => {
          const sql = 'SELECT * FROM mr_formula';
          this.db.all(sql, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
        
        const referencingMrIds = [];
        for (const mr of mrRecords) {
          try {
            const componentList = JSON.parse(mr.component_list);
            if (Array.isArray(componentList)) {
              for (const component of componentList) {
                if (Array.isArray(component) && component[1] === mcId) {
                  referencingMrIds.push(mr.mr_id);
                  break;
                }
              }
            }
          } catch (e) {
            console.error('Error parsing component_list:', e);
          }
        }
        
        // 2. 检查是否有MP记录关联该MC
        let mpId = null;
        const mpRecords = await new Promise((resolve, reject) => {
          const sql = 'SELECT * FROM mp_properties';
          this.db.all(sql, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
        
        for (const mp of mpRecords) {
          try {
            const mcIds = JSON.parse(mp.mc_ids);
            if (Array.isArray(mcIds) && mcIds.includes(mcId)) {
              mpId = mp.mp_id;
              break;
            }
          } catch (e) {
            console.error('Error parsing mc_ids:', e);
          }
        }
        
        // 3. 删除MC记录
        await new Promise((resolve, reject) => {
          const sql = 'DELETE FROM mc_material WHERE mc_id = ?';
          this.db.run(sql, [mcId], function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({ changes: this.changes });
            }
          });
        });
        
        // 4. 删除对应的MP记录
        if (mpId) {
          await new Promise((resolve, reject) => {
            const sql = 'DELETE FROM mp_properties WHERE mp_id = ?';
            this.db.run(sql, [mpId], function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({ changes: this.changes });
              }
            });
          });
        }
        
        // 5. 更新MR记录，移除对该MC的引用
        for (const mrId of referencingMrIds) {
          const mr = mrRecords.find(m => m.mr_id === mrId);
          if (mr) {
            try {
              const componentList = JSON.parse(mr.component_list);
              if (Array.isArray(componentList)) {
                // 移除对该MC的引用
                const updatedComponentList = componentList.map(component => {
                  if (Array.isArray(component) && component[1] === mcId) {
                    // 将MCID设置为null，以便前端显示红框标记
                    return [component[0], null, component[2], component[3]];
                  }
                  return component;
                });
                
                await new Promise((resolve, reject) => {
                  const sql = 'UPDATE mr_formula SET component_list = ?, update_time = ? WHERE mr_id = ?';
                  this.db.run(sql, [JSON.stringify(updatedComponentList), new Date().toISOString(), mrId], function(err) {
                    if (err) {
                      reject(err);
                    } else {
                      resolve({ changes: this.changes });
                    }
                  });
                });
              }
            } catch (e) {
              console.error('Error updating MR component_list:', e);
            }
          }
        }
        
        resolve({ 
          changes: 1, 
          referencingMrIds, 
          mpId, 
          message: referencingMrIds.length > 0 ? `该原料被 ${referencingMrIds.length} 个配方引用，已从配方中移除引用` : '原料删除成功' 
        });
      } catch (error) {
        console.error('Error deleting MC:', error);
        reject(error);
      }
    });
  }

  async deleteMr(mrId) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM mr_formula WHERE mr_id = ?';
      this.db.run(sql, [mrId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async deleteFe(feId) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM fe_working_condition WHERE fe_id = ?';
      this.db.run(sql, [feId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async deleteRu(ruId) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM ru_service_data WHERE ru_id = ?';
      this.db.run(sql, [ruId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async createLit(title, authors, journal, year, volume, number, pages, doi, abstract, note, entryType) {
    const litId = idGenerator.generateLitId();
    const now = idGenerator.getCurrentTimestamp();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO literature (lit_id, title, authors, journal, year, volume, number, pages, doi, abstract, note, entry_type, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [
        litId, title, authors, journal, year, volume, number, pages, doi, abstract, note, entryType, now, now
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            lit_id: litId,
            title, authors, journal, year, volume, number, pages, doi, abstract, note, entry_type: entryType,
            create_time: now, update_time: now
          });
        }
      });
    });
  }

  async getLit(litId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM literature WHERE lit_id = ?';
      this.db.get(sql, [litId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getAllLits() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM literature';
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateLit(litId, data) {
    const now = idGenerator.getCurrentTimestamp();
    const updates = { update_time: now, ...data };
    
    const setClauses = [];
    const params = [];
    
    for (const key in updates) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(updates[key]);
      }
    }
    
    params.push(litId);

    return new Promise((resolve, reject) => {
      const sql = `UPDATE literature SET ${setClauses.join(', ')} WHERE lit_id = ?`;
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async deleteLit(litId) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM literature WHERE lit_id = ?';
      this.db.run(sql, [litId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('NewDbService database closed');
    }
  }
}

module.exports = new NewDbService();
