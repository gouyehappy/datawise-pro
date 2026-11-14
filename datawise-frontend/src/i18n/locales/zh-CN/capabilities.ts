export default {
    unsupported: {
        sqlExecute: '当前数据源不支持 SQL 执行',
        sqlExplain: '当前数据源不支持执行计划（EXPLAIN）',
        sessionMonitor: '当前数据源不支持活跃会话监控',
        sessionKill: '当前数据源不支持终止会话',
        lockMonitor: '当前数据源不支持锁等待监控',
        onlineDdl: '当前数据源不支持在线 DDL',
        sshTunnel: '当前数据源不支持 SSH 隧道',
        tableMutation: '当前数据源不支持表数据变更',
        csvImport: '当前数据源不支持 CSV 导入',
        diagram: '当前数据源不支持 ER 图',
        visualQueryBuilder: '当前数据源不支持可视化查询构建',
        schemaCompare: '当前数据源不支持 Schema 对比',
        transactionalDdl: '当前数据源不支持事务性 DDL',
    },
    probe: {
        checking: '正在探测连接能力…',
        unavailable: '当前专项能力不可用：{detail}',
    },
}
