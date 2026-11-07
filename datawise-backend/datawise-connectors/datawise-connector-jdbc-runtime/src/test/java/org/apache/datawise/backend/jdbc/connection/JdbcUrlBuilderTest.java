package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JdbcUrlBuilderTest {

    @Test
    void buildJdbcUrlWithEndpoint_rewritesCustomJdbcUrlHostPort() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("mysql");
        entity.setJdbcUrl("jdbc:mysql://remote.example:3306/shop?useSSL=false");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 54321);

        assertEquals("jdbc:mysql://127.0.0.1:54321/shop?useSSL=false", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsFromFieldsWhenUrlAbsent() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("postgresql");
        entity.setHost("remote.example");
        entity.setPort("5432");
        entity.setDatabaseName("app");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 54321);

        assertEquals("jdbc:postgresql://127.0.0.1:54321/app", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsKingbaseUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("kingbase");
        entity.setHost("remote.example");
        entity.setPort("54321");
        entity.setDatabaseName("app");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 54321);

        assertEquals("jdbc:kingbase8://127.0.0.1:54321/app", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_defaultsKingbaseDatabase() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("kingbase");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 54321);

        assertEquals("jdbc:kingbase8://127.0.0.1:54321/test", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsKylinUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("kylin");
        entity.setDatabaseName("sales");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 7070);

        assertEquals("jdbc:kylin://127.0.0.1:7070/sales", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_defaultsKylinProject() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("kylin");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 7070);

        assertEquals("jdbc:kylin://127.0.0.1:7070/learn_kylin", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsOpengaussUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("opengauss");
        entity.setDatabaseName("sales");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 15432);

        assertEquals("jdbc:opengauss://127.0.0.1:15432/sales", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsGreenplumUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("greenplum");
        entity.setDatabaseName("sales");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 5432);

        assertEquals("jdbc:postgresql://127.0.0.1:5432/sales", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsOceanbaseUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("oceanbase");
        entity.setDatabaseName("sales");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 2881);

        assertEquals(
                "jdbc:oceanbase://127.0.0.1:2881/sales?pool=false&useUnicode=true&characterEncoding=utf-8&sslMode=PREFERRED",
                url
        );
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsHighgoUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("highgo");
        entity.setDatabaseName("app");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 5866);

        assertEquals("jdbc:highgo://127.0.0.1:5866/app", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsDb2Url() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("db2");
        entity.setDatabaseName("sales");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 50000);

        assertEquals("jdbc:db2://127.0.0.1:50000/sales", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsSqliteFileUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("sqlite");
        entity.setDatabaseName("/data/app.db");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "ignored", 0);

        assertEquals("jdbc:sqlite:/data/app.db", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsPrestoUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("presto");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 18080);

        assertEquals("jdbc:presto://127.0.0.1:18080", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsOscarUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("oscar");
        entity.setDatabaseName("app");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 2003);

        assertEquals("jdbc:oscar://127.0.0.1:2003/app", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsTidbUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("tidb");
        entity.setDatabaseName("app");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 9030);

        assertEquals(
                "jdbc:mysql://127.0.0.1:9030/app?useUnicode=true&characterEncoding=utf-8&sslMode=PREFERRED"
                        + "&zeroDateTimeBehavior=convertToNull&serverTimezone=Asia/Shanghai"
                        + "&tinyInt1isBit=false&rewriteBatchedStatements=true&useCompression=true",
                url
        );
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsTdengineUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("tdengine");
        entity.setDatabaseName("metrics");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 6041);

        assertEquals(
                "jdbc:TAOS-RS://127.0.0.1:6041/metrics?charset=UTF-8&locale=en_US.UTF-8&timezone=UTC+8",
                url
        );
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsH2Url() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("h2");
        entity.setDatabaseName("demo");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 9092);

        assertEquals("jdbc:h2:tcp://127.0.0.1:9092/demo", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsGenericUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("generic");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 10000);

        assertEquals("jdbc:generic://127.0.0.1:10000/", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsOtherUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("other");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 10000);

        assertEquals("jdbc:other://127.0.0.1:10000/", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsDamengAliasAsDmUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("dameng");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 5236);

        assertEquals("jdbc:dm://127.0.0.1:5236", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsFlinkUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("flink");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 8083);

        assertEquals("jdbc:flink://127.0.0.1:8083", url);
    }

    @Test
    void buildJdbcUrlWithEndpoint_buildsGaussdbUrl() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("gaussdb");
        entity.setDatabaseName("app");

        String url = JdbcUrlBuilder.buildJdbcUrlWithEndpoint(entity, "127.0.0.1", 8000);

        assertEquals("jdbc:gaussdb://127.0.0.1:8000/app", url);
    }
}
