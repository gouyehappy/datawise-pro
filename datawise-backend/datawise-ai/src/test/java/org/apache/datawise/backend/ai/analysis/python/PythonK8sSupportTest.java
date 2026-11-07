package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonK8sSupportTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void buildsJobManifestWithConfigMapMount() {
        String json = PythonK8sSupport.buildJobManifestJson(
                objectMapper,
                "datawise-py-test",
                "default",
                "python:3.12-slim",
                "512Mi",
                "datawise-py-test-cm",
                "python /workspace/analysis.py"
        );
        assertTrue(json.contains("\"kind\" : \"Job\""));
        assertTrue(json.contains("\"name\" : \"datawise-py-test\""));
        assertTrue(json.contains("\"name\" : \"datawise-py-test-cm\""));
        assertTrue(json.contains("python /workspace/analysis.py"));
    }

    @Test
    void buildsKubectlWaitCommand() {
        List<String> command = PythonK8sSupport.buildWaitJobCommand("kubectl", "datawise-py-test", "default", 45);
        assertEquals("kubectl", command.get(0));
        assertTrue(command.contains("job/datawise-py-test"));
        assertTrue(command.contains("--timeout=45s"));
    }

    @Test
    void sanitizesResourceNames() {
        assertEquals("datawise-py-abc", PythonK8sSupport.sanitizeResourceName("DataWise_PY_ABC"));
    }
}
