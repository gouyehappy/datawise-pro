package org.apache.datawise.backend.connector.mysql;

import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.MysqlDataSourceConnector;
import org.apache.datawise.backend.connector.mysql.ddl.MysqlDdlRenderer;
import org.apache.datawise.backend.connector.mysql.dml.MysqlFamilyDmlDialect;
import org.apache.datawise.backend.connector.mysql.ops.MysqlFamilyLockWaitOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlProtocolActiveSessionOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlProtocolSessionKillOps;
import org.apache.datawise.backend.connector.mysql.schema.MysqlSchemaDialect;
import org.apache.datawise.backend.connector.mysql.support.MysqlTableIntrospector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;

public final class MysqlDataSourceConnectorProvider implements DataSourceConnectorProvider {

    @Override
    public DataSourceConnector create(ConnectorPluginContext context) {
        return new MysqlDataSourceConnector(context.jdbc());
    }

    @Override
    public ConnectorDialectContributions dialectContributions() {
        return ConnectorDialectContributions.builder()
                .addDdlRenderer(new MysqlDdlRenderer())
                .addSchemaDialect(new MysqlSchemaDialect())
                .addTableIntrospector(new MysqlTableIntrospector())
                .addDmlDialect(new MysqlFamilyDmlDialect())
                .addActiveSessionOps(new MysqlProtocolActiveSessionOps())
                .addLockWaitOps(new MysqlFamilyLockWaitOps())
                .addSessionKillOps(new MysqlProtocolSessionKillOps())
                .build();
    }
}
