package org.apache.datawise.backend.sync.api;

/** 批次间检查：暂停请求时抛出 {@link MigrationPausedException}。 */
@FunctionalInterface
public interface MigrationExecutionControl {

    void checkContinue();

    static MigrationExecutionControl noop() {
        return () -> {
        };
    }
}
