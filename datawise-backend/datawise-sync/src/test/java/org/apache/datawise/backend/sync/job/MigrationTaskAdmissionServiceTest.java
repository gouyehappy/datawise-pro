package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MigrationTaskAdmissionServiceTest {

    @Test
    void enqueue_registersTenantPolicyAndAdmitsTask() {
        TaskConcurrencyController controller = mock(TaskConcurrencyController.class);
        int slotKey = MigrationTaskAdmissionService.toSlotTenantId("default");
        when(controller.getTenantPolicy(slotKey)).thenReturn(java.util.Optional.empty());

        MigrationTaskAdmissionService service = new MigrationTaskAdmissionService(2, 5);
        service.enqueue(7L, "default", "job-1", request(1, 100, 0, null), controller);

        verify(controller).upsertTenantPolicy(TenantSlotPolicy.builder()
                .tenantId(slotKey)
                .allocatedSlots(2)
                .reservedSlots(1)
                .maxConcurrent(2)
                .enabled(true)
                .build());
        verify(controller).enqueue(argThat(request ->
                request != null
                        && "job-1".equals(request.getTaskId())
                        && request.getTenantId() == slotKey
                        && request.getPriority() == 8));
    }

    @Test
    void enqueue_skipsPolicyUpsertWhenTenantExists() {
        TaskConcurrencyController controller = mock(TaskConcurrencyController.class);
        int slotKey = MigrationTaskAdmissionService.toSlotTenantId("acme");
        when(controller.getTenantPolicy(slotKey)).thenReturn(java.util.Optional.of(
                TenantSlotPolicy.builder().tenantId(slotKey).allocatedSlots(2).build()
        ));

        MigrationTaskAdmissionService service = new MigrationTaskAdmissionService(2, 5);
        service.enqueue(7L, "acme", "job-1", request(3, 500, 0, null), controller);

        verify(controller, never()).upsertTenantPolicy(any());
        verify(controller).enqueue(any());
    }

    @Test
    void toSlotTenantId_isStableForSameProductTenant() {
        assertEquals(
                MigrationTaskAdmissionService.toSlotTenantId("default"),
                MigrationTaskAdmissionService.toSlotTenantId("default")
        );
        assertEquals(
                MigrationTaskAdmissionService.toSlotTenantId(null),
                MigrationTaskAdmissionService.toSlotTenantId("default")
        );
    }

    @Test
    void resolvePriority_prefersSmallAndResumeJobs() {
        MigrationTaskAdmissionService service = new MigrationTaskAdmissionService(2, 5);
        int priority = service.resolvePriority(request(1, 100, 0, "resume-1"));
        assertEquals(9, priority);
    }

    @Test
    void resolvePriority_downgradesLargeThrottledJobs() {
        MigrationTaskAdmissionService service = new MigrationTaskAdmissionService(2, 5);
        int priority = service.resolvePriority(request(12, 3000, 1000, null));
        assertEquals(1, priority);
    }

    @Test
    void resolvePriority_usesCustomWeights() {
        MigrationTaskAdmissionService.PriorityPolicy policy = new MigrationTaskAdmissionService.PriorityPolicy(
                4,
                1, 2, 3, 4,
                3, 2, 1, 3,
                1,
                100, 500,
                2, 2,
                2
        );
        MigrationTaskAdmissionService service = new MigrationTaskAdmissionService(2, policy);
        int priority = service.resolvePriority(request(1, 80, 0, "resume-1"));
        assertEquals(9, priority);
    }

    private static TableMigrationBatchRequest request(
            int tableCount,
            Integer batchSize,
            Integer throttleMs,
            String resumeJobId
    ) {
        List<TableMigrationBatchTableRequest> tables = java.util.stream.IntStream.range(0, tableCount)
                .mapToObj(i -> new TableMigrationBatchTableRequest("t" + i, true))
                .toList();
        return new TableMigrationBatchRequest(
                "src",
                "db1",
                "tgt",
                "db2",
                tables,
                "append",
                null,
                List.of(),
                null,
                batchSize,
                throttleMs,
                false,
                "job-x",
                resumeJobId,
                null,
                null
        );
    }
}
