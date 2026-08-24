const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sqlite3 = require('sqlite3').verbose();
const SQLiteInitializer = require('../src/config/init-sqlite');

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (error) => error ? reject(error) : resolve());
  });
}

function all(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function close(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => error ? reject(error) : resolve());
  });
}

test('adds attachment to an existing literature table without rebuilding it', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-lit-schema-'));
  const dbPath = path.join(tempDir, 'database.db');
  const db = new sqlite3.Database(dbPath);
  const initializer = new SQLiteInitializer(dbPath);
  initializer.db = db;

  try {
    await run(db, `
      CREATE TABLE literature (
        lit_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        create_time TIMESTAMP NOT NULL,
        update_time TIMESTAMP NOT NULL
      )
    `);
    await run(db, `INSERT INTO literature (lit_id, title, create_time, update_time)
      VALUES ('LIT_KEEP', 'Keep me', '2026-01-01', '2026-01-01')`);

    await initializer.ensureLiteratureAttachmentColumn();

    const columns = await all(db, 'PRAGMA table_info(literature)');
    const preserved = await all(db, `SELECT lit_id, title FROM literature WHERE lit_id = 'LIT_KEEP'`);
    assert.equal(columns.some((column) => column.name === 'attachment' && column.type === 'TEXT'), true);
    assert.deepEqual(preserved, [{ lit_id: 'LIT_KEEP', title: 'Keep me' }]);
  } finally {
    await close(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
