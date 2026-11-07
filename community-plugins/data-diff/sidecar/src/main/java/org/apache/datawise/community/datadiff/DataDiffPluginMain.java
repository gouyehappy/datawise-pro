package org.apache.datawise.community.datadiff;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Cross-environment row-count + key-sample diff over two JDBC endpoints.
 * Bundled drivers: PostgreSQL, MySQL. Other JDBC URLs need a driver on the JVM classpath.
 */
public final class DataDiffPluginMain extends StdioJsonRpcSidecar {

    private static final Pattern SAFE_IDENT = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*){0,2}$");
    private static final Pattern SAFE_KEY = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
    private static final int SAMPLE_LIMIT = 50;

    private final Map<String, Workspace> workspaces = new ConcurrentHashMap<>();

    public static void main(String[] args) throws Exception {
        Class.forName("org.postgresql.Driver");
        Class.forName("com.mysql.cj.jdbc.Driver");
        new DataDiffPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("ok", true);
                ok.put("name", "Data Diff");
                yield ok;
            }
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> {
                workspaces.remove(params.path("connection").path("id").asText("anon"));
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                yield ok;
            }
            case "connection/action" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("success", true);
                yield ok;
            }
            case "context-menu/invoke" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("message", "Open the data-diff workbench from the connection.");
                yield ok;
            }
            case "result-view/open" -> {
                ObjectNode ok = mapper().createObjectNode();
                ok.put("message", "Open a data-diff connection and paste the SQL into the workbench.");
                yield ok;
            }
            case "diff/ping" -> ping(require(params));
            case "diff/compare" -> compare(require(params), params);
            default -> throw new UnknownMethodException(method);
        };
    }

    private Workspace require(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) {
            id = params.path("connection").path("id").asText("anon");
        }
        Workspace w = workspaces.get(id);
        if (w == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode() && !conn.isNull()) {
                w = Workspace.from(conn);
                workspaces.put(w.id, w);
            }
        }
        if (w == null) {
            throw new IllegalArgumentException("Connection not open: " + id);
        }
        return w;
    }

    private ObjectNode test(JsonNode connection) {
        Workspace w = Workspace.from(connection);
        ObjectNode out = mapper().createObjectNode();
        if (w.leftJdbcUrl.isBlank() && w.rightJdbcUrl.isBlank()) {
            out.put("success", true);
            out.put("message", "Using host SQL connections (no JDBC URLs)");
            out.put("defaultTable", w.defaultTable);
            return out;
        }
        try {
            long left = scalarLong(w, true, "SELECT 1");
            long right = scalarLong(w, false, "SELECT 1");
            out.put("success", left == 1 && right == 1);
            out.put("message", "Left and right JDBC OK");
            out.put("defaultTable", w.defaultTable);
            return out;
        } catch (Exception e) {
            out.put("success", false);
            out.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
            return out;
        }
    }

    private ObjectNode connect(JsonNode connection) {
        Workspace w = Workspace.from(connection);
        workspaces.put(w.id, w);
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("handle", "diff-" + w.id);
        out.put("defaultTable", w.defaultTable);
        return out;
    }

    private ObjectNode ping(Workspace w) {
        ObjectNode out = mapper().createObjectNode();
        try {
            out.put("leftOk", scalarLong(w, true, "SELECT 1") == 1);
            out.put("rightOk", scalarLong(w, false, "SELECT 1") == 1);
            out.put("leftJdbcUrl", redactUrl(w.leftJdbcUrl));
            out.put("rightJdbcUrl", redactUrl(w.rightJdbcUrl));
            out.put("defaultTable", w.defaultTable);
            return out;
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private ObjectNode compare(Workspace w, JsonNode params) {
        String table = params.path("table").asText(w.defaultTable);
        String leftSql = params.path("leftSql").asText("");
        String rightSql = params.path("rightSql").asText("");
        String keyColumnsCsv = params.path("keyColumns").asText("");
        int sampleLimit = Math.max(1, Math.min(params.path("sampleLimit").asInt(SAMPLE_LIMIT), 200));

        String leftRel = resolveRelation(table, leftSql);
        String rightRel = resolveRelation(table, rightSql.isBlank() ? leftSql : rightSql);

        try {
            long leftCount = scalarLong(w, true, "SELECT COUNT(*) FROM " + leftRel + " t");
            long rightCount = scalarLong(w, false, "SELECT COUNT(*) FROM " + rightRel + " t");

            ObjectNode out = mapper().createObjectNode();
            out.put("leftCount", leftCount);
            out.put("rightCount", rightCount);
            out.put("countDelta", leftCount - rightCount);
            out.put("leftRelation", leftRel);
            out.put("rightRelation", rightRel);

            List<String> keys = parseKeys(keyColumnsCsv);
            if (!keys.isEmpty()) {
                Set<String> leftKeys = fetchKeySet(w, true, leftRel, keys, sampleLimit * 20);
                Set<String> rightKeys = fetchKeySet(w, false, rightRel, keys, sampleLimit * 20);
                List<String> onlyLeft = new ArrayList<>();
                List<String> onlyRight = new ArrayList<>();
                for (String k : leftKeys) {
                    if (!rightKeys.contains(k)) onlyLeft.add(k);
                }
                for (String k : rightKeys) {
                    if (!leftKeys.contains(k)) onlyRight.add(k);
                }
                ArrayNode ol = out.putArray("onlyInLeft");
                onlyLeft.stream().limit(sampleLimit).forEach(ol::add);
                ArrayNode or = out.putArray("onlyInRight");
                onlyRight.stream().limit(sampleLimit).forEach(or::add);
                out.put("onlyInLeftTotal", onlyLeft.size());
                out.put("onlyInRightTotal", onlyRight.size());
                out.put("keyColumns", String.join(",", keys));
                out.put("keyScanLimited", leftKeys.size() >= sampleLimit * 20 || rightKeys.size() >= sampleLimit * 20);
            } else {
                out.put("message", "Pass keyColumns (comma-separated) for key-level sample diff.");
                ArrayNode leftSample = out.putArray("leftSample");
                ArrayNode rightSample = out.putArray("rightSample");
                fillSample(w, true, leftRel, leftSample, Math.min(5, sampleLimit));
                fillSample(w, false, rightRel, rightSample, Math.min(5, sampleLimit));
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private static String resolveRelation(String table, String sql) {
        if (sql != null && !sql.isBlank()) {
            String trimmed = sql.trim();
            if (trimmed.endsWith(";")) {
                trimmed = trimmed.substring(0, trimmed.length() - 1).trim();
            }
            return "(" + trimmed + ")";
        }
        if (table == null || table.isBlank()) {
            throw new IllegalArgumentException("table or leftSql is required");
        }
        if (!SAFE_IDENT.matcher(table).matches()) {
            throw new IllegalArgumentException("Unsafe table identifier: " + table);
        }
        String[] parts = table.split("\\.");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('.');
            sb.append('"').append(parts[i].replace("\"", "\"\"")).append('"');
        }
        return sb.toString();
    }

    private static List<String> parseKeys(String csv) {
        List<String> keys = new ArrayList<>();
        if (csv == null || csv.isBlank()) return keys;
        for (String part : csv.split(",")) {
            String k = part.trim();
            if (k.isBlank()) continue;
            if (!SAFE_KEY.matcher(k).matches()) {
                throw new IllegalArgumentException("Unsafe key column: " + k);
            }
            keys.add(k);
        }
        return keys;
    }

    private Set<String> fetchKeySet(Workspace w, boolean left, String relation, List<String> keys, int limit)
            throws Exception {
        StringBuilder select = new StringBuilder();
        for (int i = 0; i < keys.size(); i++) {
            if (i > 0) select.append(", ");
            select.append('"').append(keys.get(i)).append('"');
        }
        String sql = "SELECT " + select + " FROM " + relation + " t";
        Set<String> out = new LinkedHashSet<>();
        try (Connection c = w.open(left);
             Statement st = c.createStatement()) {
            st.setMaxRows(limit);
            try (ResultSet rs = st.executeQuery(sql)) {
                while (rs.next() && out.size() < limit) {
                    StringBuilder key = new StringBuilder();
                    for (int i = 1; i <= keys.size(); i++) {
                        if (i > 1) key.append('|');
                        Object v = rs.getObject(i);
                        key.append(v == null ? "∅" : String.valueOf(v));
                    }
                    out.add(key.toString());
                }
            }
        }
        return out;
    }

    private void fillSample(Workspace w, boolean left, String relation, ArrayNode into, int limit) throws Exception {
        String sql = "SELECT * FROM " + relation + " t";
        try (Connection c = w.open(left);
             Statement st = c.createStatement()) {
            st.setMaxRows(limit);
            try (ResultSet rs = st.executeQuery(sql)) {
                ResultSetMetaData md = rs.getMetaData();
                int cols = md.getColumnCount();
                while (rs.next()) {
                    ObjectNode row = into.addObject();
                    for (int i = 1; i <= cols; i++) {
                        Object v = rs.getObject(i);
                        if (v == null) row.putNull(md.getColumnLabel(i));
                        else row.put(md.getColumnLabel(i), String.valueOf(v));
                    }
                }
            }
        }
    }

    private long scalarLong(Workspace w, boolean left, String sql) throws Exception {
        try (Connection c = w.open(left);
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) return 0;
            return rs.getLong(1);
        }
    }

    private static String redactUrl(String url) {
        if (url == null) return "";
        return url.replaceAll("(?i)(password=)[^&;]+", "$1***");
    }

    private static final class Workspace {
        final String id;
        final String leftJdbcUrl;
        final String leftUser;
        final String leftPassword;
        final String rightJdbcUrl;
        final String rightUser;
        final String rightPassword;
        final String defaultTable;

        Workspace(
                String id,
                String leftJdbcUrl,
                String leftUser,
                String leftPassword,
                String rightJdbcUrl,
                String rightUser,
                String rightPassword,
                String defaultTable
        ) {
            this.id = id;
            this.leftJdbcUrl = leftJdbcUrl;
            this.leftUser = leftUser;
            this.leftPassword = leftPassword;
            this.rightJdbcUrl = rightJdbcUrl;
            this.rightUser = rightUser;
            this.rightPassword = rightPassword;
            this.defaultTable = defaultTable;
        }

        static Workspace from(JsonNode connection) {
            JsonNode cfg = connection.path("external_config");
            if (cfg.isMissingNode() || cfg.isNull()) {
                cfg = connection.path("config");
            }
            JsonNode secrets = connection.path("connection_secrets");
            String id = connection.path("id").asText("anon");
            String leftJdbcUrl = cfg.path("leftJdbcUrl").asText("");
            String rightJdbcUrl = cfg.path("rightJdbcUrl").asText("");
            String leftUser = firstNonBlank(connection.path("user").asText(""), cfg.path("leftUser").asText(""));
            String leftPassword = firstNonBlank(
                    connection.path("password").asText(""),
                    secrets.path("leftPassword").asText(""),
                    cfg.path("leftPassword").asText(""));
            String rightUser = cfg.path("rightUser").asText("");
            String rightPassword = firstNonBlank(
                    secrets.path("rightPassword").asText(""),
                    cfg.path("rightPassword").asText(""));
            String defaultTable = cfg.path("defaultTable").asText("");
            if (leftJdbcUrl.isBlank() && rightJdbcUrl.isBlank()) {
                return new Workspace(id, "", "", "", "", "", "", defaultTable);
            }
            if (leftJdbcUrl.isBlank() || rightJdbcUrl.isBlank()) {
                throw new IllegalArgumentException("Provide both JDBC URLs, or leave both empty to use host.sql");
            }
            return new Workspace(id, leftJdbcUrl, leftUser, leftPassword, rightJdbcUrl, rightUser, rightPassword, defaultTable);
        }

        Connection open(boolean left) throws Exception {
            if (left) {
                return DriverManager.getConnection(leftJdbcUrl, leftUser, leftPassword);
            }
            return DriverManager.getConnection(rightJdbcUrl, rightUser, rightPassword);
        }

        private static String firstNonBlank(String... values) {
            for (String v : values) {
                if (v != null && !v.isBlank()) return v;
            }
            return "";
        }
    }
}
