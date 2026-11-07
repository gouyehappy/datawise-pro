package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * Minimal sidecar stub that answers {@code workbench/close} with
 * {@code sessionsRemaining: 0} so Host idle-stop can be unit-tested.
 */
final class IdleCloseCommunityPluginProtocol {

    private final ObjectMapper mapper = new ObjectMapper();

    void run(InputStream in, OutputStream out) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            JsonNode request = mapper.readTree(line);
            if (!request.has("id")) {
                continue;
            }
            ObjectNode response = mapper.createObjectNode();
            response.put("jsonrpc", "2.0");
            response.put("id", request.get("id").asLong());
            String method = request.path("method").asText();
            ObjectNode result = mapper.createObjectNode();
            if ("plugin/initialize".equals(method)) {
                result.put("ok", true);
            } else if ("workbench/close".equals(method)) {
                result.put("success", true);
                result.put("sessionsRemaining", 0);
            } else {
                ObjectNode error = response.putObject("error");
                error.put("code", -32601);
                error.put("message", "Method not found: " + method);
                writer.write(mapper.writeValueAsString(response));
                writer.newLine();
                writer.flush();
                continue;
            }
            response.set("result", result);
            writer.write(mapper.writeValueAsString(response));
            writer.newLine();
            writer.flush();
        }
    }
}
