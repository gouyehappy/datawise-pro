package org.apache.datawise.sqlflow;

import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;
import org.apache.datawise.sqlflow.dialect.DefaultSqlFlowDialectRegistry;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialectContributor;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialectRegistry;
import org.apache.datawise.sqlflow.engine.SqlFlowEngines;
import org.apache.datawise.sqlflow.spi.SqlFlowSqlPreprocessor;

import java.util.ArrayList;
import java.util.List;
import java.util.ServiceLoader;

/** Builds a configured {@link SqlFlowLineageService}. */
public final class SqlFlowLineageServices {

    private SqlFlowLineageServices() {
    }

    public static SqlFlowLineageService createDefault() {
        return builder().build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private SqlFlowDialectRegistry dialectRegistry = DefaultSqlFlowDialectRegistry.withDefaults();
        private SqlFlowLineageEngine engine = SqlFlowEngines.defaultEngine();
        private final List<SqlFlowDialectContributor> dialectContributors = new ArrayList<>();
        private final List<SqlFlowSqlPreprocessor> preprocessors = new ArrayList<>();

        public Builder dialectRegistry(SqlFlowDialectRegistry dialectRegistry) {
            this.dialectRegistry = dialectRegistry;
            return this;
        }

        public Builder engine(SqlFlowLineageEngine engine) {
            this.engine = engine;
            return this;
        }

        public Builder addDialectContributor(SqlFlowDialectContributor contributor) {
            if (contributor != null) {
                dialectContributors.add(contributor);
            }
            return this;
        }

        public Builder loadDialectContributorsFromServiceLoader() {
            ServiceLoader.load(SqlFlowDialectContributor.class).forEach(dialectContributors::add);
            return this;
        }

        public Builder addPreprocessor(SqlFlowSqlPreprocessor preprocessor) {
            if (preprocessor != null) {
                preprocessors.add(preprocessor);
            }
            return this;
        }

        public Builder loadPreprocessorsFromServiceLoader() {
            ServiceLoader.load(SqlFlowSqlPreprocessor.class).forEach(preprocessors::add);
            return this;
        }

        public SqlFlowLineageService build() {
            SqlFlowDialectRegistry effectiveRegistry = dialectRegistry;
            if (!dialectContributors.isEmpty()) {
                effectiveRegistry = new DefaultSqlFlowDialectRegistry(List.copyOf(dialectContributors));
            }
            return new SqlFlowLineageService(effectiveRegistry, engine, List.copyOf(preprocessors));
        }
    }
}
