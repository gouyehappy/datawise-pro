package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonK8sSupportTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void buildsJobManifestWithConfigMapMountAndIsolation() {
        String json = PythonK8sSupport.buildJobManifestJson(
                objectMapper,
                "datawise-py-test",
                "default",
                "python:3.12-slim",
                "512Mi",
                "1",
                "datawise-py-test-cm",
                "python /workspace/analysis.py"
        );
        assertTrue(json.contains("\"kind\" : \"Job\""));
        assertTrue(json.contains("\"name\" : \"datawise-py-test\""));
        assertTrue(json.contains("\"name\" : \"datawise-py-test-cm\""));
        assertTrue(json.contains("python /workspace/analysis.py"));
        assertTrue(json.contains("\"cpu\" : \"1\""));
        assertTrue(json.contains("\"memory\" : \"512Mi\""));
        assertTrue(json.contains("\"readOnlyRootFilesystem\" : true"));
        assertTrue(json.contains("\"allowPrivilegeEscalation\" : false"));
        assertTrue(json.contains("\"ALL\""));
        assertTrue(json.contains("\"RuntimeDefault\""));
        assertTrue(json.contains("\"automountServiceAccountToken\" : false"));
        assertTrue(json.contains("\"hostNetwork\" : false"));
        assertTrue(json.contains("\"sizeLimit\" : \"64Mi\""));
        assertTrue(json.contains("\"mountPath\" : \"/tmp\""));
        assertTrue(json.contains("\"datawise.ai/python-run\" : \"datawise-py-test\""));
    }

    @Test
    void buildsDenyAllNetworkPolicyForJobLabel() {
        String json = PythonK8sSupport.buildNetworkPolicyManifestJson(
                objectMapper,
                "datawise-py-test",
                "default"
        );
        assertTrue(json.contains("\"kind\" : \"NetworkPolicy\""));
        assertTrue(json.contains("\"name\" : \"datawise-py-test-net\""));
        assertTrue(json.contains("\"datawise.ai/python-run\" : \"datawise-py-test\""));
        assertTrue(json.contains("\"Ingress\""));
        assertTrue(json.contains("\"Egress\""));
        assertFalse(json.contains("\"ingress\""));
        assertFalse(json.contains("\"egress\""));
        assertEquals("datawise-py-test-net", PythonK8sSupport.networkPolicyName("datawise-py-test"));
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
