/**
 * 数据修复脚本
 * 修复 trip_history 表中 preferences 字段的 JSON 格式问题
 *
 * 运行方式: node src/db/fixData.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// 数据库路径
const dbPath = path.join(__dirname, '../../data/wayfinder.db');

async function fixData() {
  console.log('开始修复数据...');
  console.log('数据库路径:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('数据库文件不存在:', dbPath);
    process.exit(1);
  }

  // 初始化 sql.js
  const SQL = await initSqlJs();
  const dbData = fs.readFileSync(dbPath);
  const db = new SQL.Database(dbData);

  // 查询所有历史记录
  const records = [];
  const stmt = db.prepare('SELECT id, preferences, result FROM trip_history');
  while (stmt.step()) {
    records.push(stmt.getAsObject());
  }
  stmt.free();

  console.log('找到', records.length, '条历史记录');

  let fixedCount = 0;
  let errorCount = 0;

  for (const record of records) {
    try {
      // 尝试解析 preferences
      let needsFix = false;
      try {
        JSON.parse(record.preferences);
      } catch (e) {
        // preferences 不是有效的 JSON，需要修复
        needsFix = true;
      }

      if (needsFix) {
        console.log('\n修复记录 ID:', record.id);
        console.log('  原始 preferences:', record.preferences);

        // 将 preferences 用 JSON.stringify 包装
        const fixedPreferences = JSON.stringify(record.preferences);

        console.log('  修复后 preferences:', fixedPreferences);

        // 更新数据库
        db.run(
          'UPDATE trip_history SET preferences = ? WHERE id = ?',
          [fixedPreferences, record.id]
        );
        fixedCount++;
      }
    } catch (e) {
      console.error('处理记录', record.id, '时出错:', e.message);
      errorCount++;
    }
  }

  // 保存修复后的数据库
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  console.log('\n========== 修复完成 ==========');
  console.log('总记录数:', records.length);
  console.log('修复记录:', fixedCount);
  console.log('错误记录:', errorCount);
  console.log('==============================');

  db.close();
}

fixData().catch(err => {
  console.error('修复脚本执行失败:', err);
  process.exit(1);
});