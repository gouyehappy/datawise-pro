package org.apache.datawise.backend.jdbc.connection;

/**
 * Parsed Maven coordinate used for JDBC driver download and local cache lookup.
 */
public record JdbcMavenCoordinate(String groupId, String artifactId, String version) {

    public static JdbcMavenCoordinate parse(String coordinates) {
        String[] parts = coordinates.trim().split(":");
        if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank() || parts[2].isBlank()) {
            throw new IllegalArgumentException("Invalid Maven coordinates, expected groupId:artifactId:version");
        }
        return new JdbcMavenCoordinate(parts[0].trim(), parts[1].trim(), parts[2].trim());
    }

    public static JdbcMavenCoordinate parseFlexible(String input) {
        return parse(JdbcDriverCoordinateSupport.normalizeDriverInput(input));
    }

    /** Local cache file name under {@code config/drivers/}. */
    public String fileName() {
        return artifactId + "-" + version + ".jar";
    }

    public String cacheKey() {
        return groupId + ":" + artifactId + ":" + version;
    }

    /** Relative Maven Central repository path. */
    public String repositoryPath() {
        String groupPath = groupId.replace('.', '/');
        return groupPath + "/" + artifactId + "/" + version + "/" + fileName();
    }
}
