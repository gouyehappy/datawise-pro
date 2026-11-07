package org.apache.datawise.backend.mongodb;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.concurrent.TimeUnit;

/** Creates MongoDB clients from {@link ConnectionEntity}. */
public final class MongoClientFactory {

    private MongoClientFactory() {
    }

    public static MongoClient open(ConnectionEntity entity) {
        String connectionString = resolveConnectionString(entity);
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString(connectionString))
                .applyToSocketSettings(builder -> builder.connectTimeout(5, TimeUnit.SECONDS))
                .applyToClusterSettings(builder -> builder.serverSelectionTimeout(5, TimeUnit.SECONDS))
                .build();
        return MongoClients.create(settings);
    }

    static String resolveConnectionString(ConnectionEntity entity) {
        String configured = trimToNull(entity.getJdbcUrl());
        if (configured != null) {
            String normalized = normalizeConnectionString(configured);
            if (hasEmbeddedCredentials(normalized)) {
                return normalized;
            }
        }
        return buildConnectionString(entity);
    }

    static String buildConnectionString(ConnectionEntity entity) {
        String host = firstNonBlank(entity.getHost(), "localhost");
        int port = parsePort(entity.getPort());
        String database = entity.getDatabaseName();
        String username = entity.getUsername();
        String password = entity.getPassword();

        StringBuilder sb = new StringBuilder("mongodb://");
        if (authRequired(entity) && username != null && !username.isBlank() && password != null) {
            sb.append(urlEncode(username)).append(':').append(urlEncode(password)).append('@');
        }
        sb.append(host).append(':').append(port);
        if (database != null && !database.isBlank()) {
            sb.append('/').append(database.trim());
        }
        String authSource = resolveAuthSource(entity, database);
        if (authSource != null) {
            sb.append(hasQueryPrefix(sb) ? '&' : '?').append("authSource=").append(urlEncode(authSource));
        }
        return sb.toString();
    }

    static boolean hasEmbeddedCredentials(String url) {
        int schemeEnd = url.indexOf("://");
        if (schemeEnd < 0) {
            return false;
        }
        String afterScheme = url.substring(schemeEnd + 3);
        int at = afterScheme.indexOf('@');
        if (at <= 0) {
            return false;
        }
        int slash = afterScheme.indexOf('/');
        int question = afterScheme.indexOf('?');
        return (slash < 0 || at < slash) && (question < 0 || at < question);
    }

    private static boolean authRequired(ConnectionEntity entity) {
        String auth = entity.getAuthType();
        return auth == null || auth.isBlank() || !"NONE".equalsIgnoreCase(auth);
    }

    private static boolean hasQueryPrefix(StringBuilder sb) {
        return sb.indexOf("?") >= 0;
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    static String normalizeConnectionString(String value) {
        if (value.startsWith("jdbc:mongodb://")) {
            return "mongodb://" + value.substring("jdbc:mongodb://".length());
        }
        if (value.startsWith("mongodb://") || value.startsWith("mongodb+srv://")) {
            return value;
        }
        return "mongodb://" + value;
    }

    private static String resolveAuthSource(ConnectionEntity entity, String database) {
        String fromAdvanced = readAdvancedProperty(entity.getAdvancedConfig(), "authSource");
        if (fromAdvanced != null && !fromAdvanced.isBlank()) {
            return fromAdvanced.trim();
        }
        if (entity.getUsername() != null && !entity.getUsername().isBlank()) {
            if (database != null && !database.isBlank()) {
                return database.trim();
            }
            return "admin";
        }
        return null;
    }

    static String readAdvancedProperty(String advancedConfig, String key) {
        if (advancedConfig == null || advancedConfig.isBlank() || key == null || key.isBlank()) {
            return null;
        }
        String prefix = key + "=";
        for (String line : advancedConfig.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.startsWith(prefix)) {
                return trimmed.substring(prefix.length()).trim();
            }
        }
        return null;
    }

    static int parsePort(String port) {
        if (port == null || port.isBlank()) {
            return 27017;
        }
        try {
            return Integer.parseInt(port.trim());
        } catch (NumberFormatException ex) {
            return 27017;
        }
    }

    private static String urlEncode(String value) {
        return value.replace("%", "%25")
                .replace(":", "%3A")
                .replace("@", "%40")
                .replace("/", "%2F");
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
