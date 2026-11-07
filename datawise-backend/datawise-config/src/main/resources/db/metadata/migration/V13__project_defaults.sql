-- Project P3: default env + template marker
ALTER TABLE dw_projects ADD COLUMN default_env VARCHAR(64);
ALTER TABLE dw_projects ADD COLUMN template_id VARCHAR(64);
