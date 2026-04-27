/**
 * 数据库初始化模块
 * 使用 sql.js 进行 SQLite 数据库连接和表初始化
 * sql.js 是纯 JavaScript 实现，使用 WebAssembly，不依赖原生编译
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;

/**
 * 初始化数据库
 * @returns {Promise<Database>} sql.js 数据库实例
 */
async function initializeDatabase() {
  // 确保数据库目录存在
  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 初始化 sql.js
  const SQL = await initSqlJs();

  // 尝试加载已有数据库
  const dbPath = config.database.path;
  let dbData = null;

  if (fs.existsSync(dbPath)) {
    try {
      dbData = fs.readFileSync(dbPath);
    } catch (err) {
      console.warn('无法读取已有数据库文件，将创建新数据库');
    }
  }

  // 创建数据库连接
  if (dbData) {
    db = new SQL.Database(dbData);
  } else {
    db = new SQL.Database();
  }

  // 启用外键约束
  db.run('PRAGMA foreign_keys = ON');

  // 读取并执行 schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // 执行 schema 创建表
  db.run(schema);

  // 保存数据库到文件
  saveDatabase();

  console.log('数据库表初始化完成');

  return db;
}

/**
 * 保存数据库到文件
 */
function saveDatabase() {
  if (!db) return;

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.database.path, buffer);
}

/**
 * 执行 SQL 查询（同步封装）
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数数组
 * @returns {Object} 查询结果
 */
function query(sql, params = []) {
  if (!db) {
    throw new Error('数据库未初始化');
  }

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * 执行 SQL 语句（同步封装）
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数数组
 * @returns {Object} 运行结果
 */
function run(sql, params = []) {
  if (!db) {
    throw new Error('数据库未初始化');
  }

  db.run(sql, params);
  saveDatabase();

  return {
    changes: db.getRowsModified(),
    lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0,
  };
}

/**
 * 获取数据库实例（需先调用 initializeDatabase）
 * @returns {Database|null}
 */
function getDb() {
  return db;
}

module.exports = {
  initializeDatabase,
  query,
  run,
  getDb,
  saveDatabase,
};
