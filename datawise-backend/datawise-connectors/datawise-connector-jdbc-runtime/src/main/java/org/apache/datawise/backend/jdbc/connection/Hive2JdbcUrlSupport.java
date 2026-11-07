package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Pattern;

/**
 * HiveServer2 JDBC URL helpers for Apache Hive.
 */
final class Hive2JdbcUrlSupport {

    private static final Pattern AUTH_PARAM = Pattern.compile("(?:[;?&]|^)auth=", Pattern.CASE_INSENSITIVE);

    private static final List<String> ADVANCED_URL_SESSION_KEYS = List.of(
            "auth",
            "ssl",
            "transportMode",
            "httpPath",
            "sslTrustStore",
            "trustStorePassword",
            "SSL",
            "SSLTrustStore",
            "SSLTrustStorePwd",
            "AuthMech"
    );

    private Hive2JdbcUrlSupport() {
    }

    static String buildUrl(ConnectionEntity entity, String host, int port) {
        String database = entity.getDatabaseName();
        if (database == null) {
            database = "";
        }
        String base = database.isBlank()
                ? "jdbc:hive2://" + host + ":" + port + "/"
                : "jdbc:hive2://" + host + ":" + port + "/" + database.trim();
        return finalizeUrl(entity, base);
    }

    static String finalizeUrl(ConnectionEntity entity, String jdbcUrl) {
        if (jdbcUrl == null || jdbcUrl.isBlank() || entity == null || !supports(entity.getDbType())) {
            return jdbcUrl;
        }
        String resolved = jdbcUrl.trim();
        if (!containsAuthParam(resolved)) {
            String auth = resolveHiveAuthMode(entity);
            if (auth != null && !auth.isBlank()) {
                resolved = appendSessionParam(resolved, "auth=" + auth.trim());
            }
        }
        return mergeAdvancedSessionParams(entity, resolved);
    }

    static boolean credentialsInUrl(ConnectionEntity entity, String jdbcUrl) {
        return false;
    }

    static boolean supports(String dbType) {
        return DbType.HIVE.matches(dbType);
    }

    private static String resolveHiveAuthMode(ConnectionEntity entity) {
        String fromAdvanced = readAdvancedProperty(entity.getAdvancedConfig(), "auth");
        if (fromAdvanced != null && !fromAdvanced.isBlank()) {
            return fromAdvanced.trim();
        }
        if (hasCredentials(entity)) {
            return "LDAP";
        }
        return null;
    }

    private static String mergeAdvancedSessionParams(ConnectionEntity entity, String jdbcUrl) {
        if (entity.getAdvancedConfig() == null || entity.getAdvancedConfig().isBlank()) {
            return jdbcUrl;
        }
        String resolved = jdbcUrl;
        for (String key : ADVANCED_URL_SESSION_KEYS) {
            String value = readAdvancedProperty(entity.getAdvancedConfig(), key);
            if (value == null || value.isBlank()) {
                continue;
            }
            if (containsSessionParam(resolved, key)) {
                continue;
            }
            resolved = appendSessionParam(resolved, key + "=" + value.trim());
        }
        return resolved;
    }

    private static boolean containsAuthParam(String jdbcUrl) {
        return AUTH_PARAM.matcher(jdbcUrl).find();
    }

    private static boolean containsSessionParam(String jdbcUrl, String key) {
        if (key == null || key.isBlank()) {
            return false;
        }
        return Pattern.compile("(?:[;?&]|^)" + Pattern.quote(key) + "=", Pattern.CASE_INSENSITIVE)
                .matcher(jdbcUrl)
                .find();
    }

    private static boolean hasCredentials(ConnectionEntity entity) {
        if (entity.getAuthType() != null && "NONE".equalsIgnoreCase(entity.getAuthType())) {
            return false;
        }
        return entity.getUsername() != null && !entity.getUsername().isBlank();
    }

    static String readAdvancedProperty(String advancedConfig, String key) {
        if (advancedConfig == null || advancedConfig.isBlank() || key == null || key.isBlank()) {
            return null;
        }
        String prefix = key.trim() + "=";
        for (String line : advancedConfig.split("\\R")) {
            if (line == null) {
                continue;
            }
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            if (trimmed.regionMatches(true, 0, prefix, 0, prefix.length())) {
                return trimmed.substring(prefix.length()).trim();
            }
        }
        return null;
    }

    private static String appendSessionParam(String jdbcUrl, String param) {
        if (jdbcUrl.contains(";")) {
            return jdbcUrl + ";" + param;
        }
        int queryStart = jdbcUrl.indexOf('?');
        if (queryStart >= 0) {
            return jdbcUrl.substring(0, queryStart) + ";" + param + jdbcUrl.substring(queryStart);
        }
        return jdbcUrl + ";" + param;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
