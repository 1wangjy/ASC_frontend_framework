const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const newDbService = require('../src/services/newDbService');
const propertiesDef = require('../src/config/properties-def');
const propertyValueService = require('../src/services/propertyValueService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function close(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => error ? reject(error) : resolve());
  });
}

test('normalizes legacy 31-item MP data to the variable property document', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-four-table-mp-'));
  const db = new sqlite3.Database(path.join(tempDir, 'database.db'));
  const previousDb = newDbService.db;
  newDbService.db = db;

  try {
    await run(db, `CREATE TABLE mp_properties (
      mp_id TEXT PRIMARY KEY,
      fixed_properties TEXT NOT NULL,
      custom_properties TEXT NOT NULL,
      mc_ids TEXT NOT NULL,
      create_time TEXT,
      update_time TEXT,
      is_delete INTEGER DEFAULT 0
    )`);
    await run(db, `INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES (?, ?, '[]', '[]', '', '')`, [
      'MP_LEGACY',
      JSON.stringify(Array(31).fill(7)),
    ]);

    const rows = await newDbService.getAllMps();
    assert.equal(rows[0].fixed_properties.schemaVersion, 3);
    assert.equal(Object.keys(rows[0].fixed_properties.properties).length, 31);
    assert.equal(rows[0].fixed_properties.properties.coldCrushingStrength, undefined);
  } finally {
    newDbService.db = previousDb;
    await close(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('saves a new MP measurement when legacy text properties are still numeric', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-four-table-mp-edit-'));
  const db = new sqlite3.Database(path.join(tempDir, 'database.db'));
  const previousDb = newDbService.db;
  newDbService.db = db;

  try {
    await run(db, `CREATE TABLE mp_properties (
      mp_id TEXT PRIMARY KEY,
      fixed_properties TEXT NOT NULL,
      custom_properties TEXT NOT NULL,
      mc_ids TEXT NOT NULL,
      create_time TEXT,
      update_time TEXT,
      is_delete INTEGER DEFAULT 0
    )`);
    const legacyValues = Array(31).fill(-1);
    legacyValues[0] = 2.7;
    legacyValues[26] = 0.001;
    await run(db, `INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES (?, ?, '[]', '[]', '', '')`, [
      'MP_LEGACY_EDIT',
      JSON.stringify(legacyValues),
    ]);

    const mp = await newDbService.getMp('MP_LEGACY_EDIT');
    mp.fixed_properties.properties.particleSize.push({
      fields: { value: { value: 3.2, unit: 'μm' } },
      raw: '3.2μm'
    });
    await newDbService.updateMp(mp.mp_id, { fixed_properties: mp.fixed_properties });

    const saved = JSON.parse((await get(db, 'SELECT fixed_properties FROM mp_properties WHERE mp_id = ?', [mp.mp_id])).fixed_properties);
    assert.deepEqual(saved.properties.particleSize.map(item => item.fields.value), [
      { value: 2.7, unit: 'μm' },
      { value: 3.2, unit: 'μm' }
    ]);
    assert.deepEqual(saved.properties.color[0].fields.value, { value: '0.001', unit: '' });
  } finally {
    newDbService.db = previousDb;
    await close(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('creates TP with an MR relation and keeps both sides synchronized', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-four-table-tp-'));
  const db = new sqlite3.Database(path.join(tempDir, 'database.db'));
  const previousDb = newDbService.db;
  newDbService.db = db;

  try {
    await run(db, `CREATE TABLE tp_test_properties (
      tp_id TEXT PRIMARY KEY,
      mp_id TEXT,
      test_params TEXT NOT NULL,
      test_results TEXT NOT NULL,
      mr_ids TEXT NOT NULL,
      test_condition TEXT,
      create_time TEXT,
      update_time TEXT,
      is_delete INTEGER DEFAULT 0
    )`);
    await run(db, `CREATE TABLE mr_formula (
      mr_id TEXT PRIMARY KEY,
      formula_name TEXT,
      formula_type TEXT,
      batch_no TEXT,
      component_list TEXT NOT NULL,
      tp_ids TEXT NOT NULL,
      creator TEXT,
      create_time TEXT,
      update_time TEXT
    )`);
    await run(db, `INSERT INTO mr_formula VALUES ('MR_000001', '测试配方', '其他', '', '[]', '[]', NULL, '', '')`);
    await run(db, `INSERT INTO mr_formula VALUES ('MR_000002', '第二配方', '其他', '', '[]', '[]', NULL, '', '')`);

    const created = await newDbService.createTp(
      null,
      {},
      { fixed: Array(31).fill(2), custom: [] },
      '1100C24H',
      ['MR_000001'],
    );

    assert.deepEqual(created.mr_ids, ['MR_000001']);
    assert.equal(created.test_results.schemaVersion, 3);
    assert.equal(created.test_results.fixed, undefined);
    assert.ok(Object.keys(created.test_results.properties).length > 0);

    const tpRow = await get(db, 'SELECT mr_ids, test_params, test_results FROM tp_test_properties WHERE tp_id = ?', [created.tp_id]);
    const mrRow = await get(db, `SELECT tp_ids FROM mr_formula WHERE mr_id = 'MR_000001'`);
    assert.deepEqual(JSON.parse(tpRow.mr_ids), ['MR_000001']);
    assert.deepEqual(JSON.parse(tpRow.test_params), {});
    assert.deepEqual(JSON.parse(mrRow.tp_ids), [created.tp_id]);

    await newDbService.updateTp(created.tp_id, { mr_ids: ['MR_000002'] });
    const oldMr = await get(db, `SELECT tp_ids FROM mr_formula WHERE mr_id = 'MR_000001'`);
    const newMr = await get(db, `SELECT tp_ids FROM mr_formula WHERE mr_id = 'MR_000002'`);
    assert.deepEqual(JSON.parse(oldMr.tp_ids), []);
    assert.deepEqual(JSON.parse(newMr.tp_ids), [created.tp_id]);
  } finally {
    newDbService.db = previousDb;
    await close(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('maps parsed material and test properties into the configured 32 fixed slots', () => {
  assert.equal(typeof propertiesDef.toFixedAndCustomProperties, 'function');

  const definitions = [
    { id: 0, name: 'particleSize', label: '粒径' },
    { id: 31, name: 'bulkDensity', label: '体积密度' },
  ];
  const result = propertiesDef.toFixedAndCustomProperties({
    粒径: { value: 3.2, unit: 'mm' },
    bulkDensity: 2.8,
    自定义指标: { value: 9.5, unit: '%' },
  }, definitions);

  assert.equal(result.fixed.length, 32);
  assert.equal(result.fixed[0], 3.2);
  assert.equal(result.fixed[31], 2.8);
  assert.deepEqual(result.custom, [{ name: '自定义指标', value: 9.5, unit: '%' }]);
});

test('normalizes measurement unit aliases again before SQLite storage', () => {
  const definition = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'flexuralStrength');
  const stored = propertyValueService.prepareForStorage({
    schemaVersion: 3,
    properties: {
      flexuralStrength: [{
        fields: {
          value: { value: 60, unit: 'mpa' },
          temperature: { value: 120, unit: '°C' },
          duration: { value: 25, unit: 'hours' }
        },
        raw: '25hours;120°C;60mpa'
      }]
    }
  }, [definition]);

  assert.deepEqual(stored.properties.flexuralStrength[0].fields, {
    value: { value: 60, unit: 'MPa' },
    temperature: { value: 120, unit: '℃' },
    duration: { value: 25, unit: 'h' }
  });
});

test('stores dimensionless measurements without a display unit', () => {
  const definition = propertiesDef.PURE_MATERIAL_PROPERTIES.find(item => item.name === 'poissonRatio');
  const stored = propertyValueService.prepareForStorage({
    schemaVersion: 3,
    properties: {
      poissonRatio: [{
        fields: {
          value: { value: 0.3, unit: '' },
          temperature: { value: 'RT', unit: '' }
        },
        raw: '0.3;RT'
      }]
    }
  }, [definition]);

  assert.deepEqual(stored.properties.poissonRatio[0].fields.value, { value: 0.3, unit: '' });
});

test('keeps MP-MC references synchronized and rejects invalid MR component contracts', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-four-table-relations-'));
  const db = new sqlite3.Database(path.join(tempDir, 'database.db'));
  const previousDb = newDbService.db;
  newDbService.db = db;

  try {
    await run(db, `CREATE TABLE mp_properties (
      mp_id TEXT PRIMARY KEY, fixed_properties TEXT NOT NULL, custom_properties TEXT NOT NULL,
      mc_ids TEXT NOT NULL, create_time TEXT, update_time TEXT, is_delete INTEGER DEFAULT 0
    )`);
    await run(db, `CREATE TABLE mc_material (
      mc_id TEXT PRIMARY KEY, batch_no TEXT, type TEXT, component_list TEXT NOT NULL,
      is_mixed INTEGER, create_time TEXT, update_time TEXT
    )`);
    await run(db, `CREATE TABLE mr_formula (
      mr_id TEXT PRIMARY KEY, formula_name TEXT, formula_type TEXT, batch_no TEXT,
      component_list TEXT NOT NULL, tp_ids TEXT NOT NULL, creator TEXT, create_time TEXT, update_time TEXT
    )`);

    await run(db, `INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES ('MP_000001', '[]', '[]', '[]', '', '')`);
    await run(db, `INSERT INTO mp_properties (mp_id, fixed_properties, custom_properties, mc_ids, create_time, update_time) VALUES ('MP_000002', '[]', '[]', '[]', '', '')`);

    const mc = await newDbService.createMc('No.1', '支撑骨料', [['氧化铝', 'MP_000001', '{}', 100]]);
    await newDbService.updateMc(mc.mc_id, { component_list: [['氧化铝', 'MP_000002', '{}', 100]] });

    const firstMp = await newDbService.getMp('MP_000001');
    const secondMp = await newDbService.getMp('MP_000002');
    assert.deepEqual(firstMp.mc_ids, []);
    assert.deepEqual(secondMp.mc_ids, [mc.mc_id]);

    const mr = await newDbService.createMr('正确配方', '其他', [['氧化铝', mc.mc_id, '{}', 100]], []);
    assert.equal(mr.component_list[0][1], mc.mc_id);

    await assert.rejects(
      () => newDbService.createMr('错误引用', '其他', [['氧化铝', 'MP_000001', '{}', 100]], []),
      /MC_ID/,
    );
    await assert.rejects(
      () => newDbService.createMr('错误比例', '其他', [['氧化铝', mc.mc_id, '{}', 90]], []),
      /100%/,
    );
  } finally {
    newDbService.db = previousDb;
    await close(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
