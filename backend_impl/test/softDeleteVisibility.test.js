const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();

const newDbService = require('../src/services/newDbService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function close(db) {
  return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
}

test('MP and TP queries hide records marked as deleted', async () => {
  const db = new sqlite3.Database(':memory:');
  const previousDb = newDbService.db;
  newDbService.db = db;

  try {
    await run(db, `CREATE TABLE mp_properties (
      mp_id TEXT PRIMARY KEY, fixed_properties TEXT, custom_properties TEXT,
      mc_ids TEXT, create_time TEXT, update_time TEXT, is_delete INTEGER DEFAULT 0
    )`);
    await run(db, `CREATE TABLE tp_test_properties (
      tp_id TEXT PRIMARY KEY, mp_id TEXT, test_params TEXT, test_results TEXT,
      mr_ids TEXT, test_condition TEXT, create_time TEXT, update_time TEXT,
      is_delete INTEGER DEFAULT 0
    )`);
    const emptyDocument = JSON.stringify({ schemaVersion: 2, properties: {} });
    await run(db, `INSERT INTO mp_properties VALUES ('MP_ACTIVE', ?, '[]', '[]', '', '', 0)`, [emptyDocument]);
    await run(db, `INSERT INTO mp_properties VALUES ('MP_DELETED', ?, '[]', '[]', '', '', 1)`, [emptyDocument]);
    await run(db, `INSERT INTO tp_test_properties VALUES ('TP_ACTIVE', NULL, '{}', ?, '[]', '无', '', '', 0)`, [emptyDocument]);
    await run(db, `INSERT INTO tp_test_properties VALUES ('TP_DELETED', NULL, '{}', ?, '[]', '无', '', '', 1)`, [emptyDocument]);

    assert.deepEqual((await newDbService.getAllMps()).map(row => row.mp_id), ['MP_ACTIVE']);
    assert.equal(await newDbService.getMp('MP_DELETED'), null);
    assert.deepEqual((await newDbService.getAllTps()).map(row => row.tp_id), ['TP_ACTIVE']);
    assert.equal(await newDbService.getTp('TP_DELETED'), null);
  } finally {
    newDbService.db = previousDb;
    await close(db);
  }
});

test('deleting TP hides it and removes its id from related MR records', async () => {
  const db = new sqlite3.Database(':memory:');
  const previousDb = newDbService.db;
  newDbService.db = db;

  try {
    await run(db, `CREATE TABLE tp_test_properties (
      tp_id TEXT PRIMARY KEY, mp_id TEXT, test_params TEXT, test_results TEXT,
      mr_ids TEXT, test_condition TEXT, create_time TEXT, update_time TEXT,
      is_delete INTEGER DEFAULT 0
    )`);
    await run(db, `CREATE TABLE mr_formula (
      mr_id TEXT PRIMARY KEY, formula_name TEXT, formula_type TEXT, batch_no TEXT,
      component_list TEXT, tp_ids TEXT, fe_ids TEXT DEFAULT '[]', ru_ids TEXT DEFAULT '[]',
      creator TEXT, create_time TEXT, update_time TEXT, is_delete INTEGER DEFAULT 0
    )`);
    await run(db, `INSERT INTO mr_formula (mr_id, component_list, tp_ids) VALUES ('MR_000001', '[]', '["TP_000001"]')`);
    await run(db, `INSERT INTO tp_test_properties VALUES ('TP_000001', NULL, '{}', ?, '["MR_000001"]', '无', '', '', 0)`, [JSON.stringify({ schemaVersion: 2, properties: {} })]);

    await newDbService.deleteTp('TP_000001');

    assert.deepEqual(await newDbService.getAllTps(), []);
    const mr = await get(db, `SELECT tp_ids FROM mr_formula WHERE mr_id = 'MR_000001'`);
    assert.deepEqual(JSON.parse(mr.tp_ids), []);
  } finally {
    newDbService.db = previousDb;
    await close(db);
  }
});
