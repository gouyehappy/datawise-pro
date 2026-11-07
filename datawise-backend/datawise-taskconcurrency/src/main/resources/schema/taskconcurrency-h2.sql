-- Task concurrency controller schema (H2)
-- 与 taskconcurrency-mysql.sql 表结构一致，供单元测试 / 嵌入式 H2 使用

CREATE TABLE IF NOT EXISTS dw_tc_global
(
    id             TINYINT      NOT NULL DEFAULT 1,
    max_concurrent INT          NOT NULL DEFAULT 6,
    version        BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

MERGE INTO dw_tc_global (id, max_concurrent, version) KEY (id) VALUES (1, 6, 0);

CREATE TABLE IF NOT EXISTS dw_tc_tenant
(
    tenant_id       INT     NOT NULL PRIMARY KEY,
    allocated_slots INT     NOT NULL,
    reserved_slots  INT     NOT NULL DEFAULT 0,
    max_concurrent  INT     NOT NULL DEFAULT 2147483647,
    enabled         TINYINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dw_tc_pending_task
(
    task_id       VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id     INT         NOT NULL,
    priority      INT         NOT NULL DEFAULT 5,
    enqueue_time  BIGINT      NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    dispatched_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_tc_pending_dispatch ON dw_tc_pending_task (status, priority DESC, enqueue_time);

CREATE TABLE IF NOT EXISTS dw_tc_slot_lease
(
    task_id              VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id            INT          NOT NULL,
    slot_owner_tenant_id INT          NOT NULL,
    borrowed             TINYINT      NOT NULL DEFAULT 0,
    priority             INT          NOT NULL,
    instance_id          VARCHAR(128) NOT NULL,
    acquired_at          BIGINT       NOT NULL,
    heartbeat_at         BIGINT       NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tc_lease_owner ON dw_tc_slot_lease (slot_owner_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tc_lease_heartbeat ON dw_tc_slot_lease (heartbeat_at);
