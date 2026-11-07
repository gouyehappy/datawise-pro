package org.apache.datawise.backend.ai.analysis.graph.stream;

import org.apache.datawise.backend.ai.AiException;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.RunnableConfig;
import com.alibaba.cloud.ai.graph.state.StateSnapshot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiAnalysisGraphStreamSupportTest {

    @Mock
    private CompiledGraph graph;

    @Mock
    private StateSnapshot snapshot;

    @Mock
    private OverAllState state;

    @Test
    void resolveLatestConfigLoadsCheckpointByThreadIdOnly() {
        RunnableConfig staleClient = RunnableConfig.builder()
                .threadId("thread-1")
                .checkPointId("stale-checkpoint")
                .build();
        RunnableConfig freshSaver = RunnableConfig.builder()
                .threadId("thread-1")
                .checkPointId("latest-checkpoint")
                .build();

        when(graph.getState(any())).thenReturn(snapshot);
        when(snapshot.state()).thenReturn(state);
        when(snapshot.config()).thenReturn(freshSaver);

        RunnableConfig resolved = AiAnalysisGraphStreamSupport.resolveLatestConfig(graph, staleClient);

        ArgumentCaptor<RunnableConfig> captor = ArgumentCaptor.forClass(RunnableConfig.class);
        verify(graph).getState(captor.capture());
        RunnableConfig lookup = captor.getValue();
        assertEquals("thread-1", lookup.threadId().orElse(""));
        assertEquals(true, lookup.checkPointId().isEmpty());
        assertEquals("latest-checkpoint", resolved.checkPointId().orElse(""));
    }

    @Test
    void resolveLatestConfigFailsWhenSessionExpired() {
        when(graph.getState(any())).thenReturn(null);
        RunnableConfig config = RunnableConfig.builder().threadId("missing-thread").build();
        assertThrows(AiException.class, () ->
                AiAnalysisGraphStreamSupport.resolveLatestConfig(graph, config)
        );
    }
}
