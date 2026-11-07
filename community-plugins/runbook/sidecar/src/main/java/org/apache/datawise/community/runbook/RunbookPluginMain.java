package org.apache.datawise.community.runbook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

public final class RunbookPluginMain extends StdioJsonRpcSidecar {

    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private final Map<String, String> libraries = new ConcurrentHashMap<>();
    private volatile Path pluginDataDir;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public static void main(String[] args) throws Exception {
        new RunbookPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> initialize(params);
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> {
                libraries.remove(params.path("connection").path("id").asText("anon"));
                yield ok("success", true);
            }
            case "connection/action" -> action(params);
            case "context-menu/invoke" -> ok("message", "Open the runbook workbench.");
            case "runbook/list" -> list(requirePath(params), params.path("query").asText(""));
            case "runbook/get" -> get(requirePath(params), params.path("id").asText(""));
            case "runbook/http" -> http(params.path("method").asText("GET"), params.path("url").asText(""));
            case "runbook/demo-path" -> ok("path", demoDir().toString());
            default -> throw new UnknownMethodException(method);
        };
    }

    private ObjectNode initialize(JsonNode params) {
        String dir = params.path("pluginDataDir").asText("");
        if (!dir.isBlank()) pluginDataDir = Path.of(dir);
        return ok("ok", true, "name", "Runbook Runner", "demoPath", demoDir().toString());
    }

    private ObjectNode test(JsonNode connection) {
        try {
            Path dir = resolveLibrary(connection);
            long n = countYaml(dir);
            return ok("success", true, "message", "Runbook library OK · " + n + " files · " + dir);
        } catch (Exception e) {
            return ok("success", false, "message", e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private ObjectNode connect(JsonNode connection) {
        Path dir = resolveLibrary(connection);
        String id = connection.path("id").asText("anon");
        libraries.put(id, dir.toString());
        return ok("success", true, "handle", "runbook-" + id);
    }

    private ObjectNode action(JsonNode params) {
        String id = params.path("action").path("id").asText(params.path("actionId").asText(""));
        if ("use-demo".equals(id)) {
            ObjectNode out = ok("success", true, "message", "Filled the bundled demo library. Save, then open the workbench.");
            out.putObject("fieldValues").put("libraryPath", demoDir().toString());
            return out;
        }
        return ok("success", true);
    }

    private ObjectNode list(String library, String query) {
        Path dir = Path.of(library);
        ObjectNode out = mapper().createObjectNode();
        ArrayNode books = out.putArray("runbooks");
        String q = query == null ? "" : query.trim().toLowerCase();
        try (Stream<Path> walk = Files.list(dir)) {
            walk.filter(p -> p.getFileName().toString().endsWith(".runbook.yml") || p.getFileName().toString().endsWith(".yml"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .forEach(p -> {
                        try {
                            JsonNode doc = yaml.readTree(p.toFile());
                            String title = doc.path("title").asText(p.getFileName().toString());
                            String id = doc.path("id").asText(p.getFileName().toString());
                            String tags = tagsOf(doc);
                            if (!q.isEmpty() && !(title + id + tags).toLowerCase().contains(q)) return;
                            ObjectNode row = books.addObject();
                            row.put("id", id);
                            row.put("title", title);
                            row.put("tags", tags);
                            row.put("file", p.getFileName().toString());
                            row.put("steps", doc.path("steps").size());
                        } catch (IOException ignored) {
                            // skip broken file
                        }
                    });
        } catch (IOException e) {
            throw new IllegalArgumentException(e.getMessage());
        }
        out.put("count", books.size());
        return out;
    }

    private ObjectNode get(String library, String id) {
        Path file = findFile(Path.of(library), id);
        if (file == null) throw new IllegalArgumentException("Runbook not found: " + id);
        try {
            JsonNode doc = yaml.readTree(file.toFile());
            ObjectNode out = mapper().createObjectNode();
            out.set("runbook", doc);
            out.put("file", file.toString());
            return out;
        } catch (IOException e) {
            throw new IllegalArgumentException(e.getMessage());
        }
    }

    private ObjectNode http(String method, String url) {
        if (url == null || url.isBlank()) throw new IllegalArgumentException("url is required");
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url.trim()))
                    .timeout(Duration.ofSeconds(12))
                    .method(method == null || method.isBlank() ? "GET" : method.toUpperCase(), HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            String body = res.body() == null ? "" : res.body();
            if (body.length() > 4000) body = body.substring(0, 4000) + "…";
            ObjectNode out = mapper().createObjectNode();
            out.put("success", res.statusCode() >= 200 && res.statusCode() < 400);
            out.put("status", res.statusCode());
            out.put("body", body);
            return out;
        } catch (Exception e) {
            return ok("success", false, "message", e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private String requirePath(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) id = params.path("connection").path("id").asText("anon");
        String path = libraries.get(id);
        if (path == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode()) {
                path = resolveLibrary(conn).toString();
                libraries.put(id, path);
            }
        }
        if (path == null) throw new IllegalArgumentException("Library not open");
        return path;
    }

    private Path resolveLibrary(JsonNode connection) {
        JsonNode cfg = connection.path("external_config");
        String raw = first(cfg.path("libraryPath").asText(""), connection.path("libraryPath").asText(""));
        if (raw.isBlank()) throw new IllegalArgumentException("libraryPath is required");
        Path dir = Path.of(raw);
        if (!Files.isDirectory(dir)) throw new IllegalArgumentException("Not a directory: " + dir);
        return dir;
    }

    private Path demoDir() {
        Path installed = Path.of("").toAbsolutePath().resolve("demo-runbooks");
        if (Files.isDirectory(installed) && countYaml(installed) > 0) return installed;
        Path dest = (pluginDataDir != null ? pluginDataDir : Path.of("").toAbsolutePath()).resolve("demo-runbooks");
        String[] files = {
                "redis-high-memory.runbook.yml",
                "connection-saturation.runbook.yml",
                "release-check.runbook.yml"
        };
        for (String name : files) {
            try (var in = RunbookPluginMain.class.getResourceAsStream("/demo-runbooks/" + name)) {
                if (in == null) continue;
                Files.createDirectories(dest);
                Files.copy(in, dest.resolve(name), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
                // best effort
            }
        }
        return dest;
    }

    private Path findFile(Path dir, String id) {
        try (Stream<Path> walk = Files.list(dir)) {
            return walk.filter(Files::isRegularFile).filter(p -> {
                String name = p.getFileName().toString();
                if (!name.endsWith(".yml") && !name.endsWith(".yaml")) return false;
                if (name.equals(id) || name.startsWith(id)) return true;
                try {
                    return id.equals(yaml.readTree(p.toFile()).path("id").asText(""));
                } catch (IOException e) {
                    return false;
                }
            }).findFirst().orElse(null);
        } catch (IOException e) {
            return null;
        }
    }

    private static long countYaml(Path dir) {
        try (Stream<Path> walk = Files.list(dir)) {
            return walk.filter(p -> p.getFileName().toString().endsWith(".yml")).count();
        } catch (IOException e) {
            return 0;
        }
    }

    private static String tagsOf(JsonNode doc) {
        if (!doc.path("tags").isArray()) return "";
        StringBuilder sb = new StringBuilder();
        for (JsonNode t : doc.path("tags")) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(t.asText());
        }
        return sb.toString();
    }

    private ObjectNode ok(Object... kv) {
        ObjectNode n = mapper().createObjectNode();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object v = kv[i + 1];
            if (v instanceof Boolean b) n.put(String.valueOf(kv[i]), b);
            else n.put(String.valueOf(kv[i]), String.valueOf(v));
        }
        return n;
    }

    private static String first(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return "";
    }
}
