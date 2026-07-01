-- ============================================
-- AIIgnitePLC Database Schema - Optimized
-- PostgreSQL 15+
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 0. Users & Authentication
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================
-- 0.1 Helper Functions
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. Projects Table
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    created_by VARCHAR(100),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, created_by)
);

COMMENT ON TABLE projects IS 'PLC Projects master table';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_is_public ON projects(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- ============================================
-- 2. Project Nodes (Tree Structure)
-- ============================================
CREATE TABLE IF NOT EXISTS project_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES project_nodes(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('project', 'folder', 'device', 'block', 'block_ob', 'block_fc', 'block_fb', 'tag', 'tag_table', 'config', 'settings')),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50),
    is_open BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, parent_id, name)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON project_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_project ON project_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_nodes_project_type ON project_nodes(project_id, type);
CREATE INDEX IF NOT EXISTS idx_nodes_order ON project_nodes(project_id, parent_id, order_index);

-- ============================================
-- 3. Tags Table
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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tags_project ON tags(project_id);
CREATE INDEX IF NOT EXISTS idx_tags_address ON tags(address);
CREATE INDEX IF NOT EXISTS idx_tags_project_address ON tags(project_id, address);
CREATE INDEX IF NOT EXISTS idx_tags_data_type ON tags(data_type);

-- ============================================
-- 4. Program Blocks
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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_blocks_node ON program_blocks(node_id);
CREATE INDEX IF NOT EXISTS idx_blocks_content_gin ON program_blocks USING GIN (content jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_blocks_type ON program_blocks(block_type);

-- ============================================
-- 5. Hardware Modules
-- ============================================
CREATE TABLE IF NOT EXISTS hardware_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    article_number VARCHAR(255),
    firmware VARCHAR(50),
    type VARCHAR(20) NOT NULL CHECK (type IN ('ps', 'cpu', 'io', 'comm', 'empty')),
    hw_id INTEGER,
    config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_hw_project ON hardware_modules(project_id);
CREATE INDEX IF NOT EXISTS idx_hw_slot ON hardware_modules(project_id, slot);

-- ============================================
-- 6. PLC Runtime State
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

CREATE INDEX IF NOT EXISTS idx_runtime_project ON plc_runtime_state(project_id);
CREATE INDEX IF NOT EXISTS idx_runtime_updated ON plc_runtime_state(last_updated DESC);

-- ============================================
-- 7. Import History
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

CREATE INDEX IF NOT EXISTS idx_import_project ON import_history(project_id);
CREATE INDEX IF NOT EXISTS idx_import_created ON import_history(created_at DESC);

-- ============================================
-- 8. Audit Logs
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ============================================
-- Triggers
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_program_blocks_updated_at ON program_blocks;
CREATE TRIGGER update_program_blocks_updated_at
    BEFORE UPDATE ON program_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hardware_modules_updated_at ON hardware_modules;
CREATE TRIGGER update_hardware_modules_updated_at
    BEFORE UPDATE ON hardware_modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views
-- ============================================
CREATE OR REPLACE VIEW v_project_summary AS
SELECT
    p.id,
    p.name,
    p.description,
    p.version,
    p.is_public,
    p.created_at,
    p.updated_at,
    COUNT(DISTINCT pn.id) as node_count,
    COUNT(DISTINCT t.id) as tag_count,
    COUNT(DISTINCT pb.id) as block_count
FROM projects p
LEFT JOIN project_nodes pn ON p.id = pn.project_id
LEFT JOIN tags t ON p.id = t.project_id
LEFT JOIN program_blocks pb ON pb.node_id IN (SELECT id FROM project_nodes WHERE project_id = p.id)
GROUP BY p.id;

-- Materialized view for statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_stats AS
SELECT
    p.id as project_id,
    COUNT(DISTINCT pn.id) as total_nodes,
    COUNT(DISTINCT t.id) as total_tags,
    COUNT(DISTINCT pb.id) as total_blocks,
    COUNT(DISTINCT hm.id) as total_hardware_modules,
    MAX(t.updated_at) as last_tag_update,
    MAX(pb.updated_at) as last_block_update
FROM projects p
LEFT JOIN project_nodes pn ON p.id = pn.project_id
LEFT JOIN tags t ON p.id = t.project_id
LEFT JOIN program_blocks pb ON pb.node_id IN (SELECT id FROM project_nodes WHERE project_id = p.id)
LEFT JOIN hardware_modules hm ON p.id = hm.project_id
GROUP BY p.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_stats_id ON mv_project_stats(project_id);
