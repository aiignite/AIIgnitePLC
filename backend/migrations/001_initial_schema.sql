-- ============================================
-- AIIgnitePLC Database Schema
-- PostgreSQL 15+
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 项目主表 (projects)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    version INTEGER DEFAULT 1,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE projects IS 'PLC 项目主表';
COMMENT ON COLUMN projects.version IS '项目版本号，用于乐观锁';

-- ============================================
-- 2. 项目节点树 (project_nodes) - Adjacency List
-- ============================================
CREATE TABLE IF NOT EXISTS project_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES project_nodes(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('folder', 'device', 'block', 'tag_table', 'config', 'settings')),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50),
    is_open BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, parent_id, name)
);

COMMENT ON TABLE project_nodes IS '项目树节点，使用邻接表模式';
COMMENT ON COLUMN project_nodes.parent_id IS '父节点 ID，NULL 表示根节点';
COMMENT ON COLUMN project_nodes.is_open IS 'UI 展开状态';

CREATE INDEX IF NOT EXISTS idx_nodes_parent ON project_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_project ON project_nodes(project_id);

-- ============================================
-- 3. 变量表 (Tags) - 强关系存储
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(100) NOT NULL,
    data_type VARCHAR(50) NOT NULL DEFAULT 'Bool',
    comment TEXT,
    is_retentive BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, name)
);

COMMENT ON TABLE tags IS 'PLC 变量标签表';
COMMENT ON COLUMN tags.address IS 'PLC 地址，如 %I0.0, %Q0.0, %M10.0';
COMMENT ON COLUMN tags.is_retentive IS '是否保持型变量（断电保持）';

-- 地址索引用于冲突检测
CREATE INDEX IF NOT EXISTS idx_tags_address ON tags(address);

-- ============================================
-- 4. 程序块 (program_blocks) - JSONB 存储
-- ============================================
CREATE TABLE IF NOT EXISTS program_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id UUID NOT NULL UNIQUE REFERENCES project_nodes(id) ON DELETE CASCADE,
    block_type VARCHAR(10) NOT NULL CHECK (block_type IN ('OB', 'FC', 'FB', 'DB')),
    number INTEGER,
    title VARCHAR(255),
    description TEXT,
    content JSONB NOT NULL DEFAULT '[]',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE program_blocks IS '程序块逻辑内容，使用 JSONB 存储 Ladder Logic';
COMMENT ON COLUMN program_blocks.block_type IS 'OB=组织块, FC=功能, FB=功能块, DB=数据块';
COMMENT ON COLUMN program_blocks.content IS 'JSONB 存储完整的 networks 数组';
COMMENT ON COLUMN program_blocks.version IS '乐观锁版本号';

-- GIN 索引用于 JSONB 查询（如查找使用 Timer 指令的块）
CREATE INDEX IF NOT EXISTS idx_blocks_content_gin ON program_blocks USING GIN (content);

-- ============================================
-- 5. PLC 运行时模拟状态
-- ============================================
CREATE TABLE IF NOT EXISTS plc_runtime_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag_address VARCHAR(100) NOT NULL,
    current_value JSONB,
    quality VARCHAR(20) DEFAULT 'good',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, tag_address)
);

COMMENT ON TABLE plc_runtime_state IS 'Mock PLC 运行时状态，用于在线监控模拟';
COMMENT ON COLUMN plc_runtime_state.quality IS '值质量：good, bad, uncertain';

-- ============================================
-- 6. 项目导入记录
-- ============================================
CREATE TABLE IF NOT EXISTS import_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    source_format VARCHAR(50) NOT NULL CHECK (source_format IN ('SCL', 'XML', 'IEC')),
    source_file_name VARCHAR(255),
    import_status VARCHAR(20) CHECK (import_status IN ('success', 'partial', 'failed')),
    diagnostics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE import_history IS '项目导入历史记录，用于格式兼容性追踪';

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 projects 表添加触发器
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 为 tags 表添加触发器
DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 为 program_blocks 表添加触发器
DROP TRIGGER IF EXISTS update_program_blocks_updated_at ON program_blocks;
CREATE TRIGGER update_program_blocks_updated_at
    BEFORE UPDATE ON program_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始化示例数据（可选）
-- ============================================

-- 创建默认项目
INSERT INTO projects (name, description, created_by)
VALUES ('Demo Project', '示例 PLC 项目', 'system')
ON CONFLICT (name) DO NOTHING;

-- 创建默认变量
INSERT INTO tags (project_id, name, address, data_type, comment)
SELECT
    (SELECT id FROM projects WHERE name = 'Demo Project'),
    'Start_Button',
    '%I0.0',
    'Bool',
    '主启动按钮'
ON CONFLICT DO NOTHING;

INSERT INTO tags (project_id, name, address, data_type, comment)
SELECT
    (SELECT id FROM projects WHERE name = 'Demo Project'),
    'Stop_Button',
    '%I0.1',
    'Bool',
    '停止按钮'
ON CONFLICT DO NOTHING;

INSERT INTO tags (project_id, name, address, data_type, comment)
SELECT
    (SELECT id FROM projects WHERE name = 'Demo Project'),
    'Motor_Output',
    '%Q0.0',
    'Bool',
    '电机输出线圈'
ON CONFLICT DO NOTHING;

-- ============================================
-- 数据字典视图
-- ============================================
CREATE OR REPLACE VIEW v_project_summary AS
SELECT
    p.id,
    p.name,
    p.description,
    p.version,
    p.created_at,
    p.updated_at,
    COUNT(DISTINCT pn.id) as node_count,
    COUNT(DISTINCT t.id) as tag_count,
    COUNT(DISTINCT pb.id) as block_count
FROM projects p
LEFT JOIN project_nodes pn ON p.id = pn.project_id
LEFT JOIN tags t ON p.id = t.project_id
LEFT JOIN program_blocks pb ON p.id = (SELECT project_id FROM project_nodes WHERE id = pb.node_id)
GROUP BY p.id;

COMMENT ON VIEW v_project_summary IS '项目汇总视图';
