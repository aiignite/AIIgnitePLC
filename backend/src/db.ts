/**
 * PostgreSQL 数据库连接池配置
 */

import 'dotenv/config';
import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';

// 数据库连接配置
const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'aiignite_plc',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // 连接池最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// 创建连接池
const pool = new Pool(poolConfig);

// 连接池事件监听
pool.on('connect', () => {
  console.log('✅ PostgreSQL: 新连接已建立');
});

pool.on('error', err => {
  console.error('❌ PostgreSQL: 连接池错误', err);
});

/**
 * 执行查询
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log('📊 SQL 查询', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('❌ SQL 查询失败', { text, error });
    throw error;
  }
}

/**
 * 执行事务
 */
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取连接池统计信息
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * 关闭连接池
 */
export async function closePool() {
  await pool.end();
  console.log('🔌 PostgreSQL: 连接池已关闭');
}

export default pool;
