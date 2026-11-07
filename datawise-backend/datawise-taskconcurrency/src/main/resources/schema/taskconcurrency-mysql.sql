-- Task concurrency controller schema (MySQL)
-- 表关系：dw_tc_global（全局锁行） / dw_tc_tenant（租户策略）
--         dw_tc_pending_task（等待池） / dw_tc_slot_lease（运行租约）
-- 分布式互斥：dispatch 时对 dw_tc_global.id=1 行 FOR UPDATE

CREATE TABLE IF NOT EXISTS dw_tc_global
(
    id             TINYINT      NOT NULL PRIMARY KEY DEFAULT 1,
    max_concurrent INT          NOT NULL             DEFAULT 6,
    version        BIGINT       NOT NULL             DEFAULT 0  -- 预留乐观锁扩展
) COMMENT ='全局并发上限';

INSERT INTO dw_tc_global (id, max_concurrent)
VALUES (1, 6)
ON DUPLICATE KEY UPDATE max_concurrent = max_concurrent;

CREATE TABLE IF NOT EXISTS dw_tc_tenant
(
    tenant_id       INT  NOT NULL PRIMARY KEY,
    allocated_slots INT  NOT NULL COMMENT '租户分配卡槽总数',
    reserved_slots  INT  NOT NULL DEFAULT 0 COMMENT '不可借出的保留卡槽',
    max_concurrent  INT  NOT NULL DEFAULT 2147483647 COMMENT '租户同时运行上限',
    enabled         TINYINT NOT NULL DEFAULT 1
) COMMENT ='租户卡槽策略';

CREATE TABLE IF NOT EXISTS dw_tc_pending_task
(
    task_id       VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id     INT          NOT NULL,
    priority      INT          NOT NULL DEFAULT 5,
    enqueue_time  BIGINT       NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING=等待调度 DISPATCHED=已分配等待ack',
    dispatched_at BIGINT       NULL COMMENT '最近一次 dispatch 时间',
    KEY idx_tc_pending_dispatch (status, priority DESC, enqueue_time)
) COMMENT ='任务池（ack 前不删除）';

CREATE TABLE IF NOT EXISTS dw_tc_slot_lease
(
    task_id              VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id            INT          NOT NULL COMMENT '执行租户',
    slot_owner_tenant_id INT          NOT NULL COMMENT '卡槽属主租户',
    borrowed             TINYINT      NOT NULL DEFAULT 0,
    priority             INT          NOT NULL,
    instance_id          VARCHAR(128) NOT NULL,
    acquired_at          BIGINT       NOT NULL,
    heartbeat_at         BIGINT       NOT NULL,
    KEY idx_tc_lease_owner (slot_owner_tenant_id),
    KEY idx_tc_lease_heartbeat (heartbeat_at)
) COMMENT ='运行中卡槽租约';
