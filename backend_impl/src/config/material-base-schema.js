/**
 * 原料 base 注册表 schema：material_base（规范名 + 模型 material_id + 别名）、
 * material_base_rule（名称 → base 的解析规则）、material_vocab（各变体的 one-hot 词表）。
 *
 * 三张表都以「可直接传 db 句柄」的方式建表，便于测试注入临时库。
 */
const database = require('./database');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS material_base (
     base_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
     base_name TEXT NOT NULL UNIQUE,
     material_id TEXT,
     category TEXT,
     aliases TEXT NOT NULL DEFAULT '[]',
     enabled INTEGER NOT NULL DEFAULT 1,
     source TEXT DEFAULT 'manual',
     ref_count INTEGER NOT NULL DEFAULT 0,
     create_time TIMESTAMP NOT NULL,
     update_time TIMESTAMP NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS material_base_rule (
     rule_id TEXT(9) PRIMARY KEY NOT NULL UNIQUE,
     kind TEXT NOT NULL CHECK(kind IN ('exact','alias','normalize','regex','keyword')),
     pattern TEXT NOT NULL,
     target_base_id TEXT NOT NULL,
     priority INTEGER NOT NULL DEFAULT 100,
     enabled INTEGER NOT NULL DEFAULT 1,
     note TEXT,
     create_time TIMESTAMP NOT NULL,
     update_time TIMESTAMP NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS material_vocab (
     variant TEXT NOT NULL,
     material_id TEXT NOT NULL,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (variant, material_id)
   )`,
  'CREATE INDEX IF NOT EXISTS idx_material_base_name ON material_base(base_name)',
  'CREATE INDEX IF NOT EXISTS idx_material_base_material_id ON material_base(material_id)',
  'CREATE INDEX IF NOT EXISTS idx_material_base_rule_priority ON material_base_rule(enabled, priority)',
];

function exec(handle, sql) {
  return new Promise((resolve, reject) => {
    handle.run(sql, (error) => (error ? reject(error) : resolve()));
  });
}

/** 建表（幂等）。db 省略时用全局连接；返回实际使用的句柄。 */
async function ensureMaterialBaseSchema(db) {
  const handle = db || database.db;
  if (!handle) throw new Error('material-base: no sqlite handle (database not connected)');
  for (const sql of STATEMENTS) await exec(handle, sql);
  return handle;
}

module.exports = { ensureMaterialBaseSchema, STATEMENTS };
