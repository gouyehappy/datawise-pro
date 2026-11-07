package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Minimal stdio-framed echo sidecar for host tests (DBX frame compatible).
 */
public final class FramedEchoCommunityPluginProtocol {

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, byte[]> lastBinary = new ConcurrentHashMap<>();

    public void run(InputStream in, OutputStream out) throws Exception {
        while (true) {
            PluginFramedCodec.Frame frame = PluginFramedCodec.readFrame(in);
            if (frame == null) {
                return;
            }
            if (frame instanceof PluginFramedCodec.JsonFrame json) {
                JsonNode request = mapper.readTree(json.payload());
                if (!request.has("id")) {
                    continue;
                }
                ObjectNode response = mapper.createObjectNode();
                response.put("jsonrpc", "2.0");
                response.put("id", request.get("id").asLong());
                try {
                    response.set("result", dispatch(request.path("method").asText(), request.path("params"), out));
                } catch (Exception e) {
                    ObjectNode error = response.putObject("error");
                    error.put("code", -32000);
                    error.put("message", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                }
                PluginFramedCodec.writeJson(out, mapper.writeValueAsBytes(response));
            } else if (frame instanceof PluginFramedCodec.BinaryFrame binary) {
                lastBinary.put(binary.channel(), binary.data());
                // Echo binary back on the same channel.
                PluginFramedCodec.writeBinary(out, binary.channel(), binary.data());
            }
        }
    }

    private JsonNode dispatch(String method, JsonNode params, OutputStream out) throws Exception {
        return switch (method) {
            case "plugin/initialize" -> {
                ObjectNode ok = mapper.createObjectNode();
                ok.put("protocolVersion", 1);
                ok.putObject("plugin").put("id", "io.datawise.test.framed-echo").put("version", "1.0.0");
                ok.putArray("capabilities").add("events").add("binary");
                yield ok;
            }
            case "echo/ping" -> {
                ObjectNode event = mapper.createObjectNode();
                event.put("jsonrpc", "2.0");
                event.put("method", "echo/ready");
                event.putObject("params").put("ok", true);
                PluginFramedCodec.writeJson(out, mapper.writeValueAsBytes(event));
                ObjectNode ok = mapper.createObjectNode();
                ok.put("pong", true);
                ok.put("message", params.path("message").asText(""));
                yield ok;
            }
            case "echo/lastBinary" -> {
                String channel = params.path("channel").asText("default");
                byte[] data = lastBinary.getOrDefault(channel, new byte[0]);
                ObjectNode ok = mapper.createObjectNode();
                ok.put("channel", channel);
                ok.put("dataUtf8", new String(data, StandardCharsets.UTF_8));
                yield ok;
            }
            default -> throw new IllegalArgumentException("Unknown method: " + method);
        };
    }
}
