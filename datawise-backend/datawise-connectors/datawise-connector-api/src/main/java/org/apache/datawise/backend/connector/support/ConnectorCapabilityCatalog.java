package org.apache.datawise.backend.connector.support;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/**
 * 合并连接器插件声明、运维 SPI 与产品策略，生成对外一致的能力集合。
 * <p>
 * 与前端 {@code shared/capabilities/db-type-capabilities.ts} 及 {@code /api/datasources} 对齐。
 */
public final class ConnectorCapabilityCatalog {

    private static final Set<String> ONLINE_DDL_TYPES = Set.of(
            "mysql",
            "mariadb",
            "postgresql",
            "kingbase",
            "greenplum",
            "opengauss",
            "gaussdb",
            "oracle",
            "sqlserver");

    private ConnectorCapabilityCatalog() {
    }

    /**
     * 基于连接上下文解析合并能力（Guard 与测试优先使用）。
     */
    public static EnumSet<ConnectorCapability> resolve(ConnectorFacade facade, ConnectionEntity entity) {
        if (facade == null || entity == null) {
            return EnumSet.noneOf(ConnectorCapability.class);
        }
        DataSourceConnector connector = facade.catalog().resolve(entity);
        return resolve(connector, entity.getDbType(), facade.ops().registry());
    }

    /**
     * 合并 connector 声明与 ops；{@code opsRegistry} 为 null 时跳过 SESSION_* / LOCK_* 合并。
     */
    public static EnumSet<ConnectorCapability> resolve(
                                                       DataSourceConnector connector,
                                                       String dbType,
                                                       DatabaseOpsRegistry opsRegistry) {
        EnumSet<ConnectorCapability> caps = EnumSet.copyOf(connector.capabilities());
        String normalized = normalizeDbType(dbType);

        if (opsRegistry != null) {
            if (opsRegistry.supportsActiveSession(normalized)) {
                caps.add(ConnectorCapability.SESSION_MONITOR);
            }
            if (opsRegistry.supportsSessionKill(normalized)) {
                caps.add(ConnectorCapability.SESSION_KILL);
            }
            if (opsRegistry.supportsLockWait(normalized)) {
                caps.add(ConnectorCapability.LOCK_MONITOR);
            }
        }

        if (ONLINE_DDL_TYPES.contains(normalized)) {
            caps.add(ConnectorCapability.ONLINE_DDL);
        }

        return caps;
    }

    private static String normalizeDbType(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return "";
        }
        return dbType.trim().toLowerCase(Locale.ROOT);
    }
}
