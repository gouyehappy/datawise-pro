package org.apache.datawise.backend.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DbTypeTest {

    @Test
    void normalizeIdDefaultsToMysql() {
        assertEquals("mysql", DbType.normalizeId(null));
        assertEquals("mysql", DbType.normalizeId(""));
    }

    @Test
    void parseByCanonicalIdAndDisplayName() {
        assertEquals(DbType.MYSQL, DbType.parse("mysql"));
        assertEquals(DbType.POSTGRESQL, DbType.parse("PostgreSql"));
        assertEquals(DbType.SQLSERVER, DbType.parse("mssql"));
    }

    @Test
    void familyChecksUseCanonicalIds() {
        assertTrue(DbType.isMysqlFamily("mysql"));
        assertFalse(DbType.isMysqlFamily("starrocks"));
        assertTrue(DbType.isOlapFamily("doris"));
        assertTrue(DbType.isOlapFamily("starrocks"));
        assertTrue(DbType.isMysqlProtocol("starrocks"));
        assertTrue(DbType.isMysqlFamily("gbase8a"));
        assertTrue(DbType.GBASE8A.matches("gbase8a"));
        assertTrue(DbType.ELASTICSEARCH.matches("elasticsearch"));
        assertTrue(DbType.KINGBASE.matches("kingbase"));
        assertTrue(DbType.KYLIN.matches("kylin"));
        assertTrue(DbType.OCEANBASE.matches("oceanbase"));
        assertTrue(DbType.isMysqlFamily("oceanbase"));
        assertTrue(DbType.GREENPLUM.matches("greenplum"));
        assertTrue(DbType.isPostgresqlFamily("greenplum"));
        assertTrue(DbType.OPENGAUSS.matches("opengauss"));
        assertTrue(DbType.isPostgresqlFamily("opengauss"));
        assertTrue(DbType.HIGHGO.matches("highgo"));
        assertTrue(DbType.OSCAR.matches("oscar"));
        assertTrue(DbType.TIDB.matches("tidb"));
        assertTrue(DbType.TDENGINE.matches("tdengine"));
        assertTrue(DbType.SYBASE.matches("sybase"));
        assertTrue(DbType.PHOENIX.matches("phoenix"));
        assertTrue(DbType.CACHEDB.matches("cachedb"));
        assertTrue(DbType.H2.matches("h2"));
        assertTrue(DbType.HSQL.matches("hsql"));
        assertTrue(DbType.HSQL.matches("hsqldb"));
        assertTrue(DbType.FLINK.matches("flink"));
        assertTrue(DbType.GAUSSDB.matches("gaussdb"));
        assertTrue(DbType.isGaussdb("gaussdb"));
        assertTrue(DbType.isPostgresqlFamily("gaussdb"));
        assertTrue(DbType.PRESTO.matches("presto"));
        assertTrue(DbType.SQLITE3.matches("sqlite"));
        assertTrue(DbType.SQLITE3.matches("sqlite3"));
        assertTrue(DbType.isSqlServerFamily("mssql"));
        assertFalse(DbType.isMysqlFamily("redis"));
    }

    @Test
    void catalogListed_includesRedisMysqlMongoDbSqlServerOracleDmAndClickHouse() {
        assertTrue(DbType.REDIS.isCatalogListed());
        assertTrue(DbType.MYSQL.isCatalogListed());
        assertTrue(DbType.MONGODB.isCatalogListed());
        assertTrue(DbType.HIVE.isCatalogListed());
        assertTrue(DbType.KUDU.isCatalogListed());
        assertTrue(DbType.SQLSERVER.isCatalogListed());
        assertTrue(DbType.ORACLE.isCatalogListed());
        assertTrue(DbType.DM.isCatalogListed());
        assertTrue(DbType.CLICKHOUSE.isCatalogListed());
        assertTrue(DbType.GBASE8A.isCatalogListed());
        assertTrue(DbType.KINGBASE.isCatalogListed());
        assertTrue(DbType.ELASTICSEARCH.isCatalogListed());
        assertTrue(DbType.KYLIN.isCatalogListed());
        assertTrue(DbType.OCEANBASE.isCatalogListed());
        assertTrue(DbType.GREENPLUM.isCatalogListed());
        assertTrue(DbType.OPENGAUSS.isCatalogListed());
        assertTrue(DbType.HIGHGO.isCatalogListed());
        assertTrue(DbType.DB2.isCatalogListed());
        assertTrue(DbType.SQLITE3.isCatalogListed());
        assertTrue(DbType.PRESTO.isCatalogListed());
        assertTrue(DbType.OSCAR.isCatalogListed());
        assertTrue(DbType.TIDB.isCatalogListed());
        assertTrue(DbType.TDENGINE.isCatalogListed());
        assertTrue(DbType.SYBASE.isCatalogListed());
        assertTrue(DbType.PHOENIX.isCatalogListed());
        assertTrue(DbType.CACHEDB.isCatalogListed());
        assertTrue(DbType.H2.isCatalogListed());
        assertTrue(DbType.HSQL.isCatalogListed());
        assertTrue(DbType.GENERIC.isCatalogListed());
        assertTrue(DbType.OTHER.isCatalogListed());
        assertTrue(DbType.FLINK.isCatalogListed());
        assertTrue(DbType.YARN.isCatalogListed());
        assertTrue(DbType.JENKINS.isCatalogListed());
        assertTrue(DbType.SSH.isCatalogListed());
        assertTrue(DbType.KUBERNETES.isCatalogListed());
        assertTrue(DbType.NACOS.isCatalogListed());
        assertTrue(DbType.POLARIS.isCatalogListed());
        assertTrue(DbType.GAUSSDB.isCatalogListed());
        assertTrue(DbType.PLUGIN.isCatalogListed());
        assertEquals(DbType.DM, DbType.find("dameng").orElseThrow());
        assertEquals(45, DbType.catalogListed().size());
    }

    @Test
    void find_resolvesRedis() {
        assertEquals(DbType.REDIS, DbType.find("redis").orElseThrow());
    }

    @Test
    void find_resolvesKafka() {
        assertEquals(DbType.KAFKA, DbType.find("kafka").orElseThrow());
        assertEquals(DbType.YARN, DbType.find("yarn").orElseThrow());
        assertEquals(DbType.JENKINS, DbType.find("jenkins").orElseThrow());
        assertEquals(DbType.SSH, DbType.find("ssh").orElseThrow());
        assertEquals(DbType.KUBERNETES, DbType.find("kubernetes").orElseThrow());
        assertEquals(DbType.NACOS, DbType.find("nacos").orElseThrow());
        assertEquals(DbType.POLARIS, DbType.find("polaris").orElseThrow());
    }

    @Test
    void find_resolvesMongoDb() {
        assertEquals(DbType.MONGODB, DbType.find("mongodb").orElseThrow());
    }

    @Test
    void find_resolvesTrino() {
        assertEquals(DbType.TRINO, DbType.find("trino").orElseThrow());
    }

    @Test
    void find_resolvesHive() {
        assertEquals(DbType.HIVE, DbType.find("hive").orElseThrow());
    }

    @Test
    void find_resolvesKudu() {
        assertEquals(DbType.KUDU, DbType.find("kudu").orElseThrow());
    }

    @Test
    void find_resolvesAliases() {
        assertEquals(DbType.SQLSERVER, DbType.find("mssql").orElseThrow());
        assertEquals(DbType.POSTGRESQL, DbType.find("postgres").orElseThrow());
        assertEquals(DbType.SQLITE3, DbType.find("sqlite").orElseThrow());
        assertEquals(DbType.DM, DbType.find("dameng").orElseThrow());
    }

    @Test
    void quoteNameUsesBackticksForMysql() {
        assertEquals("`users`", DbType.MYSQL.quoteName("users"));
        assertEquals("\"users\"", DbType.POSTGRESQL.quoteName("users"));
        assertEquals("[users]", DbType.SQLSERVER.quoteName("users"));
        assertEquals("\"users\"", DbType.TRINO.quoteName("users"));
    }

    @Test
    void quoteNameEscapesEmbeddedQuotes() {
        assertEquals("`user``name`", DbType.MYSQL.quoteName("user`name"));
        assertEquals("\"user\"\"name\"", DbType.TRINO.quoteName("user\"name"));
        assertEquals("[user]]name]", DbType.SQLSERVER.quoteName("user]name"));
    }

    @Test
    void quoteQualifiedTable_supportsCatalogSchemaAndSqlServer() {
        assertEquals(
                "\"hive\".\"a003\".\"agent_test3\"",
                DbType.quoteQualifiedTable("trino", "hive.a003", "agent_test3"));
        assertEquals(
                "[AdventureWorks].[dbo].[Person]",
                DbType.quoteQualifiedTable("sqlserver", "AdventureWorks", "Person"));
        assertEquals(
                "[AdventureWorks].[sales].[Person]",
                DbType.quoteQualifiedTable("sqlserver", "AdventureWorks.sales", "Person"));
        assertEquals(
                "`shop`.`orders`",
                DbType.quoteQualifiedTable("mysql", "shop", "orders"));
        assertEquals(
                "`hive`.`default`.`users`",
                DbType.quoteQualifiedTable("hive", "hive.default", "users"));
    }
}
