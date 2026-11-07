package org.apache.datawise.backend.connector.facade.ops;

import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.ops.spi.SessionKillOps;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** 运维 SQL 能力入口；database 层经 {@link org.apache.datawise.backend.connector.facade.ConnectorFacade} 访问。 */
@Component
public class ConnectorOpsAccess {

    private final DatabaseOpsRegistry registry;

    public ConnectorOpsAccess(DatabaseOpsRegistry registry) {
        this.registry = registry;
    }

    public boolean supportsActiveSession(String dbType) {
        return registry.supportsActiveSession(dbType);
    }

    public boolean supportsLockWait(String dbType) {
        return registry.supportsLockWait(dbType);
    }

    public boolean supportsSessionKill(String dbType) {
        return registry.supportsSessionKill(dbType);
    }

    public String activeSessionUnsupportedMessage(String dbType) {
        return registry.activeSessionUnsupportedMessage(dbType);
    }

    public String lockWaitUnsupportedMessage(String dbType) {
        return registry.lockWaitUnsupportedMessage(dbType);
    }

    public String sessionKillUnsupportedMessage(String dbType) {
        return registry.sessionKillUnsupportedMessage(dbType);
    }

    public Optional<ActiveSessionOps> findActiveSession(String dbType) {
        return registry.findActiveSession(dbType);
    }

    public Optional<LockWaitOps> findLockWait(String dbType) {
        return registry.findLockWait(dbType);
    }

    public Optional<SessionKillOps> findSessionKill(String dbType) {
        return registry.findSessionKill(dbType);
    }

    /**
     * 供 {@link org.apache.datawise.backend.connector.support.ConnectorCapabilityCatalog} 合并运维能力；
     * 业务代码请使用本类查询方法或 {@link org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard}。
     */
    public DatabaseOpsRegistry registry() {
        return registry;
    }
}
