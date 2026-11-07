package org.apache.datawise.community.duckdb;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/**
 * Local DuckDB sidecar for ad-hoc SQL over a db file and/or a Parquet/CSV folder.
 */
public final class DuckDbPluginMain extends StdioJsonRpcSidecar {

    private static final int MAX_ROWS = 500;

    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public static void main(String[] args) throws Exception {
        Class.forName("org.duckdb.DuckDBDriver");
        new DuckDbPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("ok", true);
                ok.put("name", "DuckDB Files");
                yield ok;
            }
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> disconnect(params.path("connection").path("id").asText("anon"));
            case "connection/action" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                yield ok;
            }
            case "context-menu/invoke" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("message", "Open the DuckDB workbench from the connection.");
                yield ok;
            }
            case "duckdb/tables" -> tables(require(params));
            case "duckdb/list-files" -> listFiles(require(params));
            case "duckdb/register" -> register(require(params), params.path("path").asText(""),
                    params.path("viewName").asText(""));
            case "duckdb/query" -> query(require(params), params.path("sql").asText(""),
                    params.path("maxRows").asInt(MAX_ROWS));
            default -> throw new UnknownMethodException(method);
        };
    }

    private Session require(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) {
            id = params.path("connection").path("id").asText("anon");
        }
        Session s = sessions.get(id);
        if (s == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode() && !conn.isNull()) {
                s = openSession(conn);
                sessions.put(s.id, s);
            }
        }
        if (s == null) {
            throw new IllegalArgumentException("Connection not open: " + id);
        }
        return s;
    }

    private ObjectNode test(JsonNode connection) {
        try (Session s = openSession(connection)) {
            try (Statement st = s.connection.createStatement();
                 ResultSet rs = st.executeQuery("SELECT 1 AS ok")) {
                rs.next();
                ObjectNode out = mapper().createObjectNode();
                out.put("success", true);
                out.put("message", "DuckDB OK · " + s.databasePath
                        + (s.dataDir.isBlank() ? "" : " · dataDir=" + s.dataDir));
                return out;
            }
        } catch (Exception e) {
            ObjectNode out = mapper().createObjectNode();
            out.put("success", false);
            out.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
            return out;
        }
    }

    private ObjectNode connect(JsonNode connection) {
        Session s = openSession(connection);
        sessions.put(s.id, s);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("handle", "duckdb-" + s.id);
        return out;
    }

    private ObjectNode disconnect(String id) {
        Session s = sessions.remove(id);
        if (s != null) {
            s.close();
        }
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        return out;
    }

    private ObjectNode tables(Session s) {
        try {
            ObjectNode out = mapper().createObjectNode();
            ArrayNode arr = out.putArray("tables");
            try (Statement st = s.connection.createStatement();
                 ResultSet rs = st.executeQuery(
                         "SELECT table_schema, table_name, table_type FROM information_schema.tables "
                                 + "WHERE table_schema NOT IN ('information_schema','pg_catalog') "
                                 + "ORDER BY 1,2")) {
                while (rs.next()) {
                    ObjectNode row = arr.addObject();
                    row.put("schema", rs.getString(1));
                    row.put("name", rs.getString(2));
                    row.put("type", rs.getString(3));
                }
            }
            out.put("count", arr.size());
            return out;
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private ObjectNode listFiles(Session s) {
        ObjectNode out = mapper().createObjectNode();
        ArrayNode arr = out.putArray("files");
        if (s.dataDir.isBlank()) {
            out.put("count", 0);
            out.put("message", "dataDir is empty");
            return out;
        }
        Path root = Path.of(s.dataDir);
        if (!Files.isDirectory(root)) {
            out.put("count", 0);
            out.put("message", "dataDir is not a directory");
            return out;
        }
        try (Stream<Path> walk = Files.walk(root, 3)) {
            walk.filter(Files::isRegularFile)
                    .filter(p -> {
                        String n = p.getFileName().toString().toLowerCase(Locale.ROOT);
                        return n.endsWith(".parquet") || n.endsWith(".csv") || n.endsWith(".tsv")
                                || n.endsWith(".json") || n.endsWith(".jsonl");
                    })
                    .limit(200)
                    .forEach(p -> {
                        ObjectNode item = arr.addObject();
                        item.put("path", p.toAbsolutePath().toString());
                        item.put("name", p.getFileName().toString());
                        item.put("relative", root.relativize(p).toString().replace('\\', '/'));
                    });
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
        out.put("count", arr.size());
        return out;
    }

    private ObjectNode register(Session s, String path, String viewName) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("path is required");
        }
        Path file = Path.of(path);
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("Not a file: " + path);
        }
        String name = viewName == null || viewName.isBlank() ? sanitizeViewName(file.getFileName().toString()) : viewName;
        String lower = file.getFileName().toString().toLowerCase(Locale.ROOT);
        String escaped = path.replace("'", "''");
        String sql;
        if (lower.endsWith(".parquet")) {
            sql = "CREATE OR REPLACE VIEW " + quoteIdent(name) + " AS SELECT * FROM read_parquet('" + escaped + "')";
        } else if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
            sql = "CREATE OR REPLACE VIEW " + quoteIdent(name) + " AS SELECT * FROM read_csv_auto('" + escaped + "')";
        } else if (lower.endsWith(".json") || lower.endsWith(".jsonl")) {
            sql = "CREATE OR REPLACE VIEW " + quoteIdent(name) + " AS SELECT * FROM read_json_auto('" + escaped + "')";
        } else {
            throw new IllegalArgumentException("Unsupported file type: " + path);
        }
        try (Statement st = s.connection.createStatement()) {
            st.execute(sql);
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("viewName", name);
        out.put("sql", sql);
        return out;
    }

    private ObjectNode query(Session s, String sql, int maxRows) {
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        int limit = Math.max(1, Math.min(maxRows > 0 ? maxRows : MAX_ROWS, 2000));
        try (Statement st = s.connection.createStatement()) {
            boolean hasResult = st.execute(sql);
            ObjectNode out = mapper().createObjectNode();
            if (!hasResult) {
                out.put("kind", "update");
                out.put("updateCount", st.getUpdateCount());
                return out;
            }
            try (ResultSet rs = st.getResultSet()) {
                ResultSetMetaData md = rs.getMetaData();
                int cols = md.getColumnCount();
                ArrayNode columns = out.putArray("columns");
                List<String> names = new ArrayList<>();
                for (int i = 1; i <= cols; i++) {
                    String label = md.getColumnLabel(i);
                    names.add(label);
                    ObjectNode c = columns.addObject();
                    c.put("name", label);
                    c.put("type", md.getColumnTypeName(i));
                }
                ArrayNode rows = out.putArray("rows");
                int n = 0;
                boolean truncated = false;
                while (rs.next()) {
                    if (n >= limit) {
                        truncated = true;
                        break;
                    }
                    ArrayNode row = rows.addArray();
                    for (int i = 1; i <= cols; i++) {
                        Object v = rs.getObject(i);
                        if (v == null) row.addNull();
                        else if (v instanceof Number num) row.add(mapper().valueToTree(num));
                        else if (v instanceof Boolean b) row.add(b);
                        else row.add(String.valueOf(v));
                    }
                    n++;
                }
                out.put("kind", "result");
                out.put("rowCount", n);
                out.put("truncated", truncated);
                out.put("maxRows", limit);
                return out;
            }
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private Session openSession(JsonNode connection) {
        JsonNode cfg = connection.path("external_config");
        if (cfg.isMissingNode() || cfg.isNull()) {
            cfg = connection.path("config");
        }
        String id = connection.path("id").asText("anon");
        String databasePath = firstNonBlank(
                cfg.path("databasePath").asText(""),
                connection.path("database").asText(""),
                ":memory:");
        String dataDir = cfg.path("dataDir").asText("");
        boolean readOnly = parseBool(cfg.path("readOnly"), true);
        if (":memory:".equals(databasePath)) {
            readOnly = false;
        }
        try {
            Properties props = new Properties();
            if (readOnly) {
                props.setProperty("duckdb.read_only", "true");
            }
            Connection jdbc = DriverManager.getConnection("jdbc:duckdb:" + databasePath, props);
            Session s = new Session(id, databasePath, dataDir, jdbc);
            if (!dataDir.isBlank()) {
                autoRegister(s);
            }
            return s;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to open DuckDB: " + e.getMessage(), e);
        }
    }

    private void autoRegister(Session s) {
        Path root = Path.of(s.dataDir);
        if (!Files.isDirectory(root)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(root, 2)) {
            walk.filter(Files::isRegularFile)
                    .filter(p -> {
                        String n = p.getFileName().toString().toLowerCase(Locale.ROOT);
                        return n.endsWith(".parquet") || n.endsWith(".csv");
                    })
                    .limit(40)
                    .forEach(p -> {
                        try {
                            register(s, p.toAbsolutePath().toString(), "");
                        } catch (Exception ignored) {
                            // skip bad files on connect
                        }
                    });
        } catch (Exception ignored) {
            // optional
        }
    }

    private static String sanitizeViewName(String fileName) {
        String base = fileName;
        int dot = base.lastIndexOf('.');
        if (dot > 0) base = base.substring(0, dot);
        base = base.replaceAll("[^A-Za-z0-9_]", "_");
        if (base.isBlank() || Character.isDigit(base.charAt(0))) {
            base = "v_" + base;
        }
        return base;
    }

    private static String quoteIdent(String name) {
        return "\"" + name.replace("\"", "\"\"") + "\"";
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return "";
    }

    private static boolean parseBool(JsonNode node, boolean defaultValue) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return defaultValue;
        }
        if (node.isBoolean()) {
            return node.asBoolean();
        }
        String raw = node.asText("").trim().toLowerCase(Locale.ROOT);
        if (raw.isEmpty()) {
            return defaultValue;
        }
        return raw.equals("true") || raw.equals("1") || raw.equals("yes");
    }

    private static final class Session implements AutoCloseable {
        final String id;
        final String databasePath;
        final String dataDir;
        final Connection connection;

        Session(String id, String databasePath, String dataDir, Connection connection) {
            this.id = id;
            this.databasePath = databasePath;
            this.dataDir = dataDir;
            this.connection = connection;
        }

        @Override
        public void close() {
            try {
                connection.close();
            } catch (Exception ignored) {
                // ignore
            }
        }
    }
}
