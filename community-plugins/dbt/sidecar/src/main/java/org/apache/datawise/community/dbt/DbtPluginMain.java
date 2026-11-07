package org.apache.datawise.community.dbt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * dbt project sidecar: bind a local project, list models, compile / run via CLI.
 */
public final class DbtPluginMain extends StdioJsonRpcSidecar {

    private static final Pattern REF_PATTERN = Pattern.compile("\\{\\{\\s*ref\\(\\s*['\"]([^'\"]+)['\"]");
    private static final Set<String> COMMANDS = Set.of("compile", "run", "test", "build", "parse");

    private final Map<String, ConnectionState> connections = new ConcurrentHashMap<>();
    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private volatile Path pluginDataDir;

    public static void main(String[] args) throws Exception {
        new DbtPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> initialize(params);
            case "connection/test" -> testConnection(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> {
                connections.remove(params.path("connection").path("id").asText("anon"));
                yield ok("success", true);
            }
            case "connection/action" -> connectionAction(params);
            case "context-menu/invoke" -> contextMenu(params);
            case "dbt/status" -> status(requireState(params));
            case "dbt/list-models" -> listModels(requireState(params), params.path("select").asText(""));
            case "dbt/source-sql" -> sourceSql(requireState(params), params.path("modelName").asText(""));
            case "dbt/refs" -> refs(requireState(params), params.path("modelName").asText(""));
            case "dbt/find" -> findModels(requireState(params), params.path("query").asText(""));
            case "dbt/run-results" -> runResults(requireState(params));
            case "dbt/tools" -> tools();
            case "dbt/demo-path" -> demoPath();
            case "dbt/compile", "dbt/run", "dbt/test", "dbt/build", "dbt/parse" -> {
                String command = method.substring("dbt/".length());
                String select = params.path("select").asText("");
                if ("parse".equals(command)) {
                    yield runDbt(requireState(params), command, select.isBlank() ? null : select);
                }
                yield runDbt(requireState(params), command, select);
            }
            case "dbt/compiled-sql" -> compiledSql(requireState(params), params.path("uniqueId").asText(""),
                    params.path("modelName").asText(""));
            default -> throw new UnknownMethodException(method);
        };
    }

    private ConnectionState requireState(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) {
            id = params.path("connection").path("id").asText("anon");
        }
        ConnectionState state = connections.get(id);
        if (state == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode() && !conn.isNull()) {
                state = ConnectionState.from(conn);
                connections.put(state.id, state);
            }
        }
        if (state == null) {
            throw new IllegalArgumentException("Connection not open: " + id);
        }
        return state;
    }

    private ObjectNode testConnection(JsonNode connection) {
        ConnectionState state = ConnectionState.from(connection);
        Path project = Path.of(state.projectPath);
        if (!Files.isDirectory(project)) {
            return fail("Project path is not a directory: " + state.projectPath);
        }
        if (!Files.isRegularFile(project.resolve("dbt_project.yml"))
                && !Files.isRegularFile(project.resolve("dbt_project.yaml"))) {
            return fail("dbt_project.yml not found under " + state.projectPath);
        }
        CliResult which = exec(List.of(state.dbtBinary, "--version"), project, state, 30);
        ObjectNode out = mapper().createObjectNode();
        out.put("projectOk", true);
        out.put("dbtAvailable", which.exitCode == 0);
        if (which.exitCode == 0) {
            out.put("success", true);
            out.put("message", "dbt project OK · " + firstLine(which.stdout + which.stderr));
        } else {
            out.put("success", true);
            out.put("warning", true);
            out.put("message", "Project found. dbt CLI is not available, so compile/run/test stay disabled. "
                    + "You can still browse model files. " + firstLine(which.stderr.isBlank() ? which.stdout : which.stderr));
        }
        out.put("stdout", which.stdout);
        out.put("stderr", which.stderr);
        out.put("demoPath", demoProjectDir().toString());
        return out;
    }

    private ObjectNode connect(JsonNode connection) {
        ConnectionState state = ConnectionState.from(connection);
        connections.put(state.id, state);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("handle", "dbt-" + state.id);
        return out;
    }

    private ObjectNode status(ConnectionState state) {
        ObjectNode out = mapper().createObjectNode();
        Path project = Path.of(state.projectPath);
        out.put("projectPath", state.projectPath);
        out.put("target", state.target);
        out.put("projectExists", Files.isDirectory(project));
        String projectName = readProjectName(project);
        if (projectName != null) {
            out.put("projectName", projectName);
        }
        CliResult which = exec(List.of(state.dbtBinary, "--version"), project, state, 30);
        out.put("dbtAvailable", which.exitCode == 0);
        out.put("dbtVersion", firstLine(which.stdout + which.stderr));
        out.set("diagnosis", diagnose(state));
        out.put("demoPath", demoProjectDir().toString());
        return out;
    }

    private ObjectNode initialize(JsonNode params) {
        String dir = params.path("pluginDataDir").asText("");
        if (!dir.isBlank()) {
            pluginDataDir = Path.of(dir);
        }
        ObjectNode ok = mapper().createObjectNode();
        ok.put("ok", true);
        ok.put("name", "dbt Project");
        ok.put("demoPath", demoProjectDir().toString());
        return ok;
    }

    private ObjectNode connectionAction(JsonNode params) {
        String actionId = params.path("action").path("id").asText(params.path("actionId").asText(""));
        if ("use-demo".equals(actionId)) {
            Path demo = demoProjectDir();
            ObjectNode out = mapper().createObjectNode();
            out.put("success", true);
            out.put("message", "Filled the bundled demo project. Save the connection, then open the workbench.");
            ObjectNode fields = out.putObject("fieldValues");
            fields.put("projectPath", demo.toString());
            if (Files.isRegularFile(demo.resolve("profiles.yml"))) {
                fields.put("profilesDir", demo.toString());
            }
            return out;
        }
        return ok("success", true, "message", "ok");
    }

    private ObjectNode contextMenu(JsonNode params) {
        String label = params.path("label").asText("");
        String nodeType = params.path("nodeType").asText("");
        ObjectNode out = mapper().createObjectNode();
        if (!"table".equals(nodeType) && !"view".equals(nodeType)) {
            out.put("message", "Open the dbt workbench from a dbt project connection.");
            return out;
        }
        String table = shortName(label);
        List<String> hits = new ArrayList<>();
        for (ConnectionState state : connections.values()) {
            for (ModelInfo model : discoverModels(Path.of(state.projectPath))) {
                if (model.name.equalsIgnoreCase(table)) {
                    hits.add(state.projectPath + " · " + model.relativePath);
                }
            }
        }
        if (hits.isEmpty()) {
            out.put("message", connections.isEmpty()
                    ? "Open a dbt project workbench once, then search this table again."
                    : "No dbt model named " + table + " in open projects.");
            return out;
        }
        out.put("message", "dbt models for " + table + ": " + String.join("; ", hits));
        out.put("query", table);
        return out;
    }

    private ObjectNode diagnose(ConnectionState state) {
        Path project = Path.of(state.projectPath);
        boolean exists = Files.isDirectory(project);
        boolean yml = exists && (Files.isRegularFile(project.resolve("dbt_project.yml"))
                || Files.isRegularFile(project.resolve("dbt_project.yaml")));
        int files = discoverModels(project).size();
        CliResult which = exec(List.of(state.dbtBinary, "--version"), project, state, 20);
        ObjectNode n = mapper().createObjectNode();
        n.put("projectPath", state.projectPath);
        n.put("projectExists", exists);
        n.put("hasProjectYml", yml);
        n.put("modelFileCount", files);
        n.put("dbtAvailable", which.exitCode == 0);
        if (which.exitCode != 0) {
            n.put("dbtVersionError", firstLine(which.stderr.isBlank() ? which.stdout : which.stderr));
        } else {
            n.put("dbtVersion", firstLine(which.stdout + which.stderr));
        }
        return n;
    }

    private static String reasonFor(ObjectNode diagnosis, int count, String lsError) {
        if (!diagnosis.path("projectExists").asBoolean(false)) return "missing-path";
        if (!diagnosis.path("hasProjectYml").asBoolean(false)) return "not-a-project";
        if (count == 0 && diagnosis.path("modelFileCount").asInt(0) == 0) return "no-models";
        if (!lsError.isBlank()) return "dbt-ls-failed";
        if (!diagnosis.path("dbtAvailable").asBoolean(false)) return "dbt-missing";
        return "ok";
    }

    private static String hintFor(String reason) {
        return switch (reason) {
            case "missing-path" -> "Edit the connection and set Project path to a folder that exists.";
            case "not-a-project" -> "Point Project path at the folder that contains dbt_project.yml, or use the demo project.";
            case "no-models" -> "This project has no models/**/*.sql files yet.";
            case "dbt-missing" -> "Models are listed from disk. Install dbt to compile, test, or run.";
            case "dbt-ls-failed" -> "dbt ls failed. Showing files under models/ instead. Check target and profiles.";
            default -> "";
        };
    }

    private ObjectNode sourceSql(ConnectionState state, String modelName) {
        ModelInfo model = findModelFile(state, modelName);
        ObjectNode out = mapper().createObjectNode();
        if (model == null) {
            out.put("found", false);
            out.put("message", "Model file not found: " + modelName);
            return out;
        }
        try {
            String sql = Files.readString(Path.of(state.projectPath).resolve(model.relativePath), StandardCharsets.UTF_8);
            out.put("found", true);
            out.put("modelName", model.name);
            out.put("path", model.relativePath);
            out.put("sql", sql);
            return out;
        } catch (IOException e) {
            out.put("found", false);
            out.put("message", e.getMessage());
            return out;
        }
    }

    private ObjectNode refs(ConnectionState state, String modelName) {
        List<ModelInfo> models = discoverModels(Path.of(state.projectPath));
        ModelInfo self = findModelFile(state, modelName);
        ObjectNode out = mapper().createObjectNode();
        out.put("modelName", modelName);
        ArrayNode upstream = out.putArray("upstream");
        ArrayNode downstream = out.putArray("downstream");
        if (self == null) {
            out.put("found", false);
            return out;
        }
        out.put("found", true);
        Set<String> refs = refsIn(Path.of(state.projectPath).resolve(self.relativePath));
        refs.forEach(upstream::add);
        for (ModelInfo other : models) {
            if (other.name.equalsIgnoreCase(self.name)) continue;
            if (refsIn(Path.of(state.projectPath).resolve(other.relativePath)).stream()
                    .anyMatch(ref -> ref.equalsIgnoreCase(self.name))) {
                downstream.add(other.name);
            }
        }
        mergeManifestEdges(state, self.name, upstream, downstream);
        return out;
    }

    private ObjectNode findModels(ConnectionState state, String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        ObjectNode out = mapper().createObjectNode();
        ArrayNode hits = out.putArray("models");
        if (q.isBlank()) {
            out.put("count", 0);
            return out;
        }
        String table = shortName(q);
        for (ModelInfo model : discoverModels(Path.of(state.projectPath))) {
            if (model.name.equalsIgnoreCase(table)
                    || model.name.toLowerCase(Locale.ROOT).contains(q)
                    || model.relativePath.toLowerCase(Locale.ROOT).contains(q)) {
                ObjectNode item = hits.addObject();
                item.put("name", model.name);
                item.put("path", model.relativePath);
            }
        }
        out.put("count", hits.size());
        return out;
    }

    private ObjectNode runResults(ConnectionState state) {
        return readRunResults(Path.of(state.projectPath));
    }

    private ObjectNode readRunResults(Path project) {
        ObjectNode out = mapper().createObjectNode();
        Path file = project.resolve("target").resolve("run_results.json");
        if (!Files.isRegularFile(file)) {
            out.put("found", false);
            return out;
        }
        try {
            JsonNode root = mapper().readTree(file.toFile());
            out.put("found", true);
            JsonNode results = root.path("results");
            int ok = 0;
            int fail = 0;
            ArrayNode items = out.putArray("results");
            if (results.isArray()) {
                for (JsonNode row : results) {
                    String status = row.path("status").asText("");
                    if ("success".equals(status) || "pass".equals(status)) ok++;
                    else fail++;
                    if (items.size() < 30) {
                        ObjectNode item = items.addObject();
                        item.put("uniqueId", row.path("unique_id").asText(""));
                        item.put("status", status);
                        item.put("message", row.path("message").asText(""));
                    }
                }
            }
            out.put("successCount", ok);
            out.put("failureCount", fail);
            out.put("elapsed", root.path("elapsed_time").asDouble(0));
            return out;
        } catch (IOException e) {
            out.put("found", false);
            out.put("message", e.getMessage());
            return out;
        }
    }

    private ObjectNode tools() {
        ObjectNode out = mapper().createObjectNode();
        ArrayNode tools = out.putArray("tools");
        tool(tools, "dbt_list_models", "dbt/list-models", "List models in the bound project");
        tool(tools, "dbt_compile", "dbt/compile", "Compile one selector and return SQL");
        tool(tools, "dbt_test", "dbt/test", "Run dbt tests for a selector");
        tool(tools, "dbt_build", "dbt/build", "Build one selector");
        tool(tools, "dbt_find", "dbt/find", "Find a model by table or file name");
        out.put("note", "Invoke these through the community plugin RPC bridge. The host MCP catalog does not forward plugin methods.");
        return out;
    }

    private ObjectNode demoPath() {
        ObjectNode out = mapper().createObjectNode();
        out.put("path", demoProjectDir().toString());
        out.put("exists", Files.isRegularFile(demoProjectDir().resolve("dbt_project.yml")));
        return out;
    }

    private void tool(ArrayNode tools, String name, String method, String description) {
        ObjectNode tool = tools.addObject();
        tool.put("name", name);
        tool.put("method", method);
        tool.put("description", description);
    }

    private ModelInfo findModelFile(ConnectionState state, String modelName) {
        String key = shortName(modelName);
        for (ModelInfo model : discoverModels(Path.of(state.projectPath))) {
            if (model.name.equalsIgnoreCase(key)) return model;
        }
        return null;
    }

    private Set<String> refsIn(Path file) {
        Set<String> refs = new LinkedHashSet<>();
        try {
            Matcher matcher = REF_PATTERN.matcher(Files.readString(file, StandardCharsets.UTF_8));
            while (matcher.find()) refs.add(matcher.group(1));
        } catch (IOException ignored) {
            // skip
        }
        return refs;
    }

    private void mergeManifestEdges(ConnectionState state, String modelName, ArrayNode upstream, ArrayNode downstream) {
        Path manifest = Path.of(state.projectPath).resolve("target").resolve("manifest.json");
        if (!Files.isRegularFile(manifest)) return;
        try {
            JsonNode nodes = mapper().readTree(manifest.toFile()).path("nodes");
            if (!nodes.isObject()) return;
            String selfId = null;
            Map<String, String> idToName = new java.util.HashMap<>();
            nodes.fields().forEachRemaining(entry -> {
                JsonNode node = entry.getValue();
                if ("model".equals(node.path("resource_type").asText())) {
                    idToName.put(entry.getKey(), node.path("name").asText(""));
                }
            });
            for (Map.Entry<String, String> entry : idToName.entrySet()) {
                if (entry.getValue().equalsIgnoreCase(modelName)) selfId = entry.getKey();
            }
            if (selfId == null) return;
            JsonNode self = nodes.path(selfId);
            addNames(upstream, self.path("depends_on").path("nodes"), idToName);
            for (Map.Entry<String, String> entry : idToName.entrySet()) {
                JsonNode deps = nodes.path(entry.getKey()).path("depends_on").path("nodes");
                if (deps.isArray()) {
                    for (JsonNode dep : deps) {
                        if (selfId.equals(dep.asText())) downstream.add(entry.getValue());
                    }
                }
            }
        } catch (IOException ignored) {
            // source refs remain
        }
    }

    private static void addNames(ArrayNode into, JsonNode ids, Map<String, String> idToName) {
        if (!ids.isArray()) return;
        for (JsonNode id : ids) {
            String name = idToName.get(id.asText());
            if (name != null && !name.isBlank()) into.add(name);
        }
    }

    private Path demoProjectDir() {
        Path installed = Path.of("").toAbsolutePath().resolve("demo-project");
        if (Files.isRegularFile(installed.resolve("dbt_project.yml"))) {
            return installed;
        }
        Path dest = (pluginDataDir != null ? pluginDataDir : Path.of("").toAbsolutePath())
                .resolve("demo-project");
        extractDemo(dest);
        return dest;
    }

    private void extractDemo(Path dest) {
        String[] files = {
                "dbt_project.yml",
                "profiles.yml",
                "models/schema.yml",
                "models/staging/stg_customers.sql",
                "models/marts/customers.sql"
        };
        for (String relative : files) {
            try (var in = DbtPluginMain.class.getResourceAsStream("/demo-project/" + relative)) {
                if (in == null) continue;
                Path target = dest.resolve(relative);
                Files.createDirectories(target.getParent());
                Files.copy(in, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
                // best effort
            }
        }
    }

    private ObjectNode listModels(ConnectionState state, String select) {
        Path project = Path.of(state.projectPath);
        ObjectNode diagnosis = diagnose(state);
        List<ModelInfo> models = discoverModels(project);
        CliResult ls = null;
        boolean tryCli = diagnosis.path("dbtAvailable").asBoolean(false);
        if (tryCli) {
            List<String> args = new ArrayList<>(buildDbtArgs(state, "ls", "--resource-type", "model", "--output", "json"));
            if (select != null && !select.isBlank()) {
                args.add("--select");
                args.add(select.trim());
            }
            ls = exec(args, project, state, 120);
        }
        ObjectNode out = mapper().createObjectNode();
        out.set("diagnosis", diagnosis);
        ArrayNode arr = out.putArray("models");
        if (ls != null && ls.exitCode == 0 && !ls.stdout.isBlank()) {
            for (String line : ls.stdout.split("\\R")) {
                String trimmed = line.trim();
                if (!trimmed.startsWith("{")) continue;
                try {
                    JsonNode node = mapper().readTree(trimmed);
                    ObjectNode item = arr.addObject();
                    item.put("name", text(node, "name"));
                    item.put("uniqueId", text(node, "unique_id"));
                    item.put("path", text(node, "original_file_path", "path"));
                    item.put("packageName", text(node, "package_name"));
                    item.put("resourceType", text(node, "resource_type", "model"));
                } catch (IOException ignored) {
                    // fall through to filesystem discovery below if needed
                }
            }
        }
        if (arr.isEmpty()) {
            String needle = select == null ? "" : shortName(select).toLowerCase(Locale.ROOT);
            for (ModelInfo m : models) {
                if (!needle.isBlank()
                        && !m.name.toLowerCase(Locale.ROOT).contains(needle)
                        && !m.relativePath.toLowerCase(Locale.ROOT).contains(needle)) {
                    continue;
                }
                ObjectNode item = arr.addObject();
                item.put("name", m.name);
                item.put("uniqueId", "model." + m.name);
                item.put("path", m.relativePath);
                item.put("resourceType", "model");
            }
            out.put("source", "filesystem");
            if (ls != null && ls.exitCode != 0) {
                out.put("dbtLsError", firstLine(ls.stderr.isBlank() ? ls.stdout : ls.stderr));
            }
        } else {
            out.put("source", "dbt-ls");
        }
        out.put("count", arr.size());
        out.put("reason", reasonFor(diagnosis, arr.size(), out.path("dbtLsError").asText("")));
        out.put("hint", hintFor(out.path("reason").asText("")));
        return out;
    }

    private ObjectNode runDbt(ConnectionState state, String command, String select) {
        if (!COMMANDS.contains(command)) {
            return fail("Unsupported dbt command: " + command);
        }
        if (!"parse".equals(command) && (select == null || select.isBlank())) {
            return fail("select is required (model name or selector)");
        }
        Path project = Path.of(state.projectPath);
        List<String> args = "parse".equals(command) || select == null || select.isBlank()
                ? buildDbtArgs(state, command)
                : buildDbtArgs(state, command, "--select", select);
        CliResult result = exec(args, project, state, 600);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", result.exitCode == 0);
        out.put("exitCode", result.exitCode);
        out.put("command", String.join(" ", args));
        out.put("stdout", result.stdout);
        out.put("stderr", result.stderr);
        if (result.exitCode == 0 && "compile".equals(command) && select != null) {
            String sql = findCompiledSql(project, state, select);
            if (sql != null) {
                out.put("compiledSql", sql);
            }
        }
        out.set("runResults", readRunResults(project));
        return out;
    }

    private ObjectNode compiledSql(ConnectionState state, String uniqueId, String modelName) {
        Path project = Path.of(state.projectPath);
        String key = !modelName.isBlank() ? modelName : shortName(uniqueId);
        String sql = findCompiledSql(project, state, key);
        ObjectNode out = mapper().createObjectNode();
        if (sql == null) {
            out.put("found", false);
            out.put("message", "Compiled SQL not found. Run dbt/compile first.");
            return out;
        }
        out.put("found", true);
        out.put("modelName", key);
        out.put("sql", sql);
        return out;
    }

    private String findCompiledSql(Path project, ConnectionState state, String select) {
        String name = shortName(select);
        Path target = project.resolve("target").resolve("compiled");
        if (!Files.isDirectory(target)) {
            return null;
        }
        try (Stream<Path> walk = Files.walk(target)) {
            return walk
                    .filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().equalsIgnoreCase(name + ".sql"))
                    .sorted(Comparator.comparing(Path::toString))
                    .findFirst()
                    .map(p -> {
                        try {
                            return Files.readString(p, StandardCharsets.UTF_8);
                        } catch (IOException e) {
                            return null;
                        }
                    })
                    .orElse(null);
        } catch (IOException e) {
            return null;
        }
    }

    private List<String> buildDbtArgs(ConnectionState state, String command, String... extra) {
        List<String> args = new ArrayList<>();
        args.add(state.dbtBinary);
        args.add(command);
        args.add("--project-dir");
        args.add(state.projectPath);
        if (!state.profilesDir.isBlank()) {
            args.add("--profiles-dir");
            args.add(state.profilesDir);
        }
        if (!state.target.isBlank()) {
            args.add("--target");
            args.add(state.target);
        }
        for (String e : extra) {
            args.add(e);
        }
        return args;
    }

    private List<ModelInfo> discoverModels(Path project) {
        List<ModelInfo> out = new ArrayList<>();
        Path models = project.resolve("models");
        if (!Files.isDirectory(models)) {
            return out;
        }
        try (Stream<Path> walk = Files.walk(models)) {
            walk.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql"))
                    .forEach(p -> {
                        String rel = project.relativize(p).toString().replace('\\', '/');
                        String name = p.getFileName().toString();
                        name = name.substring(0, name.length() - 4);
                        out.add(new ModelInfo(name, rel));
                    });
        } catch (IOException ignored) {
            // empty list
        }
        out.sort(Comparator.comparing(m -> m.name));
        return out;
    }

    private String readProjectName(Path project) {
        Path yml = Files.isRegularFile(project.resolve("dbt_project.yml"))
                ? project.resolve("dbt_project.yml")
                : project.resolve("dbt_project.yaml");
        if (!Files.isRegularFile(yml)) {
            return null;
        }
        try {
            JsonNode root = yaml.readTree(yml.toFile());
            return root.path("name").asText(null);
        } catch (IOException e) {
            return null;
        }
    }

    private CliResult exec(List<String> command, Path cwd, ConnectionState state, int timeoutSec) {
        ProcessBuilder pb = new ProcessBuilder(command);
        if (Files.isDirectory(cwd)) {
            pb.directory(cwd.toFile());
        }
        pb.redirectErrorStream(false);
        Map<String, String> env = pb.environment();
        if (!state.profilesDir.isBlank()) {
            env.put("DBT_PROFILES_DIR", state.profilesDir);
        }
        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        try {
            Process p = pb.start();
            Thread tOut = drain(p.getInputStream(), stdout);
            Thread tErr = drain(p.getErrorStream(), stderr);
            boolean finished = p.waitFor(timeoutSec, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return new CliResult(124, stdout.toString(), stderr + "\n(timeout after " + timeoutSec + "s)");
            }
            tOut.join(2000);
            tErr.join(2000);
            return new CliResult(p.exitValue(), stdout.toString(), stderr.toString());
        } catch (Exception e) {
            return new CliResult(1, stdout.toString(), e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    private static Thread drain(java.io.InputStream in, StringBuilder into) {
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    into.append(line).append('\n');
                }
            } catch (IOException ignored) {
                // process closed
            }
        }, "dbt-drain");
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static String shortName(String select) {
        if (select == null) return "";
        String s = select.trim();
        int dot = s.lastIndexOf('.');
        if (dot >= 0 && dot < s.length() - 1) {
            s = s.substring(dot + 1);
        }
        if (s.toLowerCase(Locale.ROOT).endsWith(".sql")) {
            s = s.substring(0, s.length() - 4);
        }
        return s;
    }

    private static String text(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode v = node.get(key);
            if (v != null && !v.isNull() && !v.asText("").isBlank()) {
                return v.asText();
            }
        }
        return "";
    }

    private static String firstLine(String text) {
        if (text == null || text.isBlank()) return "";
        int nl = text.indexOf('\n');
        return (nl < 0 ? text : text.substring(0, nl)).trim();
    }

    private ObjectNode ok(Object... kv) {
        ObjectNode n = mapper().createObjectNode();
        n.put("ok", true);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object key = kv[i];
            Object val = kv[i + 1];
            if (val instanceof Boolean b) n.put(String.valueOf(key), b);
            else if (val instanceof Integer num) n.put(String.valueOf(key), num);
            else n.put(String.valueOf(key), String.valueOf(val));
        }
        return n;
    }

    private ObjectNode fail(String message) {
        ObjectNode n = mapper().createObjectNode();
        n.put("success", false);
        n.put("message", message);
        return n;
    }

    private record ModelInfo(String name, String relativePath) {}

    private record CliResult(int exitCode, String stdout, String stderr) {}

    private static final class ConnectionState {
        final String id;
        final String projectPath;
        final String profilesDir;
        final String target;
        final String dbtBinary;

        ConnectionState(String id, String projectPath, String profilesDir, String target, String dbtBinary) {
            this.id = id;
            this.projectPath = projectPath;
            this.profilesDir = profilesDir;
            this.target = target;
            this.dbtBinary = dbtBinary;
        }

        static ConnectionState from(JsonNode connection) {
            JsonNode cfg = connection.path("external_config");
            if (cfg.isMissingNode() || cfg.isNull()) {
                cfg = connection.path("config");
            }
            String id = connection.path("id").asText("anon");
            String projectPath = firstNonBlank(
                    cfg.path("projectPath").asText(""),
                    connection.path("database").asText(""),
                    connection.path("host").asText(""));
            String profilesDir = cfg.path("profilesDir").asText("");
            String target = cfg.path("target").asText("dev");
            String dbtBinary = cfg.path("dbtBinary").asText("dbt");
            if (dbtBinary.isBlank()) dbtBinary = "dbt";
            if (projectPath.isBlank()) {
                throw new IllegalArgumentException("projectPath is required");
            }
            return new ConnectionState(id, projectPath, profilesDir, target, dbtBinary);
        }

        private static String firstNonBlank(String... values) {
            for (String v : values) {
                if (v != null && !v.isBlank()) return v;
            }
            return "";
        }
    }
}
