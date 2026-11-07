package org.apache.datawise.backend.connector.spi;

import org.apache.datawise.backend.ddl.spi.DialectDdlRenderer;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.ops.spi.SessionKillOps;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;

import java.util.ArrayList;
import java.util.List;

/** 连接器插件向宿主注册的方言能力（DDL、DML、运维 SQL、类型解析、Schema、表元数据、分页）。 */
public record ConnectorDialectContributions(
        List<DialectDdlRenderer> ddlRenderers,
        List<LogicalTypeParser> logicalTypeParsers,
        List<SchemaDialect> schemaDialects,
        List<TableMetadataIntrospection> tableIntrospectors,
        List<DmlDialect> dmlDialects,
        List<ActiveSessionOps> activeSessionOps,
        List<LockWaitOps> lockWaitOps,
        List<SessionKillOps> sessionKillOps,
        List<SqlPaginationDialect> sqlPaginationDialects,
        List<JdbcSchemaExplorer> schemaExplorers) {

    public static final ConnectorDialectContributions EMPTY = new ConnectorDialectContributions(
            List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {

        private final List<DialectDdlRenderer> ddlRenderers = new ArrayList<>();
        private final List<LogicalTypeParser> logicalTypeParsers = new ArrayList<>();
        private final List<SchemaDialect> schemaDialects = new ArrayList<>();
        private final List<TableMetadataIntrospection> tableIntrospectors = new ArrayList<>();
        private final List<DmlDialect> dmlDialects = new ArrayList<>();
        private final List<ActiveSessionOps> activeSessionOps = new ArrayList<>();
        private final List<LockWaitOps> lockWaitOps = new ArrayList<>();
        private final List<SessionKillOps> sessionKillOps = new ArrayList<>();
        private final List<SqlPaginationDialect> sqlPaginationDialects = new ArrayList<>();
        private final List<JdbcSchemaExplorer> schemaExplorers = new ArrayList<>();

        public Builder addDdlRenderer(DialectDdlRenderer renderer) {
            if (renderer != null) {
                ddlRenderers.add(renderer);
            }
            return this;
        }

        public Builder addLogicalTypeParser(LogicalTypeParser parser) {
            if (parser != null) {
                logicalTypeParsers.add(parser);
            }
            return this;
        }

        public Builder addSchemaDialect(SchemaDialect dialect) {
            if (dialect != null) {
                schemaDialects.add(dialect);
            }
            return this;
        }

        public Builder addTableIntrospector(TableMetadataIntrospection introspector) {
            if (introspector != null) {
                tableIntrospectors.add(introspector);
            }
            return this;
        }

        public Builder addDmlDialect(DmlDialect dialect) {
            if (dialect != null) {
                dmlDialects.add(dialect);
            }
            return this;
        }

        public Builder addActiveSessionOps(ActiveSessionOps ops) {
            if (ops != null) {
                activeSessionOps.add(ops);
            }
            return this;
        }

        public Builder addLockWaitOps(LockWaitOps ops) {
            if (ops != null) {
                lockWaitOps.add(ops);
            }
            return this;
        }

        public Builder addSessionKillOps(SessionKillOps ops) {
            if (ops != null) {
                sessionKillOps.add(ops);
            }
            return this;
        }

        public Builder addSqlPaginationDialect(SqlPaginationDialect dialect) {
            if (dialect != null) {
                sqlPaginationDialects.add(dialect);
            }
            return this;
        }

        public Builder addSchemaExplorer(JdbcSchemaExplorer explorer) {
            if (explorer != null) {
                schemaExplorers.add(explorer);
            }
            return this;
        }

        public ConnectorDialectContributions build() {
            return new ConnectorDialectContributions(
                    List.copyOf(ddlRenderers),
                    List.copyOf(logicalTypeParsers),
                    List.copyOf(schemaDialects),
                    List.copyOf(tableIntrospectors),
                    List.copyOf(dmlDialects),
                    List.copyOf(activeSessionOps),
                    List.copyOf(lockWaitOps),
                    List.copyOf(sessionKillOps),
                    List.copyOf(sqlPaginationDialects),
                    List.copyOf(schemaExplorers));
        }
    }

    public ConnectorDialectContributions merge(ConnectorDialectContributions other) {
        if (other == null || other == EMPTY) {
            return this;
        }
        return new ConnectorDialectContributions(
                mergeList(ddlRenderers, other.ddlRenderers),
                mergeList(logicalTypeParsers, other.logicalTypeParsers),
                mergeList(schemaDialects, other.schemaDialects),
                mergeList(tableIntrospectors, other.tableIntrospectors),
                mergeList(dmlDialects, other.dmlDialects),
                mergeList(activeSessionOps, other.activeSessionOps),
                mergeList(lockWaitOps, other.lockWaitOps),
                mergeList(sessionKillOps, other.sessionKillOps),
                mergeList(sqlPaginationDialects, other.sqlPaginationDialects),
                mergeList(schemaExplorers, other.schemaExplorers));
    }

    private static <T> List<T> mergeList(List<T> left, List<T> right) {
        List<T> merged = new ArrayList<>(left);
        merged.addAll(right);
        return List.copyOf(merged);
    }
}
