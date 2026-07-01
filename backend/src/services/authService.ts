/**
 * 认证服务 - JWT 令牌管理和用户认证
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../db';

// Token 载荷接口
export interface TokenPayload {
  userId: string;
  username: string;
  type: 'access' | 'refresh';
}

// 用户信息接口
export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  created_at: Date;
  last_login: Date | null;
}

// 认证结果接口
export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * 生成访问令牌（15分钟有效期）
 */
export function generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, config.jwt.secret, { expiresIn: '15m' });
}

/**
 * 生成刷新令牌（7天有效期）
 */
export function generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, config.jwt.secret, { expiresIn: '7d' });
}

/**
 * 验证并解析令牌
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * 用户注册
 */
export async function registerUser(
  username: string,
  email: string,
  password: string,
  fullName?: string
): Promise<User> {
  // 检查用户名是否已存在
  const existingUser = await query('SELECT id FROM users WHERE username = $1 OR email = $2', [
    username,
    email,
  ]);

  if (existingUser.rows.length > 0) {
    throw new Error('USERNAME_OR_EMAIL_EXISTS');
  }

  // 加密密码
  const passwordHash = await bcrypt.hash(password, 10);

  // 创建用户
  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, full_name, created_at, last_login`,
    [username, email, passwordHash, fullName || null]
  );

  return result.rows[0];
}

/**
 * 用户登录
 */
export async function loginUser(
  usernameOrEmail: string,
  password: string,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResult> {
  // 查找用户
  const result = await query('SELECT * FROM users WHERE username = $1 OR email = $1', [
    usernameOrEmail,
  ]);

  if (result.rows.length === 0) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const user = result.rows[0];

  // 验证密码
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // 更新最后登录时间
  await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

  // 生成令牌
  const payload = { userId: user.id, username: user.username };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // 存储刷新令牌
  await query(
    `INSERT INTO user_sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
    [user.id, refreshToken, userAgent || null, ipAddress || null]
  );

  // 清理过期会话
  await query('SELECT cleanup_expired_sessions()');

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      created_at: user.created_at,
      last_login: new Date(),
    },
    accessToken,
    refreshToken,
    expiresIn: 900, // 15分钟 = 900秒
  };
}

/**
 * 刷新访问令牌
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  // 验证刷新令牌
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  // 检查会话是否存在且未过期
  const sessionResult = await query(
    `SELECT id, user_id, expires_at FROM user_sessions
     WHERE refresh_token = $1 AND expires_at > CURRENT_TIMESTAMP`,
    [refreshToken]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error('EXPIRED_REFRESH_TOKEN');
  }

  // 生成新的访问令牌
  const newPayload = { userId: payload.userId, username: payload.username };
  const accessToken = generateAccessToken(newPayload);

  return {
    accessToken,
    expiresIn: 900,
  };
}

/**
 * 用户登出
 */
export async function logoutUser(refreshToken: string): Promise<void> {
  await query('DELETE FROM user_sessions WHERE refresh_token = $1', [refreshToken]);
}

/**
 * 修改密码
 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  // 获取用户当前密码
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new Error('USER_NOT_FOUND');
  }

  // 验证旧密码
  const isValidPassword = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
  if (!isValidPassword) {
    throw new Error('INVALID_OLD_PASSWORD');
  }

  // 加密新密码
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // 更新密码
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

  // 撤销所有会话（强制重新登录）
  await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
}

/**
 * 从令牌中提取用户ID
 */
export function extractUserIdFromToken(token: string): string | null {
  const payload = verifyToken(token);
  return payload?.userId || null;
}
