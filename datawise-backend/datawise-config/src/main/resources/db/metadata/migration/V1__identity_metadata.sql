-- Identity metadata schema (H2 MODE=PostgreSQL / Postgres compatible)
CREATE TABLE dw_users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(512),
    display_name VARCHAR(512),
    email VARCHAR(512),
    guest BOOLEAN NOT NULL DEFAULT FALSE,
    feature_permissions CLOB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_dw_users_username ON dw_users (username);

CREATE TABLE dw_sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    guest BOOLEAN NOT NULL DEFAULT FALSE,
    tenant_id VARCHAR(128),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_dw_sessions_user ON dw_sessions (user_id);

CREATE TABLE dw_api_tokens (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(512),
    user_id BIGINT NOT NULL,
    tenant_id VARCHAR(128),
    token_hash VARCHAR(512) NOT NULL,
    token_lookup VARCHAR(128) NOT NULL,
    scopes CLOB,
    created_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_dw_api_tokens_lookup ON dw_api_tokens (token_lookup);

CREATE TABLE dw_tenants (
    id VARCHAR(128) PRIMARY KEY,
    slug VARCHAR(128) NOT NULL,
    name VARCHAR(512) NOT NULL,
    status VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uk_dw_tenants_slug ON dw_tenants (slug);

CREATE TABLE dw_tenant_roles (
    id VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(128) NOT NULL,
    role_key VARCHAR(128) NOT NULL,
    name VARCHAR(512),
    permissions CLOB,
    system_role BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE dw_tenant_memberships (
    user_id BIGINT NOT NULL,
    tenant_id VARCHAR(128) NOT NULL,
    status VARCHAR(64),
    role_ids CLOB,
    joined_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE dw_metadata_import (
    id VARCHAR(64) PRIMARY KEY,
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL
);
