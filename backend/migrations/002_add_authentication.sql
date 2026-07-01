-- ============================================
-- AIIgnitePLC 认证功能数据库迁移
-- ============================================

-- 1. 启用 UUID 扩展（如果尚未启用）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

COMMENT ON TABLE users IS '用户账户表';
COMMENT ON COLUMN users.password_hash IS 'bcrypt 加密后的密码';
COMMENT ON COLUMN users.last_login IS '最后登录时间';

-- 3. 用户会话表（用于存储刷新令牌）
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(500) NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE user_sessions IS '用户刷新令牌存储';

-- 4. 修改 projects 表：添加外键约束
-- 注意：由于现有数据中 created_by 可能是 NULL 或非 UUID 字符串，
-- 我们先清理无效数据，然后添加外键约束

-- 首先更新现有的 NULL created_by 为系统用户 ID
UPDATE projects
SET created_by = '00000000-0000-0000-0000-000000000000'::UUID
WHERE created_by IS NULL OR created_by = '' OR created_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 添加外键约束（延迟验证以兼容现有数据）
ALTER TABLE projects
    ADD CONSTRAINT fk_project_creator
    FOREIGN KEY (created_by)
    REFERENCES users(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- 5. 索引优化
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_projects_creator ON projects(created_by);

-- 6. 触发器：自动更新 updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. 清理函数：过期会话清理
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_sessions IS '清理过期的用户会话';

-- 8. 创建默认系统管理员账户（仅当用户表为空时）
-- 密码: Admin123! (使用 bcrypt 生成，cost factor 10)
-- 注意：在生产环境中应该立即修改此密码
INSERT INTO users (id, username, email, password_hash, full_name, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'admin',
    'admin@aiignite.local',
    '$2b$10$YourBcryptHashHere...', -- 实际部署时需要替换
    'System Administrator',
    true
) ON CONFLICT (username) DO NOTHING;
