package org.apache.datawise.sqlflow.dialect;

import java.util.Optional;

/**
 * Contribute dbType → dialect mappings from connector plugins or custom modules.
 * Lower {@link #order()} values are consulted first.
 */
public interface SqlFlowDialectContributor {

    default int order() {
        return 100;
    }

    Optional<SqlFlowDialect> resolve(String dbTypeId);
}
