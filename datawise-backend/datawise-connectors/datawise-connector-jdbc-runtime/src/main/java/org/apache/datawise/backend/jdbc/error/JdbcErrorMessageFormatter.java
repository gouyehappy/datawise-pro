package org.apache.datawise.backend.jdbc.error;

import org.apache.datawise.backend.jdbc.ssh.SshTunnelException;
import org.apache.datawise.backend.model.ConnectionEntity;

/** JDBC 异常用户可读消息格式化。 */
public final class JdbcErrorMessageFormatter {

    private JdbcErrorMessageFormatter() {
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        String message = JdbcErrorClassifier.classificationMessage(error);
        if (message == null || message.isBlank()) {
            return "Connection failed";
        }
        String lower = message.toLowerCase();

        if (JdbcErrorClassifier.isPoolAcquireTimeout(lower)) {
            return formatPoolAcquireTimeout(entity, message);
        }

        if (JdbcErrorClassifier.isPostgresqlIoFailure(lower)) {
            return formatPostgresqlIoFailure(entity, message);
        }

        if (JdbcErrorClassifier.isTransientConnectionFailure(lower)) {
            return formatTransientConnectionFailure(entity, message);
        }

        if (lower.contains("communications link failure")
                || lower.contains("connection refused")
                || lower.contains("connect timed out")
                || lower.contains("unknown host")
                || lower.contains("network is unreachable")) {
            return formatNetworkFailure(entity, message);
        }

        if (lower.contains("driverclass is required")
                || lower.contains("jdbc driver maven coordinates are required")) {
            return "JDBC driver is not configured. "
                    + "Set Maven coordinates and driver class in connection settings, then download the driver.";
        }

        if (JdbcErrorClassifier.isLocalLoadFailure(lower)) {
            return "JDBC driver failed to load from local cache (config/drivers/). "
                    + "The jar may exist on disk but could not be loaded — restart the backend or check connection settings. "
                    + "Details: " + message;
        }

        if (lower.contains("no suitable driver")) {
            return "JDBC driver is missing or not loaded. "
                    + "Open connection settings, set Maven coordinates (groupId:artifactId:version) "
                    + "and download the driver from Maven Central.";
        }

        if (lower.contains("failed to download jdbc driver")
                || lower.contains("failed to download driver from maven")
                || lower.contains("failed to download driver")) {
            return "Failed to download JDBC driver from Maven repositories. "
                    + "Check network access, configure datawise.jdbc.maven.repositories "
                    + "(e.g. Aliyun mirror), or place the JAR under config/drivers/. "
                    + "Details: " + message;
        }

        if (lower.contains("connection reset") && entity != null
                && "hive".equalsIgnoreCase(entity.getDbType())) {
            String target = describeTarget(entity);
            return "HiveServer2 closed the connection during the JDBC handshake"
                    + (target.isBlank() ? "" : " (" + target + ")")
                    + ". Check auth=LDAP or Kerberos settings and TLS (ssl=true) in advanced config. "
                    + "Details: " + message;
        }

        return message;
    }

    private static String formatPostgresqlIoFailure(ConnectionEntity entity, String rawMessage) {
        String target = describeTarget(entity);
        return "PostgreSQL connection dropped while switching schema"
                + (target.isBlank() ? "" : " (" + target + ")")
                + ". The server may have closed an idle connection, or the network was interrupted. "
                + "Retry the operation; if it persists, check PostgreSQL service, firewall/VPN, and pooler (PgBouncer) settings. "
                + "Details: " + rawMessage;
    }

    private static String formatTransientConnectionFailure(ConnectionEntity entity, String rawMessage) {
        String target = describeTarget(entity);
        return "Database connection was lost"
                + (target.isBlank() ? "" : " (" + target + ")")
                + ". Retry the operation; if it persists, check network stability and database availability. "
                + "Details: " + rawMessage;
    }

    private static String formatPoolAcquireTimeout(ConnectionEntity entity, String rawMessage) {
        String target = describeTarget(entity);
        return "Database connection timed out after 10s"
                + (target.isBlank() ? "" : " (" + target + ")")
                + ". Check host/port, credentials, firewall/VPN, and that the database service is running. "
                + "Details: " + rawMessage;
    }

    private static String formatNetworkFailure(ConnectionEntity entity, String rawMessage) {
        String target = describeTarget(entity);
        return "Cannot reach database"
                + (target.isBlank() ? "" : " at " + target)
                + ". Check network, firewall, and that the service is listening. "
                + "Details: " + rawMessage;
    }

    private static String describeTarget(ConnectionEntity entity) {
        if (entity == null) {
            return "";
        }
        String name = entity.getName();
        String host = entity.getHost();
        String port = entity.getPort();
        String dbType = entity.getDbType();
        if (host != null && !host.isBlank()) {
            String endpoint = port != null && !port.isBlank() ? host + ":" + port : host;
            if (name != null && !name.isBlank()) {
                return name + " @ " + endpoint + (dbType != null ? " (" + dbType + ")" : "");
            }
            return endpoint + (dbType != null ? " (" + dbType + ")" : "");
        }
        if (entity.getJdbcUrl() != null && !entity.getJdbcUrl().isBlank()) {
            return entity.getJdbcUrl();
        }
        if (name != null && !name.isBlank()) {
            return name;
        }
        return entity.getId() != null ? entity.getId() : "";
    }

    private static SshTunnelException findSshTunnelException(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof SshTunnelException sshEx) {
                return sshEx;
            }
            current = current.getCause();
        }
        return null;
    }
}
