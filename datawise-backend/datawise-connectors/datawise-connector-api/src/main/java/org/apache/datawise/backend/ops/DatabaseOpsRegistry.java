package org.apache.datawise.backend.ops;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.ops.spi.SessionKillOps;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/** 按 dbType 解析运维 SQL SPI（活跃会话 / 锁等待 / 会话终止）。 */
@Component
public class DatabaseOpsRegistry {

    private final List<ActiveSessionOps> classpathActiveSessionOps;
    private final List<LockWaitOps> classpathLockWaitOps;
    private final List<SessionKillOps> classpathSessionKillOps;
    private final ConnectorPluginContributionHolder contributionHolder;

    public DatabaseOpsRegistry(
                               List<ActiveSessionOps> classpathActiveSessionOps,
                               List<LockWaitOps> classpathLockWaitOps,
                               List<SessionKillOps> classpathSessionKillOps,
                               ConnectorPluginContributionHolder contributionHolder) {
        this.classpathActiveSessionOps = classpathActiveSessionOps == null ? List.of() : List.copyOf(classpathActiveSessionOps);
        this.classpathLockWaitOps = classpathLockWaitOps == null ? List.of() : List.copyOf(classpathLockWaitOps);
        this.classpathSessionKillOps = classpathSessionKillOps == null ? List.of() : List.copyOf(classpathSessionKillOps);
        this.contributionHolder = contributionHolder;
    }

    public boolean supportsActiveSession(String dbType) {
        return findActiveSession(dbType).isPresent();
    }

    public boolean supportsLockWait(String dbType) {
        return findLockWait(dbType).isPresent();
    }

    public boolean supportsSessionKill(String dbType) {
        return findSessionKill(dbType).isPresent();
    }

    public String activeSessionUnsupportedMessage(String dbType) {
        return "Active session list is not supported for db type: " + DbType.normalizeId(dbType);
    }

    public String lockWaitUnsupportedMessage(String dbType) {
        return "Lock wait list is not supported for db type: " + DbType.normalizeId(dbType);
    }

    public String sessionKillUnsupportedMessage(String dbType) {
        return "Session kill is not supported for db type: " + DbType.normalizeId(dbType);
    }

    public Optional<ActiveSessionOps> findActiveSession(String dbType) {
        return resolve(allActiveSessionOps(), dbType);
    }

    public Optional<LockWaitOps> findLockWait(String dbType) {
        return resolve(allLockWaitOps(), dbType);
    }

    public Optional<SessionKillOps> findSessionKill(String dbType) {
        return resolve(allSessionKillOps(), dbType);
    }

    private List<ActiveSessionOps> allActiveSessionOps() {
        return merge(classpathActiveSessionOps, contributionHolder.activeSessionOps());
    }

    private List<LockWaitOps> allLockWaitOps() {
        return merge(classpathLockWaitOps, contributionHolder.lockWaitOps());
    }

    private List<SessionKillOps> allSessionKillOps() {
        return merge(classpathSessionKillOps, contributionHolder.sessionKillOps());
    }

    private static <T> List<T> merge(List<T> classpath, List<T> plugin) {
        if (plugin.isEmpty()) {
            return classpath;
        }
        List<T> merged = new ArrayList<>(classpath);
        merged.addAll(plugin);
        return merged;
    }

    private static <T> Optional<T> resolve(List<T> ops, String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return ops.stream()
                .filter(op -> supports(op, normalized))
                .min(Comparator.comparingInt(DatabaseOpsRegistry::priority));
    }

    private static boolean supports(Object op, String dbType) {
        if (op instanceof ActiveSessionOps activeSessionOps) {
            return activeSessionOps.supports(dbType);
        }
        if (op instanceof LockWaitOps lockWaitOps) {
            return lockWaitOps.supports(dbType);
        }
        if (op instanceof SessionKillOps sessionKillOps) {
            return sessionKillOps.supports(dbType);
        }
        return false;
    }

    private static int priority(Object op) {
        if (op instanceof ActiveSessionOps activeSessionOps) {
            return activeSessionOps.priority();
        }
        if (op instanceof LockWaitOps lockWaitOps) {
            return lockWaitOps.priority();
        }
        if (op instanceof SessionKillOps sessionKillOps) {
            return sessionKillOps.priority();
        }
        return 100;
    }
}
