package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.model.ConnectionEntity;

public final class JdbcUrlBuilder {

    private JdbcUrlBuilder() {
    }

    public static String buildJdbcUrl(ConnectionEntity entity) {
        if (entity.getJdbcUrl() != null && !entity.getJdbcUrl().isBlank()) {
            return Hive2JdbcUrlSupport.finalizeUrl(entity, entity.getJdbcUrl().trim());
        }
        return buildJdbcUrlWithEndpoint(
                entity,
                entity.getHost() != null ? entity.getHost() : "localhost",
                parsePort(entity.getPort(), defaultPort(DbType.parse(entity.getDbType())))
        );
    }

    public static String buildJdbcUrlWithEndpoint(ConnectionEntity entity, String host, int port) {
        if (entity.getJdbcUrl() != null && !entity.getJdbcUrl().isBlank()) {
            return Hive2JdbcUrlSupport.finalizeUrl(
                    entity,
                    rewriteJdbcUrlHostPort(entity.getJdbcUrl().trim(), host, port)
            );
        }
        DbType dbType = DbType.parse(entity.getDbType());
        String database = entity.getDatabaseName() != null ? entity.getDatabaseName() : "";
        if (DbType.OCEANBASE.matches(dbType.id())) {
            String db = database.isBlank() ? "test" : database;
            return "jdbc:oceanbase://" + host + ":" + port + "/" + db
                    + "?pool=false&useUnicode=true&characterEncoding=utf-8&sslMode=PREFERRED";
        }
        if (DbType.GBASE8A.matches(dbType.id())) {
            String db = database.isBlank() ? "test" : database;
            return "jdbc:gbase://" + host + ":" + port + "/" + db;
        }
        if (DbType.TIDB.matches(dbType.id())) {
            String db = database.isBlank() ? "test" : database;
            return "jdbc:mysql://" + host + ":" + port + "/" + db
                    + "?useUnicode=true&characterEncoding=utf-8&sslMode=PREFERRED&zeroDateTimeBehavior=convertToNull"
                    + "&serverTimezone=Asia/Shanghai&tinyInt1isBit=false&rewriteBatchedStatements=true&useCompression=true";
        }
        if (DbType.isMysqlProtocol(dbType.id())) {
            return "jdbc:mysql://" + host + ":" + port + "/" + database
                    + "?sslMode=PREFERRED&allowPublicKeyRetrieval=true&serverTimezone=UTC";
        }
        if (DbType.KINGBASE.matches(dbType.id())) {
            String db = database.isBlank() ? "test" : database;
            return "jdbc:kingbase8://" + host + ":" + port + "/" + db;
        }
        if (DbType.OPENGAUSS.matches(dbType.id())) {
            String db = database.isBlank() ? "test" : database;
            return "jdbc:opengauss://" + host + ":" + port + "/" + db;
        }
        if (DbType.HIGHGO.matches(dbType.id())) {
            String db = database.isBlank() ? "highgo" : database;
            return "jdbc:highgo://" + host + ":" + port + "/" + db;
        }
        if (DbType.OSCAR.matches(dbType.id())) {
            String db = database.isBlank() ? "OSCRDB" : database;
            return "jdbc:oscar://" + host + ":" + port + "/" + db;
        }
        if (DbType.TDENGINE.matches(dbType.id())) {
            String db = database.isBlank() ? "test" : database;
            return "jdbc:TAOS-RS://" + host + ":" + port + "/" + db
                    + "?charset=UTF-8&locale=en_US.UTF-8&timezone=UTC+8";
        }
        if (DbType.KYLIN.matches(dbType.id())) {
            String project = database.isBlank() ? "learn_kylin" : database;
            return "jdbc:kylin://" + host + ":" + port + "/" + project;
        }
        if (DbType.GAUSSDB.matches(dbType.id())) {
            String db = database.isBlank() ? "postgres" : database;
            return "jdbc:gaussdb://" + host + ":" + port + "/" + db;
        }
        if (DbType.isPostgresqlFamily(dbType.id())) {
            return "jdbc:postgresql://" + host + ":" + port + "/" + database;
        }
        if (DbType.SQLITE3.matches(dbType.id())) {
            String file = !database.isBlank() ? database : host;
            if (file == null || file.isBlank()) {
                file = "/tmp/test.db";
            }
            if (file.startsWith("jdbc:sqlite:")) {
                return file;
            }
            return "jdbc:sqlite:" + file;
        }
        return switch (dbType) {
            case SQLSERVER -> "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database;
            case ORACLE -> "jdbc:oracle:thin:@" + host + ":" + port + ":"
                    + (entity.getSid() != null ? entity.getSid() : "ORCL");
            case DB2 -> {
                String db = database.isBlank() ? "testdb" : database;
                yield "jdbc:db2://" + host + ":" + port + "/" + db;
            }
            case PRESTO, TRINO, FLINK -> "jdbc:" + dbType.id() + "://" + host + ":" + port;
            case DM -> {
                String db = database.isBlank() ? "" : database;
                yield database.isBlank()
                        ? "jdbc:dm://" + host + ":" + port
                        : "jdbc:dm://" + host + ":" + port + "/" + db;
            }
            case GENERIC, OTHER -> "jdbc:" + dbType.id() + "://" + host + ":" + port + "/";
            case SYBASE -> {
                String db = database.isBlank() ? "test" : database;
                yield "jdbc:sybase:Tds:" + host + ":" + port + "/" + db + "?charset=cp936";
            }
            case PHOENIX -> "jdbc:phoenix:" + host + ":" + port;
            case HIVE -> Hive2JdbcUrlSupport.buildUrl(entity, host, port);
            case CACHEDB -> "jdbc:Cache://" + host + ":" + port;
            case H2 -> {
                String db = database.isBlank() ? "test" : database;
                yield "jdbc:h2:tcp://" + host + ":" + port + "/" + db;
            }
            case HSQL -> {
                String db = database.isBlank() ? "test" : database;
                yield "jdbc:hsqldb://" + host + ":" + port + "/" + db;
            }
            default -> throw new IllegalArgumentException("Unsupported db type: " + dbType.id());
        };
    }

    private static String rewriteJdbcUrlHostPort(String jdbcUrl, String host, int port) {
        return jdbcUrl.replaceFirst("(//)([^/;:]+)(:\\d+)?", "$1" + host + ":" + port);
    }

    private static int parsePort(String port, String fallback) {
        if (port != null && !port.isBlank()) {
            try {
                return Integer.parseInt(port.trim());
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        return Integer.parseInt(fallback);
    }

    public static String buildJdbcUrl(ConnectionConfig config) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setJdbcUrl(config.getUrl());
        entity.setDbType(config.getDbType());
        entity.setHost(config.getHost());
        entity.setPort(config.getPort());
        entity.setDatabaseName(config.getDatabase());
        entity.setSid(config.getSid());
        entity.setAuthType(config.getAuth());
        entity.setUsername(config.getUser());
        entity.setPassword(config.getPassword());
        entity.setAdvancedConfig(config.getAdvancedConfig());
        return buildJdbcUrl(entity);
    }

    private static String defaultPort(DbType dbType) {
        return switch (dbType) {
            case KINGBASE -> "54321";
            case HIGHGO -> "5866";
            case OSCAR -> "2003";
            case OPENGAUSS -> "15432";
            case KYLIN -> "7070";
            case OCEANBASE -> "2881";
            case POSTGRESQL, GREENPLUM -> "5432";
            case STARROCKS, DORIS, TIDB -> "9030";
            case TDENGINE -> "6041";
            case SYBASE -> "5000";
            case PHOENIX -> "8765";
            case HIVE -> "10000";
            case CACHEDB -> "1972";
            case H2 -> "9092";
            case HSQL -> "9001";
            case SQLSERVER -> "1433";
            case ORACLE -> "1521";
            case DB2 -> "50000";
            case PRESTO -> "18080";
            case FLINK -> "8083";
            case GAUSSDB -> "8000";
            case TRINO -> "8080";
            case SQLITE3 -> "0";
            case GENERIC, OTHER -> "10000";
            case DM -> "5236";
            default -> "3306";
        };
    }
}
