package org.apache.datawise.community.health;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Stream;

public final class HealthCheckPluginMain extends StdioJsonRpcSidecar {

    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private final Map<String, String> suites = new ConcurrentHashMap<>();
    private volatile Path pluginDataDir;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public static void main(String[] args) throws Exception {
        new HealthCheckPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> initialize(params);
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> {
                suites.remove(params.path("connection").path("id").asText("anon"));
                yield ok("success", true);
            }
            case "connection/action" -> action(params);
            case "context-menu/invoke" -> ok("message", "Open the health checklist workbench.");
            case "health/list" -> list(requirePath(params), params.path("query").asText(""));
            case "health/get" -> get(requirePath(params), params.path("id").asText(""));
            case "health/run" -> run(requirePath(params), params.path("id").asText(""), params);
            default -> throw new UnknownMethodException(method);
        };
    }

    private ObjectNode initialize(JsonNode params) {
        String dir = params.path("pluginDataDir").asText("");
        if (!dir.isBlank()) pluginDataDir = Path.of(dir);
        return ok("ok", true, "demoPath", demoDir().toString());
    }

    private ObjectNode test(JsonNode connection) {
        try {
            Path dir = resolve(connection);
            return ok("success", true, "message", "Suite folder OK · " + dir);
        } catch (Exception e) {
            return ok("success", false, "message", e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private ObjectNode connect(JsonNode connection) {
        Path dir = resolve(connection);
        String id = connection.path("id").asText("anon");
        suites.put(id, dir.toString());
        return ok("success", true, "handle", "health-" + id);
    }

    private ObjectNode action(JsonNode params) {
        String id = params.path("action").path("id").asText("");
        if ("use-demo".equals(id)) {
            ObjectNode out = ok("success", true, "message", "Filled the bundled demo suite. Save, then open the workbench.");
            out.putObject("fieldValues").put("suitePath", demoDir().toString());
            return out;
        }
        return ok("success", true);
    }

    private ObjectNode list(String folder, String query) {
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("suites");
        String q = query == null ? "" : query.toLowerCase();
        try (Stream<Path> walk = Files.list(Path.of(folder))) {
            walk.filter(p -> p.getFileName().toString().endsWith(".suite.yml") || p.getFileName().toString().endsWith(".yml"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .forEach(p -> {
                        try {
                            JsonNode doc = yaml.readTree(p.toFile());
                            String title = doc.path("title").asText(p.getFileName().toString());
                            String id = doc.path("id").asText(p.getFileName().toString());
                            if (!q.isBlank() && !(title + id).toLowerCase().contains(q)) return;
                            ObjectNode row = rows.addObject();
                            row.put("id", id);
                            row.put("title", title);
                            row.put("checks", doc.path("checks").size());
                        } catch (IOException ignored) {
                            // skip
                        }
                    });
        } catch (IOException e) {
            throw new IllegalArgumentException(e.getMessage());
        }
        return out;
    }

    private ObjectNode get(String folder, String id) {
        Path file = find(Path.of(folder), id);
        if (file == null) throw new IllegalArgumentException("Suite not found: " + id);
        try {
            ObjectNode out = mapper().createObjectNode();
            out.set("suite", yaml.readTree(file.toFile()));
            return out;
        } catch (IOException e) {
            throw new IllegalArgumentException(e.getMessage());
        }
    }

    private ObjectNode run(String folder, String id, JsonNode params) {
        JsonNode suite = get(folder, id).path("suite");
        Map<String, JsonNode> targets = new HashMap<>();
        for (JsonNode t : suite.path("targets")) targets.put(t.path("id").asText(), t);
        List<JsonNode> checks = new ArrayList<>();
        String only = params.path("only").asText("");
        for (JsonNode c : suite.path("checks")) {
            if (!only.isBlank() && !only.contains(c.path("id").asText())) continue;
            checks.add(c);
        }
        int concurrency = Math.max(1, Math.min(suite.path("concurrency").asInt(params.path("concurrency").asInt(4)), 8));
        ExecutorService pool = Executors.newFixedThreadPool(concurrency);
        List<Future<ObjectNode>> futures = new ArrayList<>();
        for (JsonNode check : checks) {
            futures.add(pool.submit(() -> probe(check, targets.get(check.path("target").asText()))));
        }
        ObjectNode out = mapper().createObjectNode();
        ArrayNode results = out.putArray("results");
        int pass = 0, fail = 0;
        long started = System.currentTimeMillis();
        for (Future<ObjectNode> f : futures) {
            try {
                ObjectNode row = f.get();
                results.add(row);
                if ("pass".equals(row.path("status").asText())) pass++;
                else if ("fail".equals(row.path("status").asText())) fail++;
            } catch (Exception e) {
                ObjectNode row = results.addObject();
                row.put("status", "fail");
                row.put("summary", e.getMessage());
                fail++;
            }
        }
        pool.shutdownNow();
        out.put("pass", pass);
        out.put("fail", fail);
        out.put("elapsedMs", System.currentTimeMillis() - started);
        out.put("title", suite.path("title").asText(id));
        return out;
    }

    private ObjectNode probe(JsonNode check, JsonNode target) {
        long t0 = System.nanoTime();
        ObjectNode row = mapper().createObjectNode();
        row.put("id", check.path("id").asText());
        row.put("type", check.path("type").asText());
        row.put("target", check.path("target").asText());
        String type = check.path("type").asText();
        try {
            if (target == null) throw new IllegalArgumentException("missing target");
            switch (type) {
                case "tcp_connect" -> {
                    String host = target.path("host").asText();
                    int port = target.path("port").asInt(0);
                    try (Socket socket = new Socket()) {
                        socket.connect(new InetSocketAddress(host, port), 4000);
                    }
                    row.put("status", "pass");
                    row.put("summary", host + ":" + port + " open");
                }
                case "http_status" -> {
                    int expect = check.path("expect").asInt(200);
                    HttpRequest req = HttpRequest.newBuilder(URI.create(target.path("url").asText()))
                            .timeout(Duration.ofSeconds(8)).GET().build();
                    HttpResponse<Void> res = http.send(req, HttpResponse.BodyHandlers.discarding());
                    boolean ok = res.statusCode() == expect;
                    row.put("status", ok ? "pass" : "fail");
                    row.put("summary", "HTTP " + res.statusCode() + " (expect " + expect + ")");
                }
                case "sql_readonly" -> {
                    row.put("status", "deferred");
                    row.put("sql", check.path("sql").asText("SELECT 1"));
                    row.put("connectionHint", target.path("connectionHint").asText(""));
                    row.put("summary", "等待宿主执行只读 SQL");
                }
                default -> {
                    row.put("status", "fail");
                    row.put("summary", "unknown check type " + type);
                }
            }
        } catch (Exception e) {
            row.put("status", "fail");
            row.put("summary", e.getMessage() == null ? e.toString() : e.getMessage());
        }
        row.put("ms", (System.nanoTime() - t0) / 1_000_000);
        return row;
    }

    private String requirePath(JsonNode params) {
        String id = params.path("connectionId").asText(params.path("connection").path("id").asText("anon"));
        String path = suites.get(id);
        if (path == null && params.has("connection")) {
            path = resolve(params.path("connection")).toString();
            suites.put(id, path);
        }
        if (path == null) throw new IllegalArgumentException("Suite folder not open");
        return path;
    }

    private Path resolve(JsonNode connection) {
        String raw = first(connection.path("external_config").path("suitePath").asText(""),
                connection.path("suitePath").asText(""));
        if (raw.isBlank()) throw new IllegalArgumentException("suitePath is required");
        Path dir = Path.of(raw);
        if (!Files.isDirectory(dir)) throw new IllegalArgumentException("Not a directory: " + dir);
        return dir;
    }

    private Path demoDir() {
        Path dest = (pluginDataDir != null ? pluginDataDir : Path.of("").toAbsolutePath()).resolve("demo-suites");
        try (var in = HealthCheckPluginMain.class.getResourceAsStream("/demo-suites/daily-ops.suite.yml")) {
            if (in != null) {
                Files.createDirectories(dest);
                Files.copy(in, dest.resolve("daily-ops.suite.yml"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
            // best effort
        }
        return dest;
    }

    private Path find(Path dir, String id) {
        try (Stream<Path> walk = Files.list(dir)) {
            return walk.filter(Files::isRegularFile).filter(p -> {
                if (!p.getFileName().toString().endsWith(".yml")) return false;
                try {
                    return id.equals(yaml.readTree(p.toFile()).path("id").asText(""))
                            || p.getFileName().toString().startsWith(id);
                } catch (IOException e) {
                    return false;
                }
            }).findFirst().orElse(null);
        } catch (IOException e) {
            return null;
        }
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
