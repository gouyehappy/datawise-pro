package org.apache.datawise.backend.connector.support;

import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.EnumSet;

/**
 * Service 层能力校验。会话/锁等运维能力须读 {@link ConnectorCapabilityCatalog} 合并结果，
 * 勿直接用 {@code connector.capabilities()} 判断 {@code SESSION_*} / {@code LOCK_*}。
 */
public final class ConnectorCapabilityGuard {

    private ConnectorCapabilityGuard() {
    }

    public static void requireSqlExecute(ConnectorFacade facade, ConnectionEntity entity) {
        require(facade, entity, ConnectorCapability.SQL_EXECUTE, true, "SQL execution");
    }

    public static void requireSqlExplain(ConnectorFacade facade, ConnectionEntity entity) {
        require(facade, entity, ConnectorCapability.SQL_EXPLAIN, true, "EXPLAIN");
    }

    public static boolean hasSqlExplain(ConnectorFacade facade, ConnectionEntity entity) {
        return capabilities(facade, entity).contains(ConnectorCapability.SQL_EXPLAIN);
    }

    /** 合并 catalog 能力；含 {@link ConnectorCapability#SESSION_MONITOR} 时 ops 已注册。 */
    public static boolean hasSessionMonitor(ConnectorFacade facade, ConnectionEntity entity) {
        return capabilities(facade, entity).contains(ConnectorCapability.SESSION_MONITOR);
    }

    public static boolean hasSessionKill(ConnectorFacade facade, ConnectionEntity entity) {
        return capabilities(facade, entity).contains(ConnectorCapability.SESSION_KILL);
    }

    public static boolean hasLockMonitor(ConnectorFacade facade, ConnectionEntity entity) {
        return capabilities(facade, entity).contains(ConnectorCapability.LOCK_MONITOR);
    }

    public static void requireTableData(ConnectorFacade facade, ConnectionEntity entity) {
        if (hasTableData(facade, entity)) {
            return;
        }
        String dbType = describeDbType(entity);
        throw new TableDataException(
                "Table data browsing is not supported for datasource type: " + dbType,
                TableDataException.FETCH_FAILED);
    }

    public static void requireDml(ConnectorFacade facade, ConnectionEntity entity) {
        if (hasDml(facade, entity)) {
            return;
        }
        String dbType = describeDbType(entity);
        throw new TableDataException(
                "Table row mutations are not supported for datasource type: " + dbType,
                TableDataException.MUTATION_FAILED);
    }

    public static boolean hasDocumentRead(ConnectorFacade facade, ConnectionEntity entity) {
        return capabilities(facade, entity).contains(ConnectorCapability.DOCUMENT_READ);
    }

    public static boolean hasDml(ConnectorFacade facade, ConnectionEntity entity) {
        return capabilities(facade, entity).contains(ConnectorCapability.DML);
    }

    public static boolean hasTableData(ConnectorFacade facade, ConnectionEntity entity) {
        EnumSet<ConnectorCapability> capabilities = capabilities(facade, entity);
        return capabilities.contains(ConnectorCapability.SQL_EXECUTE)
                || capabilities.contains(ConnectorCapability.DOCUMENT_READ);
    }

    public static boolean hasDocumentRead(DataSourceConnector connector) {
        return connector != null
                && connector.capabilities().contains(ConnectorCapability.DOCUMENT_READ);
    }

    private static EnumSet<ConnectorCapability> capabilities(ConnectorFacade facade, ConnectionEntity entity) {
        return ConnectorCapabilityCatalog.resolve(facade, entity);
    }

    private static void require(
                                ConnectorFacade facade,
                                ConnectionEntity entity,
                                ConnectorCapability capability,
                                boolean sqlConsole,
                                String actionLabel) {
        if (capabilities(facade, entity).contains(capability)) {
            return;
        }
        String dbType = describeDbType(entity);
        String message = actionLabel + " is not supported for datasource type: " + dbType;
        if (sqlConsole) {
            throw new SqlExecutionException(message, null, null);
        }
        throw new TableDataException(message, TableDataException.FETCH_FAILED);
    }

    private static String describeDbType(ConnectionEntity entity) {
        return entity != null && entity.getDbType() != null ? entity.getDbType() : "unknown";
    }
}
