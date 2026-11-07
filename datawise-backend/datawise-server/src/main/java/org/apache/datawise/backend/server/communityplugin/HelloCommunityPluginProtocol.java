package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Reference hello sidecar protocol implementation (also used by unit tests via piped streams).
 * Speaks stdio-jsonl JSON-RPC for initialize / connection/* / filesystem/* / host hooks / hello/greet.
 */
public final class HelloCommunityPluginProtocol {

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Boolean> connections = new ConcurrentHashMap<>();
    private final Map<String, String> files = new ConcurrentHashMap<>();

    public HelloCommunityPluginProtocol() {
        files.put("hello:/readme.txt", "Hello DataWise");
        files.put("hello:/notes.txt", "editable");
    }

    public void run(InputStream in, OutputStream out) throws Exception {
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
            try {
                String method = request.path("method").asText();
                JsonNode params = request.path("params");
                response.set("result", dispatch(method, params));
            } catch (UnknownMethodException e) {
                ObjectNode error = response.putObject("error");
                error.put("code", -32601);
                error.put("message", e.getMessage());
            } catch (Exception e) {
                ObjectNode error = response.putObject("error");
                error.put("code", -32000);
                error.put("message", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
            writer.write(mapper.writeValueAsString(response));
            writer.newLine();
            writer.flush();
        }
    }

    /** Mirrors the SDK convention: unknown methods answer JSON-RPC -32601. */
    static final class UnknownMethodException extends RuntimeException {
        UnknownMethodException(String method) {
            super("Method not found: " + method);
        }
    }

    private JsonNode dispatch(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> {
                ObjectNode ok = mapper.createObjectNode();
                ok.put("ok", true);
                ok.put("name", "Hello Workbench");
                yield ok;
            }
            case "connection/test" -> {
                ObjectNode ok = mapper.createObjectNode();
                ok.put("success", true);
                ok.put("message", "Hello connection OK for " + params.path("connection").path("host").asText("localhost"));
                ok.set("secretsEcho", params.path("connection").path("connection_secrets").deepCopy());
                ok.set("externalEcho", params.path("connection").path("external_config").deepCopy());
                yield ok;
            }
            case "connection/connect" -> {
                String id = params.path("connection").path("id").asText("anon");
                connections.put(id, true);
                ObjectNode ok = mapper.createObjectNode();
                ok.put("success", true);
                ok.put("handle", "hello-" + id);
                yield ok;
            }
            case "connection/disconnect" -> {
                String id = params.path("connection").path("id").asText("anon");
                connections.remove(id);
                ObjectNode ok = mapper.createObjectNode();
                ok.put("success", true);
                yield ok;
            }
            case "connection/action" -> {
                ObjectNode ok = mapper.createObjectNode();
                ok.put("success", true);
                ok.put("actionId", params.path("action").path("id").asText());
                ok.put("message", "Hello action executed");
                yield ok;
            }
            case "connection/challenge/resolve" -> {
                ObjectNode ok = mapper.createObjectNode();
                ok.put("ok", true);
                ok.put("resolved", params.path("challengeId").asText());
                yield ok;
            }
            case "filesystem/list" -> {
                ObjectNode result = mapper.createObjectNode();
                ArrayNode entries = result.putArray("entries");
                for (Map.Entry<String, String> e : files.entrySet()) {
                    ObjectNode item = entries.addObject();
                    String name = e.getKey().substring(e.getKey().lastIndexOf('/') + 1);
                    item.put("name", name);
                    item.put("uri", e.getKey());
                    item.put("kind", "file");
                    item.put("size", e.getValue().getBytes(StandardCharsets.UTF_8).length);
                }
                yield result;
            }
            case "filesystem/read" -> {
                String uri = params.path("uri").asText();
                String body = files.getOrDefault(uri, "");
                ObjectNode result = mapper.createObjectNode();
                result.put("dataBase64", Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)));
                result.put("contentType", "text/plain");
                result.put("truncated", false);
                yield result;
            }
            case "filesystem/write" -> {
                String uri = params.path("uri").asText();
                String data = new String(Base64.getDecoder().decode(params.path("dataBase64").asText("")), StandardCharsets.UTF_8);
                files.put(uri, data);
                ObjectNode result = mapper.createObjectNode();
                result.put("ok", true);
                result.put("uri", uri);
                yield result;
            }
            case "filesystem/delete" -> {
                files.remove(params.path("uri").asText());
                ObjectNode result = mapper.createObjectNode();
                result.put("ok", true);
                yield result;
            }
            case "filesystem/rename" -> {
                String from = params.path("fromUri").asText();
                String to = params.path("toUri").asText();
                String body = files.remove(from);
                if (body != null) {
                    files.put(to, body);
                }
                ObjectNode result = mapper.createObjectNode();
                result.put("ok", true);
                yield result;
            }
            case "filesystem/createDirectory" -> {
                ObjectNode result = mapper.createObjectNode();
                result.put("ok", true);
                result.put("uri", params.path("uri").asText());
                yield result;
            }
            case "context-menu/invoke" -> {
                ObjectNode result = mapper.createObjectNode();
                result.put("message", "Hello context menu: " + params.path("contributionId").asText());
                yield result;
            }
            case "result-view/open" -> {
                ObjectNode result = mapper.createObjectNode();
                result.put("message", "Hello result view for " + params.path("contributionId").asText());
                yield result;
            }
            case "hello/greet" -> {
                ObjectNode result = mapper.createObjectNode();
                result.put("message", "Hello from community plugin");
                yield result;
            }
            default -> throw new UnknownMethodException(method);
        };
    }

    public static void main(String[] args) throws Exception {
        new HelloCommunityPluginProtocol().run(System.in, System.out);
    }
}
