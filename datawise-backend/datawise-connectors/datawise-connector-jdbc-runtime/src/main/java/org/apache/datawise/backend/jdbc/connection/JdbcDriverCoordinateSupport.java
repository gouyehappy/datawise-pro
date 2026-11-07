package org.apache.datawise.backend.jdbc.connection;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Parses and normalizes JDBC driver Maven coordinates from UI/API input.
 */
public final class JdbcDriverCoordinateSupport {

    private static final Map<String, String> GROUP_BY_ARTIFACT = Map.ofEntries(
            Map.entry("mysql-connector-java", "com.mysql"),
            Map.entry("mysql-connector-j", "com.mysql"),
            Map.entry("mariadb-java-client", "org.mariadb.jdbc"),
            Map.entry("postgresql", "org.postgresql"),
            Map.entry("ojdbc8", "com.oracle.database.jdbc"),
            Map.entry("ojdbc11", "com.oracle.database.jdbc"),
            Map.entry("mssql-jdbc", "com.microsoft.sqlserver"),
            Map.entry("clickhouse-jdbc", "com.clickhouse"),
            Map.entry("gbase-connector-java", "com.gbase"),
            Map.entry("kingbase8", "cn.com.kingbase"),
            Map.entry("x-pack-sql-jdbc", "org.elasticsearch.plugin"),
            Map.entry("kylin-jdbc", "org.apache.kylin"),
            Map.entry("oceanbase-client", "com.oceanbase"),
            Map.entry("opengauss-jdbc", "org.opengauss"),
            Map.entry("jedis", "redis.clients"),
            Map.entry("hive-jdbc", "org.apache.hive"),
            Map.entry("hive-jdbc-standalone", "org.apache.hive"),
            Map.entry("DmJdbcDriver18", "com.dameng")
    );
    private static final Map<String, Set<String>> COMPATIBLE_ARTIFACTS = Map.of(
            "mysql-connector-java", Set.of("mysql-connector-java", "mysql-connector-j"),
            "mysql-connector-j", Set.of("mysql-connector-java", "mysql-connector-j"),
            "hive-jdbc", Set.of("hive-jdbc", "hive-jdbc-standalone"),
            "hive-jdbc-standalone", Set.of("hive-jdbc", "hive-jdbc-standalone")
    );
    /**
     * Drivers that are typically absent from Maven Central. When the exact version is missing,
     * accept another local JAR with the same artifactId (e.g. GBase {@code 9.5.0.7-build1-bin}
     * when the catalog asks for {@code 9.5.0.10}).
     */
    private static final Set<String> LOCAL_VERSION_FLEXIBLE_ARTIFACTS = Set.of(
            "gbase-connector-java",
            "DmJdbcDriver18",
            "kingbase8",
            "oceanbase-client"
    );

    private JdbcDriverCoordinateSupport() {
    }

    public static boolean isMavenCoordinates(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String[] parts = value.trim().split(":");
        return parts.length == 3 && parts[0].contains(".") && !parts[2].isBlank();
    }

    /**
     * Accepts {@code groupId:artifactId:version} or legacy {@code artifact-version.jar} filename.
     */
    public static String normalizeDriverInput(String input) {
        if (input == null || input.isBlank()) {
            throw new IllegalArgumentException("Driver Maven coordinates are required");
        }
        String trimmed = input.trim();
        if (isMavenCoordinates(trimmed)) {
            return trimmed;
        }
        JdbcMavenCoordinate fromJar = tryParseJarFileName(trimmed);
        if (fromJar != null) {
            return fromJar.cacheKey();
        }
        throw new IllegalArgumentException(
                "Invalid Maven coordinates, expected groupId:artifactId:version "
                        + "(e.g. com.mysql:mysql-connector-j:8.4.0)"
        );
    }

    public static Set<String> compatibleArtifacts(String artifactId) {
        Set<String> compatible = COMPATIBLE_ARTIFACTS.get(artifactId);
        return compatible != null ? compatible : Set.of();
    }

    /** Whether any local version of this artifact may satisfy a different requested version. */
    public static boolean allowsLocalVersionFallback(String artifactId) {
        return artifactId != null && LOCAL_VERSION_FLEXIBLE_ARTIFACTS.contains(artifactId);
    }

    static JdbcMavenCoordinate tryParseJarFileName(String value) {
        String name = value.trim();
        if (!name.toLowerCase(Locale.ROOT).endsWith(".jar")) {
            return null;
        }
        name = name.substring(0, name.length() - 4);
        int splitAt = -1;
        for (int i = name.length() - 1; i >= 0; i--) {
            if (name.charAt(i) == '-' && i + 1 < name.length() && Character.isDigit(name.charAt(i + 1))) {
                splitAt = i;
                break;
            }
        }
        if (splitAt <= 0) {
            return null;
        }
        String artifactId = name.substring(0, splitAt);
        String version = name.substring(splitAt + 1);
        String groupId = GROUP_BY_ARTIFACT.get(artifactId);
        if (groupId == null || version.isBlank()) {
            return null;
        }
        return new JdbcMavenCoordinate(groupId, artifactId, version);
    }
}
