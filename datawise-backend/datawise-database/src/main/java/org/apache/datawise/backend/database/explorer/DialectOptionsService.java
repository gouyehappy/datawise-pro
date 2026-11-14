package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.ddl.DialectOptionsSupport;
import org.apache.datawise.backend.domain.DataTypeOptionsResult;
import org.apache.datawise.backend.domain.EngineOptionsResult;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

/** MetaForge B1：连接级引擎 / 数据类型选项。 */
@Service
public class DialectOptionsService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public DialectOptionsService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public EngineOptionsResult listEngines(String connectionId) {
        ConnectionEntity entity = requireSqlConnection(connectionId);
        if (!DialectOptionsSupport.supportsLiveEngines(entity.getDbType())) {
            return new EngineOptionsResult(false, List.of());
        }
        try {
            return connectorFacade.jdbc().withConnection(entity, null, connection ->
                    new EngineOptionsResult(true, loadMysqlEngines(connection))
            );
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(entity, ex);
        }
    }

    public DataTypeOptionsResult listDataTypes(String connectionId) {
        ConnectionEntity entity = requireSqlConnection(connectionId);
        boolean supported = DialectOptionsSupport.supportsDataTypeCatalog(entity.getDbType());
        if (!supported) {
            return new DataTypeOptionsResult(false, List.of());
        }
        return new DataTypeOptionsResult(true, DialectOptionsSupport.listDataTypes(entity.getDbType()));
    }

    private ConnectionEntity requireSqlConnection(String connectionId) {
        ConnectionExecutionContext.ResolvedConnection resolved =
                connectionContext.requireAvailableConnectionForCurrentUser(
                        connectionId,
                        "Connection not found: " + connectionId
                );
        ConnectorCapabilityGuard.requireSqlExecute(connectorFacade, resolved.entity());
        return resolved.entity();
    }

    private static List<EngineOptionsResult.EngineOption> loadMysqlEngines(Connection connection)
            throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW ENGINES")) {
            return DialectOptionsSupport.parseMysqlEngines(rs);
        }
    }
}
