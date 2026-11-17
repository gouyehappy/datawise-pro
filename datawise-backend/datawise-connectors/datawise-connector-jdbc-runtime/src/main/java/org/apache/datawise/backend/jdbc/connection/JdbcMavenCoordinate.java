package org.apache.datawise.backend.jdbc.connection;

import java.util.regex.Pattern;

/**
 * Parsed Maven coordinate used for JDBC driver download and local cache lookup.
 */
public record JdbcMavenCoordinate(String groupId, String artifactId, String version) {

    private static final Pattern SEGMENT = Pattern.compile("[A-Za-z0-9_.-]+");

    public static JdbcMavenCoordinate parse(String coordinates) {
        if (coordinates == null || coordinates.isBlank()) {
            throw new IllegalArgumentException("Invalid Maven coordinates, expected groupId:artifactId:version");
        }
        String[] parts = coordinates.trim().split(":");
        if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank() || parts[2].isBlank()) {
            throw new IllegalArgumentException("Invalid Maven coordinates, expected groupId:artifactId:version");
        }
        String groupId = requireSafeSegment(parts[0].trim(), "groupId");
        String artifactId = requireSafeSegment(parts[1].trim(), "artifactId");
        String version = requireSafeSegment(parts[2].trim(), "version");
        return new JdbcMavenCoordinate(groupId, artifactId, version);
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

    private static String requireSafeSegment(String segment, String fieldName) {
        if (segment.contains("..") || segment.contains("/") || segment.contains("\\")) {
            throw new IllegalArgumentException("Invalid Maven " + fieldName + ": path traversal rejected");
        }
        if (!SEGMENT.matcher(segment).matches()) {
            throw new IllegalArgumentException(
                    "Invalid Maven " + fieldName + ": only [A-Za-z0-9_.-] allowed"
            );
        }
        return segment;
    }
}
