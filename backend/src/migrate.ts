/**
 * 独立数据库迁移脚本
 * 不使用共享的 db.ts 连接池
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// 读取环境变量
require('dotenv/config');

async function runMigration() {
  // 创建独立的连接池
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'aiignite_plc',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('测试数据库连接...');
    const client = await pool.connect();
    console.log('✅ 数据库连接成功');
    client.release();

    console.log('开始执行数据库迁移...');

    // 读取迁移文件
    const migrationPath = path.join(__dirname, '../migrations/002_add_authentication.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // 分割SQL语句
    const statements = migrationSQL
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`找到 ${statements.length} 条SQL语句`);

    // 逐条执行
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`执行语句 ${i + 1}/${statements.length}...`);
        try {
          await pool.query(statement);
          console.log(`✓ 语句 ${i + 1} 执行成功`);
        } catch (err: any) {
          if (err.code === '42P07' || err.message?.includes('already exists')) {
            console.log(`⊘ 语句 ${i + 1} 跳过（对象已存在）`);
          } else {
            console.error(`✗ 语句 ${i + 1} 执行失败:`, err.message);
            throw err;
          }
        }
      }
    }

    console.log('✅ 数据库迁移完成！');

    // 验证表是否创建成功
    const tablesCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'user_sessions')
    `);

    console.log(
      '已创建/存在的表:',
      tablesCheck.rows.map(r => r.table_name)
    );
  } catch (error: any) {
    console.error('迁移失败:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('迁移脚本执行完毕');
    process.exit(0);
  })
  .catch(err => {
    console.error('未捕获的错误:', err);
    process.exit(1);
  });
