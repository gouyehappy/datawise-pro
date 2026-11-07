package org.apache.datawise.hello;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Standalone hello sidecar for the community plugin example package.
 */
public final class HelloPluginMain extends StdioJsonRpcSidecar {

    private final Map<String, Boolean> connections = new ConcurrentHashMap<>();
    private final Map<String, String> files = new ConcurrentHashMap<>();

    public HelloPluginMain() {
        files.put("hello:/readme.txt", "Hello DataWise");
        files.put("hello:/notes.txt", "editable");
    }

    public static void main(String[] args) throws Exception {
        new HelloPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("ok", true);
                ok.put("name", "Hello Workbench");
                yield ok;
            }
            case "connection/test" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                ok.put("message", "Hello connection OK for " + params.path("connection").path("host").asText("localhost"));
                yield ok;
            }
            case "connection/connect" -> {
                String id = params.path("connection").path("id").asText("anon");
                connections.put(id, true);
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                ok.put("handle", "hello-" + id);
                yield ok;
            }
            case "connection/disconnect" -> {
                connections.remove(params.path("connection").path("id").asText("anon"));
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                yield ok;
            }
            case "connection/action" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                ok.put("actionId", params.path("actionId").asText());
                ok.put("message", "Hello action executed");
                yield ok;
            }
            case "filesystem/list" -> {
                ObjectNode result = mapper().createObjectNode();
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
                ObjectNode result = mapper().createObjectNode();
                result.put("dataBase64", Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)));
                result.put("contentType", "text/plain");
                result.put("truncated", false);
                yield result;
            }
            case "filesystem/write" -> {
                String uri = params.path("uri").asText();
                String data = new String(Base64.getDecoder().decode(params.path("dataBase64").asText("")), StandardCharsets.UTF_8);
                files.put(uri, data);
                ObjectNode result = mapper().createObjectNode();
                result.put("ok", true);
                result.put("uri", uri);
                result.put("bytes", data.getBytes(StandardCharsets.UTF_8).length);
                yield result;
            }
            case "filesystem/delete" -> {
                files.remove(params.path("uri").asText());
                ObjectNode result = mapper().createObjectNode();
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
                ObjectNode result = mapper().createObjectNode();
                result.put("ok", true);
                yield result;
            }
            case "filesystem/createDirectory" -> {
                ObjectNode result = mapper().createObjectNode();
                result.put("ok", true);
                result.put("uri", params.path("uri").asText());
                yield result;
            }
            case "context-menu/invoke" -> {
                ObjectNode result = mapper().createObjectNode();
                result.put("message", "Hello context menu: " + params.path("contributionId").asText());
                yield result;
            }
            case "result-view/open" -> {
                ObjectNode result = mapper().createObjectNode();
                result.put("message", "Hello result view for " + params.path("contributionId").asText());
                yield result;
            }
            case "hello/greet" -> {
                ObjectNode result = mapper().createObjectNode();
                result.put("message", "Hello from community plugin");
                yield result;
            }
            default -> throw new org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar.UnknownMethodException(method);
        };
    }
}
