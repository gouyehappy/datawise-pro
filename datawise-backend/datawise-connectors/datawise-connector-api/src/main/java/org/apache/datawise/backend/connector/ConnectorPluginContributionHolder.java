package org.apache.datawise.backend.connector;

import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
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
import org.springframework.stereotype.Component;

import java.util.List;

/** 运行时由 {@code config/plugins} 注入的方言贡献，供 Registry 与 Schema 解析合并使用。 */
@Component
public class ConnectorPluginContributionHolder {

    private volatile ConnectorDialectContributions contributions = ConnectorDialectContributions.EMPTY;

    public void setContributions(ConnectorDialectContributions contributions) {
        this.contributions = contributions == null ? ConnectorDialectContributions.EMPTY : contributions;
    }

    public List<DialectDdlRenderer> ddlRenderers() {
        return contributions.ddlRenderers();
    }

    public List<LogicalTypeParser> logicalTypeParsers() {
        return contributions.logicalTypeParsers();
    }

    public List<SchemaDialect> schemaDialects() {
        return contributions.schemaDialects();
    }

    public List<TableMetadataIntrospection> tableIntrospectors() {
        return contributions.tableIntrospectors();
    }

    public List<DmlDialect> dmlDialects() {
        return contributions.dmlDialects();
    }

    public List<ActiveSessionOps> activeSessionOps() {
        return contributions.activeSessionOps();
    }

    public List<LockWaitOps> lockWaitOps() {
        return contributions.lockWaitOps();
    }

    public List<SessionKillOps> sessionKillOps() {
        return contributions.sessionKillOps();
    }

    public List<SqlPaginationDialect> sqlPaginationDialects() {
        return contributions.sqlPaginationDialects();
    }

    public List<JdbcSchemaExplorer> schemaExplorers() {
        return contributions.schemaExplorers();
    }
}
