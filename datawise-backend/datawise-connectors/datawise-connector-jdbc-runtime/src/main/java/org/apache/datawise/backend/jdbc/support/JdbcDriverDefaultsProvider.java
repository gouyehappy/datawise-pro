package org.apache.datawise.backend.jdbc.support;

import java.util.Collection;
import java.util.Optional;

/**
 * 按 dbType 提供默认 JDBC 驱动 Maven 坐标（由 catalog 模块实现）。
 */
public interface JdbcDriverDefaultsProvider {

    Optional<DriverDefaults> defaultsFor(String dbType);

    /** seed 与 catalog 中声明的全部默认驱动（去重）。 */
    Collection<DriverDefaults> allDefaults();

    record DriverDefaults(String mavenCoordinates, String driverClass) {
    }
}
