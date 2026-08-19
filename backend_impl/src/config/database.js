const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
const SQLiteInitializer = require('./init-sqlite');
const path = require('path');

class Database {
  constructor() {
    this.dbType = process.env.DB_TYPE || 'sqlite';
    this.db = null;
    this._fullDb = null; // MongoDB 模式下代理到 models/db.js 的完整 CRUD 模块
  }

  async connect() {
    if (this.dbType === 'sqlite') {
      return this.connectSQLite();
    } else if (this.dbType === 'mongodb') {
      return this.connectMongoDB();
    }
    throw new Error('Unsupported database type');
  }

  async connectSQLite() {
    const dbPath = path.join(__dirname, '../../data/sqlite/database.db');
    const initializer = new SQLiteInitializer(dbPath);
    await initializer.init();
    this.db = initializer.db;
    return Promise.resolve();
  }

  async connectMongoDB() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/asc-platform';
    try {
      await mongoose.connect(uri);
      console.log('Connected to MongoDB');
      this.db = mongoose.connection;
      // 代理到完整 CRUD 模块（models/db.js）
      const fullDb = require('../models/db');
      await fullDb.connect();
      this._fullDb = fullDb;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async query(sql, params = []) {
    if (this.dbType === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    } else if (this.dbType === 'mongodb' && this._fullDb) {
      // MongoDB 模式：通过 _fullDb.read() 代理
      const match = sql.match(/FROM\s+(\w+)/i);
      if (!match) return [];
      const collection = match[1];
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/is);
      let query = {};
      if (whereMatch && params.length > 0) {
        const conditions = whereMatch[1].split(/\s+AND\s+/i);
        conditions.forEach((cond, i) => {
          const kvMatch = cond.match(/(\w+)\s*=\s*\?/);
          if (kvMatch && params[i] !== undefined) {
            query[kvMatch[1]] = params[i];
          }
        });
      }
      delete query.is_delete; // readMongoDB 已内置
      return this._fullDb.read(collection, query);
    }
    return [];
  }

  async execute(sql, params = []) {
    if (this.dbType === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    } else if (this.dbType === 'mongodb' && this._fullDb) {
      // INSERT
      const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\([^)]+\)/i);
      if (insertMatch) {
        const collection = insertMatch[1];
        const keys = insertMatch[2].split(',').map(k => k.trim());
        const data = {};
        keys.forEach((key, i) => { data[key] = params[i]; });
        const result = await this._fullDb.create(collection, data);
        return { lastID: result.id || result._id, changes: 1 };
      }
      // UPDATE
      const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/is);
      if (updateMatch) {
        const collection = updateMatch[1];
        const setData = {};
        const setParts = updateMatch[2].split(',');
        let paramIdx = 0;
        setParts.forEach(part => {
          const kv = part.match(/(\w+)\s*=\s*\?/);
          if (kv && params[paramIdx] !== undefined) { setData[kv[1]] = params[paramIdx++]; }
        });
        const whereQuery = {};
        const whereParts = updateMatch[3].split(/\s+AND\s+/i);
        whereParts.forEach(part => {
          const kv = part.match(/(\w+)\s*=\s*\?/);
          if (kv && params[paramIdx] !== undefined) { whereQuery[kv[1]] = params[paramIdx++]; }
        });
        delete whereQuery.is_delete;
        const result = await this._fullDb.update(collection, whereQuery, setData);
        return { lastID: null, changes: result.modifiedCount || result.changes || 0 };
      }
      return { lastID: null, changes: 0 };
    }
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