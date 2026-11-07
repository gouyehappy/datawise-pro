-- Project workspace metadata (jdbc storage backend)
CREATE TABLE dw_project_index (
    tenant_id VARCHAR(128) PRIMARY KEY,
    version INT NOT NULL DEFAULT 1,
    default_project_id VARCHAR(128) NOT NULL
);

CREATE TABLE dw_projects (
    tenant_id VARCHAR(128) NOT NULL,
    id VARCHAR(128) NOT NULL,
    name VARCHAR(512) NOT NULL,
    color_key VARCHAR(64),
    description CLOB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    docs_dir VARCHAR(256),
    scripts_dir VARCHAR(256),
    PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_dw_projects_tenant ON dw_projects (tenant_id);

CREATE TABLE dw_user_active_projects (
    user_id BIGINT NOT NULL,
    tenant_id VARCHAR(128) NOT NULL,
    project_id VARCHAR(128) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, tenant_id)
);
