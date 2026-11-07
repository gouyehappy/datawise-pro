package org.apache.datawise.backend.connector;

/**
 * 数据源连接器能力声明。新增数据库时按需实现对应能力，上层 Service 按能力路由。
 */
public enum ConnectorCapability {
    CONNECTION_TEST,
    CATALOG,
    METADATA,
    DDL_READ,
    DDL_RENDER,
    DDL_TRANSLATE,
    SQL_EXECUTE,
    /** EXPLAIN / 执行计划（方言差异由上层包装） */
    SQL_EXPLAIN,
    DML,
    /** 活跃会话列表（SHOW PROCESSLIST 等） */
    SESSION_MONITOR,
    /** 终止数据库会话 */
    SESSION_KILL,
    /** 锁等待 / 阻塞链 */
    LOCK_MONITOR,
    /** 在线 DDL（如 MySQL ALGORITHM=INPLACE、PG CONCURRENTLY） */
    ONLINE_DDL,
    /** SSH 跳板隧道（连接层，B-05 实现前不在 catalog 中启用） */
    SSH_TUNNEL,
    NATIVE_COMMAND,
    KEY_VALUE,
    MESSAGE_BROKER,
    /** 文档型存储（MongoDB 等）集合/文档分页读取，非 JDBC SELECT */
    DOCUMENT_READ,
    /** 集群资源管理（YARN Resource Manager 等） */
    CLUSTER_MANAGER,
    /** CI/CD 作业服务（Jenkins 等） */
    CI_CD,
    /** Kubernetes 容器编排（Namespace / Pod / Deployment / Logs 等） */
    KUBERNETES,
    /** Nacos 配置中心（Namespace / Config browse） */
    NACOS,
    /** Polaris 服务发现（Namespace / Service / Instance browse） */
    POLARIS,
    /** 交互式远程 Shell（SSH 连接器等） */
    REMOTE_SHELL
}
