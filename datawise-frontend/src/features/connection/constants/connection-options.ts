import type {DbType} from '@/core/types'

export interface DriverPreset {
    jar: string
    driverClass: string
}

export const DRIVER_PRESETS: Partial<Record<DbType, DriverPreset>> = {
    mysql: {
        jar: 'mysql-connector-java-8.0.30.jar',
        driverClass: 'com.mysql.cj.jdbc.Driver',
    },
    mariadb: {
        jar: 'mariadb-java-client-3.1.4.jar',
        driverClass: 'org.mariadb.jdbc.Driver',
    },
    postgresql: {
        jar: 'postgresql-42.6.0.jar',
        driverClass: 'org.postgresql.Driver',
    },
    greenplum: {
        jar: 'postgresql-42.7.4.jar',
        driverClass: 'org.postgresql.Driver',
    },
    opengauss: {
        jar: 'opengauss-jdbc-5.0.0.jar',
        driverClass: 'org.opengauss.Driver',
    },
    kingbase: {
        jar: 'kingbase8-9.0.0.jar',
        driverClass: 'com.kingbase8.Driver',
    },
    oracle: {
        jar: 'ojdbc11-23.5.0.24.07.jar',
        driverClass: 'oracle.jdbc.OracleDriver',
    },
    dm: {
        jar: 'com.dameng:DmJdbcDriver18:8.1.3.140',
        driverClass: 'dm.jdbc.driver.DmDriver',
    },
    dameng: {
        jar: 'com.dameng:DmJdbcDriver18:8.1.3.140',
        driverClass: 'dm.jdbc.driver.DmDriver',
    },
    sqlserver: {
        jar: 'mssql-jdbc-12.8.1.jre11.jar',
        driverClass: 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
    },
    gbase8a: {
        jar: 'gbase-connector-java-9.5.0.10.jar',
        driverClass: 'com.gbase.jdbc.Driver',
    },
    elasticsearch: {
        jar: 'x-pack-sql-jdbc-8.17.5.jar',
        driverClass: 'org.elasticsearch.xpack.sql.jdbc.EsDriver',
    },
    kylin: {
        jar: 'kylin-jdbc-5.0.3.jar',
        driverClass: 'org.apache.kylin.jdbc.Driver',
    },
    hive: {
        jar: 'hive-jdbc-3.1.2.jar',
        driverClass: 'org.apache.hive.jdbc.HiveDriver',
    },
    clickhouse: {
        jar: 'clickhouse-jdbc-0.6.5-all.jar',
        driverClass: 'com.clickhouse.jdbc.ClickHouseDriver',
    },
    oceanbase: {
        jar: 'oceanbase-client-2.4.14.jar',
        driverClass: 'com.oceanbase.jdbc.Driver',
    },
    starrocks: {
        jar: 'mysql-connector-j-8.4.0.jar',
        driverClass: 'com.mysql.cj.jdbc.Driver',
    },
    doris: {
        jar: 'mysql-connector-j-8.4.0.jar',
        driverClass: 'com.mysql.cj.jdbc.Driver',
    },
    redis: {
        jar: 'jedis-4.3.1.jar',
        driverClass: 'redis.clients.jedis.Jedis',
    },
}

export const CONNECTION_STORAGE_OPTIONS = ['LOCAL', 'CLOUD'] as const
export const CONNECTION_AUTH_OPTIONS = ['User&Password', 'NONE'] as const

export {
    CONNECTION_ENV_DEFAULT,
    CONNECTION_ENV_OPTIONS,
    type ConnectionEnvironment,
} from '../services/connection-environment.service'
