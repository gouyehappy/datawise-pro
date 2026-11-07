package org.apache.datawise.backend.ai.analysis.graph.config;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.StateGraph;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
class AiAnalysisGraphConfigurationTest {

    @Autowired
    private StateGraph aiAnalysisStateGraph;

    @Autowired
    private CompiledGraph aiAnalysisCompiledGraph;

    @Test
    void compilesAnalysisStateGraphBeans() {
        assertNotNull(aiAnalysisStateGraph);
        assertNotNull(aiAnalysisCompiledGraph);
    }
}
