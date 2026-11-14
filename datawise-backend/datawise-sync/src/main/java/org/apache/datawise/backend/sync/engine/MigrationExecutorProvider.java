package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.List;

/**
 * MetaForge B3：迁移执行器 SPI（借骨架，不换调度内核）。
 * <p>默认实现为内置 JDBC 批处理（{@link TableMigrationExecutor}）；后续可挂 SeaTunnel / Flink 等，
 * 由 {@link MigrationExecutorRegistry} 按 id 路由。
 */
public interface MigrationExecutorProvider {

    /** Stable executor id, e.g. {@code builtin}. */
    String id();

    TableMigrationResult migrate(
            ConnectionEntity source,
            ConnectionEntity target,
            String sourceDatabase,
            String targetDatabase,
            TableMigrationRequest request
    );

    TableMigrationResult migrate(MigrationEndpoints endpoints, TableMigrationRequest request);

    List<TableMigrationResult> migrateBatch(
            MigrationEndpoints endpoints,
            TableMigrationBatchPlan plan,
            TableMigrationJobHooks hooks
    );
}
