package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigrationExecutorRegistryTest {

    @Test
    void resolvesBuiltinByDefault() {
        TableMigrationProperties properties = new TableMigrationProperties();
        MigrationExecutorRegistry registry = new MigrationExecutorRegistry(
                List.of(new StubProvider(TableMigrationExecutor.ID), new StubProvider("seatunnel")),
                properties
        );
        assertEquals(TableMigrationExecutor.ID, registry.defaultExecutorId());
        assertEquals(TableMigrationExecutor.ID, registry.requireDefault().id());
        assertTrue(registry.listIds().contains("seatunnel"));
    }

    @Test
    void resolvesConfiguredExecutor() {
        TableMigrationProperties properties = new TableMigrationProperties();
        properties.setExecutor("SeaTunnel");
        MigrationExecutorRegistry registry = new MigrationExecutorRegistry(
                List.of(new StubProvider(TableMigrationExecutor.ID), new StubProvider("seatunnel")),
                properties
        );
        assertEquals("seatunnel", registry.requireDefault().id());
    }

    @Test
    void rejectsUnknownExecutor() {
        MigrationExecutorRegistry registry = new MigrationExecutorRegistry(
                List.of(new StubProvider(TableMigrationExecutor.ID)),
                new TableMigrationProperties()
        );
        assertThrows(IllegalArgumentException.class, () -> registry.require("flink"));
    }

    @Test
    void rejectsDuplicateIds() {
        assertThrows(
                IllegalStateException.class,
                () -> new MigrationExecutorRegistry(
                        List.of(new StubProvider("builtin"), new StubProvider("BUILTIN")),
                        new TableMigrationProperties()
                )
        );
    }

    private static final class StubProvider implements MigrationExecutorProvider {
        private final String id;

        private StubProvider(String id) {
            this.id = id;
        }

        @Override
        public String id() {
            return id;
        }

        @Override
        public TableMigrationResult migrate(
                ConnectionEntity source,
                ConnectionEntity target,
                String sourceDatabase,
                String targetDatabase,
                TableMigrationRequest request
        ) {
            throw new UnsupportedOperationException();
        }

        @Override
        public TableMigrationResult migrate(MigrationEndpoints endpoints, TableMigrationRequest request) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<TableMigrationResult> migrateBatch(
                MigrationEndpoints endpoints,
                TableMigrationBatchPlan plan,
                TableMigrationJobHooks hooks
        ) {
            throw new UnsupportedOperationException();
        }
    }
}
