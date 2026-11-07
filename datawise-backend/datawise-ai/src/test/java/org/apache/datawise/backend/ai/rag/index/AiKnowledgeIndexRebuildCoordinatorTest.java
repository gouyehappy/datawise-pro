package org.apache.datawise.backend.ai.rag.index;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.rag.AiKnowledgeIndexService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiKnowledgeIndexRebuildCoordinatorTest {

    @Mock
    private AiKnowledgeIndexService indexService;

    private AiRagProperties ragProperties;
    private AiKnowledgeIndexRebuildCoordinator coordinator;

    @BeforeEach
    void setUp() {
        ragProperties = new AiRagProperties();
        ragProperties.getIndex().setAsyncRebuild(true);
        ragProperties.getIndex().setMinRebuildIntervalSeconds(300);
        coordinator = new AiKnowledgeIndexRebuildCoordinator(ragProperties, indexService);
    }

    @Test
    void schedule_returnsDisabledWhenPgVectorNotConfigured() {
        when(indexService.isPgVectorConfigured()).thenReturn(false);

        var decision = coordinator.schedule("conn-1", "db1");

        assertEquals("disabled", decision.status());
        verify(indexService, never()).rebuildIndex("conn-1", "db1");
    }

    @Test
    void schedule_runsSyncWhenAsyncDisabled() {
        ragProperties.getIndex().setAsyncRebuild(false);
        coordinator = new AiKnowledgeIndexRebuildCoordinator(ragProperties, indexService);
        when(indexService.isPgVectorConfigured()).thenReturn(true);
        when(indexService.rebuildIndex("conn-1", "db1")).thenReturn(3);

        var decision = coordinator.schedule("conn-1", "db1");

        assertEquals("completed", decision.status());
        assertEquals(3, decision.syncedEntries());
    }

    @Test
    void schedule_rateLimitsRepeatedRequests() {
        ragProperties.getIndex().setAsyncRebuild(false);
        coordinator = new AiKnowledgeIndexRebuildCoordinator(ragProperties, indexService);
        when(indexService.isPgVectorConfigured()).thenReturn(true);
        when(indexService.rebuildIndex("conn-1", "db1")).thenReturn(2);

        var first = coordinator.schedule("conn-1", "db1");
        var second = coordinator.schedule("conn-1", "db1");

        assertEquals("completed", first.status());
        assertEquals("rate_limited", second.status());
    }
}
