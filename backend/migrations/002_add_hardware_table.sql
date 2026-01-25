-- ============================================
-- Hardware Modules Table
-- ============================================
CREATE TABLE IF NOT EXISTS hardware_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    article_number VARCHAR(100),
    firmware VARCHAR(50),
    type VARCHAR(50) NOT NULL CHECK (type IN ('ps', 'cpu', 'io', 'comm', 'empty')),
    config JSONB DEFAULT '{}', -- Stores ip, subnet, ioStart, ioLength, etc.
    hw_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, slot)
);

COMMENT ON TABLE hardware_modules IS '硬件配置模组表';
COMMENT ON COLUMN hardware_modules.config IS '存储扩展属性：ip, subnet, ioStart, ioLength等';
