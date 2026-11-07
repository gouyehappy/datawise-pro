package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.jdbc.connection.JdbcMavenCoordinate;

import java.util.List;

/** Maven coordinates required for Apache Hive JDBC (HiveServer2 / beeline protocol). */
final class HiveJdbcDriverBundle {

    static final String DRIVER_CLASS = "org.apache.hive.jdbc.HiveDriver";

    private HiveJdbcDriverBundle() {
    }

    static boolean isHiveDriver(String driverClass) {
        return driverClass != null && DRIVER_CLASS.equals(driverClass.trim());
    }

    static boolean isHiveMavenArtifact(JdbcMavenCoordinate coordinate) {
        if (coordinate == null) {
            return false;
        }
        if ("org.apache.hive".equals(coordinate.groupId())
                && (coordinate.artifactId().startsWith("hive-jdbc")
                || coordinate.artifactId().startsWith("hive-service"))) {
            return true;
        }
        return isHiveDriverArtifact(coordinate);
    }

    static boolean isHiveDriverArtifact(JdbcMavenCoordinate coordinate) {
        return coordinate != null
                && "org.apache.hive".equals(coordinate.groupId())
                && coordinate.artifactId().startsWith("hive-");
    }

    static String installHint() {
        return "Apache Hive JDBC requires dependency JARs under config/drivers/hive/. "
                + "Run mvn package for datawise-connector-hive, or copy the standalone driver "
                + "hive-jdbc-*-standalone.jar from your Hive/beeline installation into config/drivers/.";
    }

    static List<String> coordinatesForVersion(String version) {
        String hiveVersion = version == null || version.isBlank() ? "3.1.2" : version.trim();
        return List.of(
                "org.apache.hive:hive-service-rpc:" + hiveVersion,
                "org.apache.hive:hive-common:" + hiveVersion,
                "org.apache.hive:hive-service:" + hiveVersion,
                "org.apache.hive:hive-serde:" + hiveVersion,
                "org.apache.hive:hive-shims:" + hiveVersion,
                "org.apache.hive:hive-jdbc:" + hiveVersion,
                "org.apache.thrift:libthrift:0.9.3",
                "org.apache.thrift:libfb303:0.9.3",
                "org.apache.hadoop:hadoop-common:3.2.0"
        );
    }
}
