package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DbTypeJdbcDriverDefaultsProviderTest {

    @Test
    void defaultsFor_returnsMysqlDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("mysql");
        assertTrue(defaults.isPresent());
        assertEquals("com.mysql:mysql-connector-j:8.4.0", defaults.get().mavenCoordinates());
        assertEquals("com.mysql.cj.jdbc.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_skipsRedis() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        assertTrue(provider.defaultsFor("redis").isEmpty());
    }

    @Test
    void allDefaults_deduplicatesSharedPostgresqlDriver() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        assertEquals(28, provider.allDefaults().size());
    }

    @Test
    void defaultsFor_returnsGbase8aDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("gbase8a");
        assertTrue(defaults.isPresent());
        assertEquals("com.gbase:gbase-connector-java:9.5.0.10", defaults.get().mavenCoordinates());
        assertEquals("com.gbase.jdbc.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsClickHouseDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("clickhouse");
        assertTrue(defaults.isPresent());
        assertEquals("com.clickhouse:clickhouse-jdbc:0.6.5", defaults.get().mavenCoordinates());
        assertEquals("com.clickhouse.jdbc.ClickHouseDriver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsDmDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("dm");
        assertTrue(defaults.isPresent());
        assertEquals("com.dameng:DmJdbcDriver18:8.1.3.140", defaults.get().mavenCoordinates());
        assertEquals("dm.jdbc.driver.DmDriver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsOracleDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("oracle");
        assertTrue(defaults.isPresent());
        assertEquals("com.oracle.database.jdbc:ojdbc11:23.5.0.24.07", defaults.get().mavenCoordinates());
        assertEquals("oracle.jdbc.OracleDriver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsSqlServerDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("sqlserver");
        assertTrue(defaults.isPresent());
        assertEquals("com.microsoft.sqlserver:mssql-jdbc:12.8.1.jre11", defaults.get().mavenCoordinates());
        assertEquals("com.microsoft.sqlserver.jdbc.SQLServerDriver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsKingbaseDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("kingbase");
        assertTrue(defaults.isPresent());
        assertEquals("cn.com.kingbase:kingbase8:9.0.0", defaults.get().mavenCoordinates());
        assertEquals("com.kingbase8.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsElasticsearchDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("elasticsearch");
        assertTrue(defaults.isPresent());
        assertEquals("org.elasticsearch.plugin:x-pack-sql-jdbc:8.17.5", defaults.get().mavenCoordinates());
        assertEquals("org.elasticsearch.xpack.sql.jdbc.EsDriver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsKylinDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("kylin");
        assertTrue(defaults.isPresent());
        assertEquals("org.apache.kylin:kylin-jdbc:5.0.3", defaults.get().mavenCoordinates());
        assertEquals("org.apache.kylin.jdbc.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsOceanbaseDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("oceanbase");
        assertTrue(defaults.isPresent());
        assertEquals("com.oceanbase:oceanbase-client:2.4.14", defaults.get().mavenCoordinates());
        assertEquals("com.oceanbase.jdbc.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsGreenplumDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("greenplum");
        assertTrue(defaults.isPresent());
        assertEquals("org.postgresql:postgresql:42.7.4", defaults.get().mavenCoordinates());
        assertEquals("org.postgresql.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsOpengaussDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("opengauss");
        assertTrue(defaults.isPresent());
        assertEquals("org.opengauss:opengauss-jdbc:5.0.0", defaults.get().mavenCoordinates());
        assertEquals("org.opengauss.Driver", defaults.get().driverClass());
    }

    @Test
    void defaultsFor_returnsHiveDriverFromDbType() {
        DbTypeJdbcDriverDefaultsProvider provider = new DbTypeJdbcDriverDefaultsProvider();
        Optional<JdbcDriverDefaultsProvider.DriverDefaults> defaults = provider.defaultsFor("hive");
        assertTrue(defaults.isPresent());
        assertEquals("org.apache.hive:hive-jdbc:3.1.2", defaults.get().mavenCoordinates());
        assertEquals("org.apache.hive.jdbc.HiveDriver", defaults.get().driverClass());
    }
}
