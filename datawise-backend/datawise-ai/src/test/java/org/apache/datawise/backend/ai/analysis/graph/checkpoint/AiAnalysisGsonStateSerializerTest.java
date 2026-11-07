package org.apache.datawise.backend.ai.analysis.graph.checkpoint;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisGsonStateSerializerTest {

    @Test
    void roundTrip_largeExecuteResult_exceedsWriteUtfLimit() throws Exception {
        AiAnalysisGsonStateSerializer serializer = new AiAnalysisGsonStateSerializer();
        OverAllState state = new AiAnalysisGraphStateFactory().create();
        state.updateState(Map.of(AiAnalysisGraphKeys.EXECUTE_RESULT, largeExecuteResult()));

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(buffer)) {
            serializer.write(state, out);
        }

        assertTrue(buffer.size() > 65_535, "fixture should exceed Java writeUTF limit");

        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(buffer.toByteArray()))) {
            OverAllState restored = serializer.read(in);
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = (Map<String, Object>) restored.value(AiAnalysisGraphKeys.EXECUTE_RESULT)
                    .orElseThrow();
            assertEquals(120, ((Number) payload.get("rowCount")).intValue());
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) payload.get("rows");
            assertEquals(120, rows.size());
        }
    }

    @Test
    void read_legacyWriteUtfCheckpoint() throws Exception {
        AiAnalysisGsonStateSerializer serializer = new AiAnalysisGsonStateSerializer();
        OverAllState state = AiAnalysisGraphStateFactory.fromCheckpointData(Map.of(
                AiAnalysisGraphKeys.SAFE_SQL, "SELECT 1"
        ));

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(buffer)) {
            out.writeUTF(readGson(serializer).toJson(state));
        }

        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(buffer.toByteArray()))) {
            OverAllState restored = serializer.read(in);
            assertEquals("SELECT 1", restored.value(AiAnalysisGraphKeys.SAFE_SQL, ""));
        }
    }

    private static Map<String, Object> largeExecuteResult() {
        String wideLog = "x".repeat(900);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", "row-" + i);
            row.put("failed_log", wideLog + i);
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rowCount", rows.size());
        result.put("durationMs", 12L);
        result.put("columns", List.of(Map.of("name", "failed_log", "type", "varchar")));
        result.put("rows", rows);
        return result;
    }

    private static com.google.gson.Gson readGson(AiAnalysisGsonStateSerializer serializer) throws Exception {
        Field field = com.alibaba.cloud.ai.graph.serializer.plain_text.gson.GsonStateSerializer.class.getDeclaredField("gson");
        field.setAccessible(true);
        return (com.google.gson.Gson) field.get(serializer);
    }
}
