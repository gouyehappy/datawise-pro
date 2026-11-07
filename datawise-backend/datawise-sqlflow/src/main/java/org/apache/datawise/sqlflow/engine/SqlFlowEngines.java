package org.apache.datawise.sqlflow.engine;

import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.ServiceLoader;

/**
 * Discovers {@link SqlFlowLineageEngine} implementations.
 * Order: built-in AST → ServiceLoader providers → GSP bridge → unavailable stub.
 */
public final class SqlFlowEngines {

    private SqlFlowEngines() {
    }

    public static SqlFlowLineageEngine defaultEngine() {
        return selectFirstAvailable(discoverEngines())
                .orElse(UnavailableSqlFlowLineageEngine.INSTANCE);
    }

    public static SqlFlowLineageEngine astEngine() {
        return new AstSqlFlowLineageEngine();
    }

    public static SqlFlowLineageEngine gspEngine() {
        return new org.apache.datawise.sqlflow.engine.gsp.GspSqlFlowLineageEngine();
    }

    public static List<SqlFlowLineageEngine> discoverEngines() {
        List<SqlFlowLineageEngine> engines = new ArrayList<>();
        engines.add(astEngine());
        ServiceLoader.load(SqlFlowLineageEngine.class).forEach(engines::add);
        engines.add(gspEngine());
        engines.add(UnavailableSqlFlowLineageEngine.INSTANCE);
        return List.copyOf(engines);
    }

    private static Optional<SqlFlowLineageEngine> selectFirstAvailable(List<SqlFlowLineageEngine> engines) {
        for (SqlFlowLineageEngine engine : engines) {
            if (engine.isAvailable()) {
                return Optional.of(engine);
            }
        }
        return Optional.empty();
    }

}
