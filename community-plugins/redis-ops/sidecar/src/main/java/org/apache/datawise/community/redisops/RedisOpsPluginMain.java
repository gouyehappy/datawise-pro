package org.apache.datawise.community.redisops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.apache.datawise.plugin.sdk.StdioJsonRpcSidecar;
import redis.clients.jedis.ClientSetInfoConfig;
import redis.clients.jedis.DefaultJedisClientConfig;
import redis.clients.jedis.HostAndPort;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisClientConfig;
import redis.clients.jedis.Pipeline;
import redis.clients.jedis.Response;
import redis.clients.jedis.StreamEntryID;
import redis.clients.jedis.params.ClientKillParams;
import redis.clients.jedis.params.ScanParams;
import redis.clients.jedis.params.XAddParams;
import redis.clients.jedis.params.XTrimParams;
import redis.clients.jedis.resps.ScanResult;
import redis.clients.jedis.resps.Slowlog;
import redis.clients.jedis.resps.StreamEntry;
import redis.clients.jedis.resps.Tuple;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Redis Ops sidecar: single / Sentinel / Cluster / fleet inventory workspaces.
 */
public final class RedisOpsPluginMain extends StdioJsonRpcSidecar {

    private static final Set<String> DANGEROUS = Set.of(
            "FLUSHALL", "FLUSHDB", "KEYS", "SHUTDOWN", "DEBUG",
            "SAVE", "BGSAVE", "REPLICAOF", "SLAVEOF", "CLUSTER", "ACL",
            "SCRIPT", "EVAL", "EVALSHA", "MIGRATE", "SWAPDB"
    );

    /** Ops-safe CONFIG SET allowlist (UI + redis/config-set). */
    private static final Set<String> CONFIG_SET_ALLOW = Set.of(
            "maxmemory",
            "maxmemory-policy",
            "timeout",
            "tcp-keepalive",
            "maxclients",
            "slowlog-log-slower-than",
            "slowlog-max-len",
            "notify-keyspace-events",
            "hz",
            "lazyfree-lazy-eviction",
            "lazyfree-lazy-expire",
            "lazyfree-lazy-server-del",
            "hash-max-listpack-entries",
            "hash-max-ziplist-entries",
            "list-max-listpack-size",
            "list-max-ziplist-size",
            "set-max-intset-entries",
            "zset-max-listpack-entries",
            "zset-max-ziplist-entries",
            "activedefrag",
            "active-defrag-threshold-lower",
            "active-defrag-threshold-upper"
    );

    private final Map<String, Workspace> workspaces = new ConcurrentHashMap<>();
    private final ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
    private volatile Path pluginDataDir;

    public static void main(String[] args) throws Exception {
        new RedisOpsPluginMain().runStdio();
    }

    @Override
    protected JsonNode handle(String method, JsonNode params) {
        return switch (method) {
            case "plugin/initialize" -> initialize(params);
            case "connection/test" -> test(params.path("connection"));
            case "connection/connect" -> connect(params.path("connection"));
            case "connection/disconnect" -> disconnect(params.path("connection").path("id").asText("anon"));
            case "connection/action" -> action(params);
            case "context-menu/invoke" -> ok("message", "Open Redis Ops from the plugin connection.");
            case "redis/instances" -> instances(requireWs(params), params.path("query").asText(""));
            case "redis/select" -> select(requireWs(params), params.path("instanceId").asText(""));
            case "redis/select-db" -> selectDb(requireInst(params), params.path("database").asInt(-1));
            case "redis/ping-all" -> pingAll(requireWs(params));
            case "redis/overview" -> overview(requireInst(params));
            case "redis/memory" -> memory(requireInst(params));
            case "redis/slowlog" -> slowlog(requireInst(params), params.path("count").asInt(64));
            case "redis/clients" -> clients(requireInst(params));
            case "redis/replication" -> replication(requireInst(params));
            case "redis/commandstats" -> commandStats(requireInst(params));
            case "redis/config-get" -> configGet(requireInst(params), params.path("pattern").asText("*"));
            case "redis/config-set" -> configSet(requireInst(params),
                    params.path("key").asText(""),
                    params.path("value").asText(""));
            case "redis/keys" -> keys(requireInst(params),
                    params.path("pattern").asText("*"),
                    params.path("cursor").asText("0"),
                    params.path("count").asInt(50));
            case "redis/namespaces" -> namespaces(requireInst(params),
                    params.path("sample").asInt(300),
                    params.path("depth").asInt(2));
            case "redis/key" -> keyDetail(requireInst(params), params.path("key").asText(""));
            case "redis/delete-key" -> deleteKey(requireInst(params), params.path("key").asText(""));
            case "redis/delete-keys" -> deleteKeys(requireInst(params), params.path("keys"));
            case "redis/expire" -> expire(requireInst(params),
                    params.path("key").asText(""),
                    params.path("seconds").asLong(0));
            case "redis/rename" -> renameKey(requireInst(params),
                    params.path("key").asText(""),
                    params.path("newKey").asText(""));
            case "redis/set-string" -> setString(requireInst(params),
                    params.path("key").asText(""),
                    params.path("value").asText(""));
            case "redis/hash-set" -> hashSet(requireInst(params),
                    params.path("key").asText(""),
                    params.path("field").asText(""),
                    params.path("value").asText(""));
            case "redis/hash-del" -> hashDel(requireInst(params),
                    params.path("key").asText(""),
                    params.path("field").asText(""));
            case "redis/list-push" -> listPush(requireInst(params),
                    params.path("key").asText(""),
                    params.path("value").asText(""),
                    params.path("side").asText("right"));
            case "redis/list-set" -> listSet(requireInst(params),
                    params.path("key").asText(""),
                    params.path("index").asLong(0),
                    params.path("value").asText(""));
            case "redis/set-add" -> setAdd(requireInst(params),
                    params.path("key").asText(""),
                    params.path("member").asText(""));
            case "redis/set-rem" -> setRem(requireInst(params),
                    params.path("key").asText(""),
                    params.path("member").asText(""));
            case "redis/zset-add" -> zsetAdd(requireInst(params),
                    params.path("key").asText(""),
                    params.path("member").asText(""),
                    params.path("score").asDouble(0));
            case "redis/zset-rem" -> zsetRem(requireInst(params),
                    params.path("key").asText(""),
                    params.path("member").asText(""));
            case "redis/stream-add" -> streamAdd(requireInst(params),
                    params.path("key").asText(""),
                    params.path("fields"));
            case "redis/stream-del" -> streamDel(requireInst(params),
                    params.path("key").asText(""),
                    params.path("id").asText(""));
            case "redis/stream-trim" -> streamTrim(requireInst(params),
                    params.path("key").asText(""),
                    params.path("maxlen").asLong(0));
            case "redis/client-kill" -> clientKill(requireInst(params), params.path("addr").asText(""));
            case "redis/slowlog-reset" -> slowlogReset(requireInst(params));
            case "redis/sample-bigkeys" -> sampleBigKeys(requireInst(params),
                    params.path("sample").asInt(200),
                    params.path("top").asInt(20));
            case "redis/command" -> command(requireInst(params),
                    params.path("command").asText(""),
                    params.path("allowDangerous").asBoolean(false));
            case "redis/diagnose" -> diagnose(requireInst(params));
            case "redis/demo-fleet-path" -> ok("path", demoFleet().toString());
            default -> throw new UnknownMethodException(method);
        };
    }

    private ObjectNode initialize(JsonNode params) {
        String dir = params.path("pluginDataDir").asText("");
        if (!dir.isBlank()) pluginDataDir = Path.of(dir);
        return ok("ok", true, "name", "Redis Ops", "demoFleetPath", demoFleet().toString());
    }

    private ObjectNode action(JsonNode params) {
        String id = params.path("action").path("id").asText(params.path("actionId").asText(""));
        if ("use-demo-fleet".equals(id)) {
            ObjectNode out = ok("success", true, "message", "Filled demo fleet inventory. Set Workspace=Fleet, save, then open.");
            ObjectNode fields = out.putObject("fieldValues");
            fields.put("workspaceKind", "fleet");
            fields.put("inventoryPath", demoFleet().toString());
            return out;
        }
        return ok("success", true);
    }

    private Workspace requireWs(JsonNode params) {
        String id = params.path("connectionId").asText("");
        if (id.isBlank()) id = params.path("connection").path("id").asText("anon");
        Workspace ws = workspaces.get(id);
        if (ws == null) {
            JsonNode conn = params.path("connection");
            if (!conn.isMissingNode() && !conn.isNull()) {
                ws = openWorkspace(conn);
                workspaces.put(ws.id, ws);
            }
        }
        if (ws == null) throw new IllegalArgumentException("Workspace not open: " + id);
        return ws;
    }

    private Instance requireInst(JsonNode params) {
        Workspace ws = requireWs(params);
        String instanceId = params.path("instanceId").asText("");
        if (!instanceId.isBlank()) {
            ws.activeId = instanceId;
        }
        Instance inst = ws.instances.get(ws.activeId);
        if (inst == null && !ws.instances.isEmpty()) {
            inst = ws.instances.values().iterator().next();
            ws.activeId = inst.id;
        }
        if (inst == null) throw new IllegalArgumentException("No Redis instance selected");
        inst.ensure();
        return inst;
    }

    private ObjectNode test(JsonNode connection) {
        try {
            Workspace ws = openWorkspace(connection);
            try {
                if (ws.instances.isEmpty()) {
                    return ok("success", false, "message", "No instances configured");
                }
                Instance first = ws.instances.values().iterator().next();
                first.ensure();
                String pong = first.jedis.ping();
                return ok("success", true, "message",
                        "OK · " + ws.kind + " · " + ws.instances.size() + " instance(s) · ping " + pong
                                + " · " + first.endpointLabel());
            } finally {
                ws.close();
            }
        } catch (Exception e) {
            String where = "";
            try {
                Workspace ws = openWorkspace(connection);
                if (!ws.instances.isEmpty()) where = " · " + ws.instances.values().iterator().next().endpointLabel();
                ws.close();
            } catch (Exception ignored) { }
            return ok("success", false, "message", msg(e) + where);
        }
    }

    private ObjectNode connect(JsonNode connection) {
        Workspace ws = openWorkspace(connection);
        workspaces.put(ws.id, ws);
        return ok("success", true, "handle", "redis-ops-" + ws.id, "kind", ws.kind, "count", ws.instances.size());
    }

    private ObjectNode disconnect(String id) {
        Workspace ws = workspaces.remove(id);
        if (ws != null) ws.close();
        return ok("success", true);
    }

    private ObjectNode instances(Workspace ws, String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        ObjectNode out = mapper().createObjectNode();
        out.put("kind", ws.kind);
        out.put("activeId", ws.activeId == null ? "" : ws.activeId);
        ArrayNode rows = out.putArray("instances");
        for (Instance i : ws.instances.values()) {
            String hay = (i.id + " " + i.name + " " + i.host + " " + i.tags).toLowerCase(Locale.ROOT);
            if (!q.isEmpty() && !hay.contains(q)) continue;
            ObjectNode row = rows.addObject();
            row.put("id", i.id);
            row.put("name", i.name);
            row.put("host", i.host);
            row.put("port", i.port);
            row.put("database", i.database);
            row.put("mode", i.mode.label());
            row.put("masterName", i.masterName == null ? "" : i.masterName);
            row.put("ssl", i.ssl);
            row.put("tags", i.tags);
            row.put("active", i.id.equals(ws.activeId));
            row.put("connected", i.jedis != null);
        }
        out.put("count", rows.size());
        out.put("total", ws.instances.size());
        return out;
    }

    private ObjectNode select(Workspace ws, String instanceId) {
        if (!ws.instances.containsKey(instanceId)) {
            throw new IllegalArgumentException("Unknown instance: " + instanceId);
        }
        ws.activeId = instanceId;
        Instance inst = ws.instances.get(instanceId);
        inst.ensure();
        return ok("success", true, "instanceId", instanceId, "endpoint", inst.host + ":" + inst.port,
                "database", inst.database);
    }

    private ObjectNode selectDb(Instance s, int database) {
        if (s.mode == Instance.Mode.CLUSTER) {
            throw new IllegalArgumentException("Cluster 模式不支持 SELECT 逻辑库");
        }
        if (database < 0 || database > 63) {
            throw new IllegalArgumentException("database must be between 0 and 63");
        }
        s.ensure();
        int max = databasesCount(s);
        if (database >= max) {
            throw new IllegalArgumentException("database " + database + " out of range (0.." + (max - 1) + ")");
        }
        String reply = s.jedis.select(database);
        s.database = database;
        return ok("success", true, "database", database, "reply", reply == null ? "OK" : reply,
                "databasesCount", max);
    }

    private int databasesCount(Instance s) {
        try {
            Map<String, String> conf = s.jedis.configGet("databases");
            if (conf != null && !conf.isEmpty()) {
                String v = conf.values().iterator().next();
                int n = parseInt(v, 16);
                if (n > 0 && n <= 64) return n;
            }
        } catch (Exception ignored) {
            // CONFIG GET may be disabled
        }
        return 16;
    }

    private ObjectNode pingAll(Workspace ws) {
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("results");
        int okCount = 0;
        for (Instance i : ws.instances.values()) {
            ObjectNode row = rows.addObject();
            row.put("id", i.id);
            row.put("name", i.name);
            row.put("endpoint", i.host + ":" + i.port);
            long t0 = System.nanoTime();
            try {
                i.ensure();
                row.put("pong", i.jedis.ping());
                row.put("status", "up");
                okCount++;
            } catch (Exception e) {
                row.put("status", "down");
                row.put("error", msg(e));
                i.closeQuietly();
            }
            row.put("ms", (System.nanoTime() - t0) / 1_000_000);
        }
        out.put("up", okCount);
        out.put("down", ws.instances.size() - okCount);
        return out;
    }

    private ObjectNode overview(Instance s) {
        Map<String, String> info = parseInfo(s.jedis.info());
        long hits = parseLong(info.get("keyspace_hits"));
        long misses = parseLong(info.get("keyspace_misses"));
        double hitRate = (hits + misses) <= 0 ? 0 : (100.0 * hits / (hits + misses));
        ObjectNode out = mapper().createObjectNode();
        out.put("instanceId", s.id);
        out.put("name", s.name);
        out.put("host", s.host);
        out.put("port", s.port);
        out.put("database", s.database);
        out.put("connectionMode", s.mode.label());
        out.put("masterName", s.masterName == null ? "" : s.masterName);
        out.put("databasesCount", s.mode == Instance.Mode.CLUSTER ? 1 : databasesCount(s));
        out.put("role", info.getOrDefault("role", info.getOrDefault("redis_mode", "?")));
        out.put("redisMode", info.getOrDefault("redis_mode", "standalone"));
        out.put("redisVersion", info.getOrDefault("redis_version", "?"));
        out.put("os", info.getOrDefault("os", ""));
        out.put("uptimeSeconds", parseLong(info.get("uptime_in_seconds")));
        out.put("usedMemory", info.getOrDefault("used_memory_human", "?"));
        out.put("usedMemoryBytes", parseLong(info.get("used_memory")));
        out.put("maxMemory", info.getOrDefault("maxmemory_human", "0"));
        out.put("maxMemoryBytes", parseLong(info.get("maxmemory")));
        out.put("connectedClients", parseLong(info.get("connected_clients")));
        out.put("blockedClients", parseLong(info.get("blocked_clients")));
        out.put("opsPerSec", parseLong(info.get("instantaneous_ops_per_sec")));
        out.put("totalCommands", parseLong(info.get("total_commands_processed")));
        out.put("keyspaceHits", hits);
        out.put("keyspaceMisses", misses);
        out.put("hitRate", Math.round(hitRate * 10) / 10.0);
        out.put("expiredKeys", parseLong(info.get("expired_keys")));
        out.put("evictedKeys", parseLong(info.get("evicted_keys")));
        out.put("aofEnabled", "1".equals(info.get("aof_enabled")));
        out.put("rdbLastSave", parseLong(info.get("rdb_last_save_time")));
        ArrayNode dbs = out.putArray("databases");
        long totalKeys = 0;
        for (Map.Entry<String, String> e : info.entrySet()) {
            if (!e.getKey().startsWith("db")) continue;
            ObjectNode db = dbs.addObject();
            db.put("name", e.getKey());
            long keys = parseInfoField(e.getValue(), "keys");
            long expires = parseInfoField(e.getValue(), "expires");
            db.put("keys", keys);
            db.put("expires", expires);
            totalKeys += keys;
        }
        out.put("totalKeys", totalKeys);
        out.put("ok", true);
        return out;
    }

    private ObjectNode memory(Instance s) {
        Map<String, String> info = parseInfo(s.jedis.info("memory"));
        Map<String, String> stats = parseInfo(s.jedis.info("stats"));
        ObjectNode out = mapper().createObjectNode();
        out.put("usedMemory", info.getOrDefault("used_memory_human", "?"));
        out.put("usedMemoryBytes", parseLong(info.get("used_memory")));
        out.put("usedMemoryRss", info.getOrDefault("used_memory_rss_human", "?"));
        out.put("usedMemoryPeak", info.getOrDefault("used_memory_peak_human", "?"));
        out.put("maxMemory", info.getOrDefault("maxmemory_human", "0"));
        out.put("maxMemoryBytes", parseLong(info.get("maxmemory")));
        out.put("maxmemoryPolicy", info.getOrDefault("maxmemory_policy", ""));
        out.put("fragmentationRatio", info.getOrDefault("mem_fragmentation_ratio", "?"));
        out.put("allocator", info.getOrDefault("mem_allocator", ""));
        out.put("evictedKeys", parseLong(stats.get("evicted_keys")));
        out.put("expiredKeys", parseLong(stats.get("expired_keys")));
        out.put("ok", true);
        return out;
    }

    private ObjectNode slowlog(Instance s, int count) {
        List<Slowlog> logs = s.jedis.slowlogGet(Math.max(1, Math.min(count, 256)));
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("entries");
        for (Slowlog log : logs) {
            ObjectNode row = rows.addObject();
            List<String> args = log.getArgs();
            row.put("id", log.getId());
            row.put("timestamp", log.getTimeStamp());
            row.put("durationUs", log.getExecutionTime());
            row.put("verb", args == null || args.isEmpty() ? "" : args.get(0));
            row.put("command", args == null ? "" : String.join(" ", args));
            ArrayNode argArr = row.putArray("args");
            if (args != null) {
                for (String a : args) argArr.add(a);
            }
        }
        out.put("count", rows.size());
        try {
            out.put("len", s.jedis.slowlogLen());
        } catch (Exception e) {
            out.put("len", rows.size());
        }
        long slowerThan = -1;
        long maxLen = -1;
        try {
            Map<String, String> cfg = s.jedis.configGet("slowlog-*");
            if (cfg != null) {
                if (cfg.containsKey("slowlog-log-slower-than")) {
                    slowerThan = parseLong(cfg.get("slowlog-log-slower-than"));
                }
                if (cfg.containsKey("slowlog-max-len")) {
                    maxLen = parseLong(cfg.get("slowlog-max-len"));
                }
            }
        } catch (Exception ignored) {
            /* ACL / managed Redis may block CONFIG */
        }
        out.put("slowerThanUs", slowerThan);
        out.put("maxLen", maxLen);
        out.put("ok", true);
        return out;
    }

    private ObjectNode clients(Instance s) {
        String raw = s.jedis.clientList();
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("clients");
        if (raw != null) {
            for (String line : raw.split("\\n")) {
                if (line.isBlank()) continue;
                ObjectNode row = rows.addObject();
                row.put("raw", line.trim());
                for (String part : line.trim().split(" ")) {
                    int eq = part.indexOf('=');
                    if (eq > 0) row.put(part.substring(0, eq), part.substring(eq + 1));
                }
            }
        }
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode replication(Instance s) {
        Map<String, String> info = parseInfo(s.jedis.info("replication"));
        ObjectNode out = mapper().createObjectNode();
        out.put("role", info.getOrDefault("role", "?"));
        out.put("masterHost", info.getOrDefault("master_host", ""));
        out.put("masterPort", info.getOrDefault("master_port", ""));
        out.put("masterLinkStatus", info.getOrDefault("master_link_status", ""));
        out.put("connectedSlaves", parseLong(info.get("connected_slaves")));
        out.put("masterReplOffset", parseLong(info.get("master_repl_offset")));
        ArrayNode slaves = out.putArray("slaves");
        for (Map.Entry<String, String> e : info.entrySet()) {
            if (e.getKey().startsWith("slave")) {
                ObjectNode row = slaves.addObject();
                row.put("id", e.getKey());
                row.put("raw", e.getValue());
            }
        }
        out.put("ok", true);
        return out;
    }

    private ObjectNode commandStats(Instance s) {
        Map<String, String> info = parseInfo(s.jedis.info("commandstats"));
        List<ObjectNode> rows = new ArrayList<>();
        for (Map.Entry<String, String> e : info.entrySet()) {
            if (!e.getKey().startsWith("cmdstat_")) continue;
            ObjectNode row = mapper().createObjectNode();
            row.put("command", e.getKey().substring("cmdstat_".length()));
            row.put("calls", parseInfoField(e.getValue(), "calls"));
            row.put("usec", parseInfoField(e.getValue(), "usec"));
            long calls = row.path("calls").asLong();
            long usec = row.path("usec").asLong();
            row.put("usecPerCall", calls == 0 ? 0 : Math.round(usec * 10.0 / calls) / 10.0);
            rows.add(row);
        }
        rows.sort(Comparator.comparingLong((ObjectNode n) -> n.path("calls").asLong()).reversed());
        ObjectNode out = mapper().createObjectNode();
        ArrayNode arr = out.putArray("stats");
        rows.stream().limit(40).forEach(arr::add);
        out.put("count", arr.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode configGet(Instance s, String pattern) {
        Map<String, String> conf = s.jedis.configGet(pattern == null || pattern.isBlank() ? "*" : pattern);
        ObjectNode out = mapper().createObjectNode();
        ArrayNode rows = out.putArray("entries");
        for (Map.Entry<String, String> e : conf.entrySet()) {
            ObjectNode row = rows.addObject();
            row.put("key", e.getKey());
            row.put("value", e.getValue());
            row.put("editable", CONFIG_SET_ALLOW.contains(e.getKey().toLowerCase(Locale.ROOT)));
        }
        ArrayNode allow = out.putArray("allowSet");
        CONFIG_SET_ALLOW.stream().sorted().forEach(allow::add);
        out.put("count", rows.size());
        out.put("ok", true);
        return out;
    }

    private ObjectNode configSet(Instance s, String key, String value) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("key is required");
        String normalized = key.trim().toLowerCase(Locale.ROOT);
        if (!CONFIG_SET_ALLOW.contains(normalized)) {
            throw new IllegalArgumentException(
                    "CONFIG SET 仅允许白名单项（如 maxmemory / timeout / slowlog-*）。当前: " + key);
        }
        String result = s.jedis.configSet(normalized, value == null ? "" : value);
        return ok("success", true, "key", normalized, "value", value == null ? "" : value, "result", result);
    }

    private ObjectNode namespaces(Instance s, int sample, int depth) {
        int limit = Math.max(50, Math.min(sample, 2000));
        int d = Math.max(1, Math.min(depth, 4));
        Map<String, Integer> counts = new LinkedHashMap<>();
        String cursor = "0";
        int seen = 0;
        do {
            ScanResult<String> sr = s.jedis.scan(cursor, new ScanParams().match("*").count(80));
            cursor = sr.getCursor();
            for (String key : sr.getResult()) {
                seen++;
                String ns = namespaceOf(key, d);
                counts.merge(ns, 1, Integer::sum);
                if (seen >= limit) break;
            }
        } while (!"0".equals(cursor) && seen < limit);
        ObjectNode out = mapper().createObjectNode();
        out.put("sampled", seen);
        ArrayNode rows = out.putArray("namespaces");
        counts.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(80)
                .forEach(e -> {
                    ObjectNode row = rows.addObject();
                    row.put("prefix", e.getKey());
                    row.put("count", e.getValue());
                    row.put("pattern", e.getKey().equals("(root)") ? "*" : e.getKey() + "*");
                });
        out.put("ok", true);
        return out;
    }

    private static String namespaceOf(String key, int depth) {
        String[] parts = key.split(":", depth + 1);
        if (parts.length <= 1) return "(root)";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(depth, parts.length - (key.endsWith(":") ? 0 : 1)); i++) {
            if (parts[i].isEmpty()) continue;
            if (sb.length() > 0) sb.append(':');
            sb.append(parts[i]);
            if (i >= depth - 1) break;
        }
        return sb.length() == 0 ? "(root)" : sb + ":";
    }

    private ObjectNode keys(Instance s, String pattern, String cursor, int count) {
        int limit = Math.max(10, Math.min(count, 200));
        String match = pattern == null || pattern.isBlank() ? "*" : pattern;
        String cur = cursor == null || cursor.isBlank() ? "0" : cursor;
        ObjectNode out = mapper().createObjectNode();
        ArrayNode list = out.putArray("keys");
        boolean done = false;
        // SCAN COUNT is a hint; loop until we collect `limit` matches or the cursor wraps.
        for (int guard = 0; list.size() < limit && guard < 64; guard++) {
            int hint = Math.max(limit - list.size(), 32);
            ScanResult<String> result = s.jedis.scan(cur, new ScanParams().match(match).count(hint));
            List<String> batch = new ArrayList<>();
            for (String key : result.getResult()) {
                if (list.size() + batch.size() >= limit) break;
                batch.add(key);
            }
            if (!batch.isEmpty()) {
                appendKeyedMeta(s, list, batch);
            }
            cur = result.getCursor();
            if ("0".equals(cur)) {
                done = true;
                break;
            }
        }
        out.put("cursor", cur);
        out.put("done", done);
        out.put("count", list.size());
        out.put("ok", true);
        return out;
    }

    /** Batch TYPE + TTL via pipeline (avoids 2 round-trips per key). */
    private static void appendKeyedMeta(Instance s, ArrayNode list, List<String> batch) {
        Pipeline pipe = s.jedis.pipelined();
        List<Response<String>> types = new ArrayList<>(batch.size());
        List<Response<Long>> ttls = new ArrayList<>(batch.size());
        for (String key : batch) {
            types.add(pipe.type(key));
            ttls.add(pipe.ttl(key));
        }
        pipe.sync();
        for (int i = 0; i < batch.size(); i++) {
            ObjectNode row = list.addObject();
            row.put("key", batch.get(i));
            try {
                String type = types.get(i).get();
                Long ttl = ttls.get(i).get();
                row.put("type", type == null ? "?" : type);
                row.put("ttl", ttl == null ? -1L : ttl);
            } catch (Exception e) {
                row.put("type", "?");
                row.put("ttl", -1);
            }
        }
    }

    private ObjectNode keyDetail(Instance s, String key) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("key is required");
        ObjectNode out = mapper().createObjectNode();
        out.put("key", key);
        String type = s.jedis.type(key);
        out.put("type", type);
        out.put("ttl", s.jedis.ttl(key));
        try {
            out.put("memoryBytes", s.jedis.memoryUsage(key));
        } catch (Exception e) {
            out.putNull("memoryBytes");
        }
        String preview = switch (type) {
            case "string" -> {
                String v = s.jedis.get(key);
                out.put("stringValue", v == null ? "" : truncate(v, 8000));
                yield v == null ? "(nil)" : truncate(v, 2000);
            }
            case "list" -> {
                List<String> vals = s.jedis.lrange(key, 0, 49);
                ArrayNode entries = out.putArray("entries");
                for (int i = 0; i < vals.size(); i++) {
                    ObjectNode row = entries.addObject();
                    row.put("index", i);
                    row.put("value", truncate(vals.get(i), 500));
                }
                yield vals.size() + " shown";
            }
            case "set" -> {
                ArrayNode entries = out.putArray("entries");
                ScanResult<String> scan = s.jedis.sscan(key, "0", new ScanParams().count(50));
                for (String member : scan.getResult()) {
                    entries.addObject().put("value", truncate(member, 500));
                }
                yield entries.size() + " shown";
            }
            case "zset" -> {
                ArrayNode entries = out.putArray("entries");
                List<Tuple> tuples = s.jedis.zrangeWithScores(key, 0, 49);
                for (Tuple t : tuples) {
                    ObjectNode row = entries.addObject();
                    row.put("member", truncate(t.getElement(), 500));
                    row.put("score", t.getScore());
                }
                yield entries.size() + " members";
            }
            case "hash" -> {
                ArrayNode entries = out.putArray("entries");
                int n = 0;
                for (Map.Entry<String, String> e : s.jedis.hgetAll(key).entrySet()) {
                    if (n++ >= 50) break;
                    ObjectNode row = entries.addObject();
                    row.put("field", e.getKey());
                    row.put("value", truncate(e.getValue(), 500));
                }
                yield entries.size() + " fields";
            }
            case "stream" -> {
                ArrayNode entries = out.putArray("entries");
                try {
                    long len = s.jedis.xlen(key);
                    out.put("streamLength", len);
                    List<StreamEntry> streamEntries = s.jedis.xrange(key, "-", "+", 20);
                    if (streamEntries != null) {
                        for (StreamEntry e : streamEntries) {
                            ObjectNode row = entries.addObject();
                            row.put("id", e.getID().toString());
                            ObjectNode fields = row.putObject("fields");
                            if (e.getFields() != null) {
                                for (Map.Entry<String, String> f : e.getFields().entrySet()) {
                                    fields.put(f.getKey(), truncate(f.getValue(), 500));
                                }
                            }
                        }
                    }
                    yield "XLEN " + len + " · " + entries.size() + " shown";
                } catch (Exception e) {
                    yield "(stream preview failed: " + msg(e) + ")";
                }
            }
            default -> "(unsupported type preview: " + type + ")";
        };
        out.put("preview", preview);
        out.put("ok", true);
        return out;
    }

    private ObjectNode deleteKey(Instance s, String key) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("key is required");
        long n = unlinkOrDel(s, List.of(key));
        return ok("success", true, "deleted", n, "key", key);
    }

    private ObjectNode deleteKeys(Instance s, JsonNode keysNode) {
        List<String> keys = new ArrayList<>();
        if (keysNode != null && keysNode.isArray()) {
            for (JsonNode n : keysNode) {
                String k = n.asText("").trim();
                if (!k.isBlank()) keys.add(k);
            }
        }
        if (keys.isEmpty()) throw new IllegalArgumentException("keys is required");
        if (keys.size() > 200) throw new IllegalArgumentException("最多一次删除 200 个 key");
        // de-dupe while preserving order
        keys = new ArrayList<>(new LinkedHashSet<>(keys));
        long n = unlinkOrDel(s, keys);
        return ok("success", true, "deleted", n, "requested", keys.size());
    }

    private static long unlinkOrDel(Instance s, List<String> keys) {
        String[] arr = keys.toArray(new String[0]);
        try {
            return s.jedis.unlink(arr);
        } catch (Exception e) {
            return s.jedis.del(arr);
        }
    }

    private ObjectNode expire(Instance s, String key, long seconds) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("key is required");
        if (seconds <= 0) {
            s.jedis.persist(key);
            return ok("success", true, "key", key, "ttl", -1, "action", "persist");
        }
        long okFlag = s.jedis.expire(key, seconds);
        return ok("success", okFlag == 1, "key", key, "ttl", seconds, "action", "expire");
    }

    private ObjectNode renameKey(Instance s, String key, String newKey) {
        requireKey(key);
        if (newKey == null || newKey.isBlank()) throw new IllegalArgumentException("newKey is required");
        if (key.equals(newKey)) return ok("success", true, "key", key);
        if (s.jedis.exists(newKey)) throw new IllegalArgumentException("目标 key 已存在: " + newKey);
        s.jedis.rename(key, newKey);
        return ok("success", true, "key", newKey, "from", key);
    }

    private ObjectNode setString(Instance s, String key, String value) {
        requireKey(key);
        long ttl = s.jedis.ttl(key);
        s.jedis.set(key, value == null ? "" : value);
        if (ttl > 0) s.jedis.expire(key, ttl);
        return ok("success", true, "key", key);
    }

    private ObjectNode hashSet(Instance s, String key, String field, String value) {
        requireKey(key);
        if (field == null || field.isBlank()) throw new IllegalArgumentException("field is required");
        s.jedis.hset(key, field, value == null ? "" : value);
        return ok("success", true, "key", key, "field", field);
    }

    private ObjectNode hashDel(Instance s, String key, String field) {
        requireKey(key);
        if (field == null || field.isBlank()) throw new IllegalArgumentException("field is required");
        s.jedis.hdel(key, field);
        return ok("success", true, "key", key, "field", field);
    }

    private ObjectNode listPush(Instance s, String key, String value, String side) {
        requireKey(key);
        if ("left".equalsIgnoreCase(side)) s.jedis.lpush(key, value == null ? "" : value);
        else s.jedis.rpush(key, value == null ? "" : value);
        return ok("success", true, "key", key);
    }

    private ObjectNode listSet(Instance s, String key, long index, String value) {
        requireKey(key);
        s.jedis.lset(key, index, value == null ? "" : value);
        return ok("success", true, "key", key);
    }

    private ObjectNode setAdd(Instance s, String key, String member) {
        requireKey(key);
        if (member == null || member.isEmpty()) throw new IllegalArgumentException("member is required");
        s.jedis.sadd(key, member);
        return ok("success", true, "key", key);
    }

    private ObjectNode setRem(Instance s, String key, String member) {
        requireKey(key);
        s.jedis.srem(key, member == null ? "" : member);
        return ok("success", true, "key", key);
    }

    private ObjectNode zsetAdd(Instance s, String key, String member, double score) {
        requireKey(key);
        if (member == null || member.isEmpty()) throw new IllegalArgumentException("member is required");
        if (Double.isNaN(score) || Double.isInfinite(score)) {
            throw new IllegalArgumentException("score must be a finite number");
        }
        s.jedis.zadd(key, score, member);
        return ok("success", true, "key", key, "member", member, "score", score);
    }

    private ObjectNode zsetRem(Instance s, String key, String member) {
        requireKey(key);
        if (member == null || member.isEmpty()) throw new IllegalArgumentException("member is required");
        s.jedis.zrem(key, member);
        return ok("success", true, "key", key, "member", member);
    }

    private ObjectNode streamAdd(Instance s, String key, JsonNode fieldsNode) {
        requireKey(key);
        Map<String, String> fields = new LinkedHashMap<>();
        if (fieldsNode != null && fieldsNode.isObject()) {
            fieldsNode.fields().forEachRemaining(e -> {
                String v = e.getValue() == null || e.getValue().isNull() ? "" : e.getValue().asText("");
                fields.put(e.getKey(), v);
            });
        }
        if (fields.isEmpty()) throw new IllegalArgumentException("fields is required (至少一对 field/value)");
        StreamEntryID id = s.jedis.xadd(key, XAddParams.xAddParams().id("*"), fields);
        return ok("success", true, "key", key, "id", id == null ? "" : id.toString());
    }

    private ObjectNode streamDel(Instance s, String key, String id) {
        requireKey(key);
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id is required");
        long n = s.jedis.xdel(key, new StreamEntryID(id.trim()));
        return ok("success", true, "key", key, "id", id.trim(), "deleted", n);
    }

    private ObjectNode streamTrim(Instance s, String key, long maxlen) {
        requireKey(key);
        if (maxlen < 0) throw new IllegalArgumentException("maxlen must be >= 0");
        long n = s.jedis.xtrim(key, XTrimParams.xTrimParams().maxLen(maxlen).exactTrimming());
        return ok("success", true, "key", key, "maxlen", maxlen, "trimmed", n);
    }

    private ObjectNode clientKill(Instance s, String addr) {
        if (addr == null || addr.isBlank()) throw new IllegalArgumentException("addr is required");
        long n = s.jedis.clientKill(ClientKillParams.clientKillParams().addr(addr.trim()));
        return ok("success", true, "killed", n, "addr", addr.trim());
    }

    private ObjectNode slowlogReset(Instance s) {
        s.jedis.slowlogReset();
        return ok("success", true);
    }

    private static void requireKey(String key) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("key is required");
    }

    private ObjectNode sampleBigKeys(Instance s, int sample, int top) {
        int limit = Math.max(20, Math.min(sample, 2000));
        int keep = Math.max(5, Math.min(top, 50));
        List<String> collected = new ArrayList<>(limit);
        String cursor = "0";
        do {
            ScanResult<String> sr = s.jedis.scan(cursor, new ScanParams().match("*").count(80));
            cursor = sr.getCursor();
            for (String key : sr.getResult()) {
                collected.add(key);
                if (collected.size() >= limit) break;
            }
        } while (!"0".equals(cursor) && collected.size() < limit);

        List<KeySize> sizes = new ArrayList<>();
        final int chunk = 40;
        for (int i = 0; i < collected.size(); i += chunk) {
            List<String> batch = collected.subList(i, Math.min(i + chunk, collected.size()));
            Pipeline pipe = s.jedis.pipelined();
            List<Response<Long>> mems = new ArrayList<>(batch.size());
            List<Response<String>> types = new ArrayList<>(batch.size());
            for (String key : batch) {
                mems.add(pipe.memoryUsage(key));
                types.add(pipe.type(key));
            }
            pipe.sync();
            for (int j = 0; j < batch.size(); j++) {
                try {
                    Long mem = mems.get(j).get();
                    if (mem == null) continue;
                    String type = types.get(j).get();
                    sizes.add(new KeySize(batch.get(j), type == null ? "?" : type, mem));
                } catch (Exception ignored) {
                    // skip keys that vanished or lack MEMORY USAGE
                }
            }
        }
        sizes.sort((a, b) -> Long.compare(b.bytes, a.bytes));
        ObjectNode out = mapper().createObjectNode();
        out.put("sampled", collected.size());
        ArrayNode rows = out.putArray("keys");
        for (int i = 0; i < Math.min(keep, sizes.size()); i++) {
            KeySize ks = sizes.get(i);
            ObjectNode row = rows.addObject();
            row.put("key", ks.key);
            row.put("type", ks.type);
            row.put("memoryBytes", ks.bytes);
        }
        out.put("ok", true);
        return out;
    }

    private ObjectNode command(Instance s, String raw, boolean allowDangerous) {
        String trimmed = raw == null ? "" : raw.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException("command is empty");
        String[] parts = splitCommand(trimmed);
        String verb = parts[0].toUpperCase(Locale.ROOT);
        if (!allowDangerous && isDangerous(verb, parts)) {
            ObjectNode denied = mapper().createObjectNode();
            denied.put("success", false);
            denied.put("blocked", true);
            denied.put("message", "Dangerous command blocked. Enable allow-dangerous to run: " + verb);
            return denied;
        }
        redis.clients.jedis.commands.ProtocolCommand cmd = () -> parts[0].getBytes(StandardCharsets.UTF_8);
        Object reply = s.jedis.sendCommand(cmd, restArgs(parts));
        ObjectNode out = mapper().createObjectNode();
        out.put("success", true);
        out.put("command", trimmed);
        out.put("result", formatReply(reply));
        return out;
    }

    private ObjectNode diagnose(Instance s) {
        ObjectNode ov = overview(s);
        ObjectNode mem = memory(s);
        ObjectNode slow = slowlog(s, 10);
        ObjectNode repl = replication(s);
        StringBuilder report = new StringBuilder();
        report.append("# Redis Ops diagnose\n");
        report.append("Instance: ").append(s.name).append(" (").append(s.id).append(")\n");
        report.append("Endpoint: ").append(s.host).append(':').append(s.port).append(" db=").append(s.database).append('\n');
        report.append("Role: ").append(ov.path("role").asText()).append(" · Version: ").append(ov.path("redisVersion").asText()).append('\n');
        report.append("Memory: ").append(mem.path("usedMemory").asText()).append(" / ").append(mem.path("maxMemory").asText()).append('\n');
        report.append("Hit rate: ").append(ov.path("hitRate").asDouble()).append("%\n");
        report.append("Clients: ").append(ov.path("connectedClients").asLong()).append(" · Ops/s: ").append(ov.path("opsPerSec").asLong()).append('\n');
        report.append("Replication: ").append(repl.path("role").asText());
        if (!repl.path("masterHost").asText("").isBlank()) {
            report.append(" → ").append(repl.path("masterHost").asText()).append(':').append(repl.path("masterPort").asText());
        }
        report.append('\n');
        report.append("\n## Slowlog\n");
        for (JsonNode e : slow.path("entries")) {
            report.append("- ").append(e.path("durationUs").asLong()).append("us · ").append(e.path("command").asText()).append('\n');
        }
        ObjectNode out = mapper().createObjectNode();
        out.put("ok", true);
        out.put("report", report.toString());
        out.set("overview", ov);
        out.set("memory", mem);
        out.set("slowlog", slow);
        out.set("replication", repl);
        return out;
    }

    private Workspace openWorkspace(JsonNode connection) {
        String id = connection.path("id").asText("anon");
        String kind = first(cfg(connection, "workspaceKind"), "single").toLowerCase(Locale.ROOT);
        Workspace ws = new Workspace(id, kind);
        if ("fleet".equals(kind)) {
            String inv = cfg(connection, "inventoryPath");
            if (inv.isBlank()) throw new IllegalArgumentException("inventoryPath is required for fleet workspace");
            loadInventory(ws, Path.of(inv));
        } else {
            String password = first(connection.path("password").asText(""), cfg(connection, "password"));
            // ACL user only from the plugin field. Host also copies JDBC/SSH user onto connection.username,
            // and Redis < 6 rejects AUTH user pass (or hangs the handshake).
            String username = externalText(connection, "username");
            int database = parseInt(first(externalText(connection, "database"), cfg(connection, "database"), "0"), 0);
            boolean ssl = truthy(externalText(connection, "ssl"));
            Instance inst;
            if ("sentinel".equals(kind)) {
                String nodesRaw = first(cfg(connection, "sentinelNodes"), externalText(connection, "sentinelNodes"));
                Set<HostAndPort> sentinels = parseHostPorts(nodesRaw, 26379);
                if (sentinels.isEmpty()) {
                    throw new IllegalArgumentException("sentinelNodes is required (host:port,host:port)");
                }
                String masterName = first(cfg(connection, "masterName"), externalText(connection, "masterName"), "mymaster");
                String sentinelPassword = first(cfg(connection, "sentinelPassword"), externalText(connection, "sentinelPassword"));
                HostAndPort seed = sentinels.iterator().next();
                inst = new Instance(
                        "default",
                        "sentinel/" + masterName,
                        seed.getHost(),
                        seed.getPort(),
                        database,
                        password,
                        username,
                        ssl,
                        "sentinel"
                );
                inst.mode = Instance.Mode.SENTINEL;
                inst.masterName = masterName;
                inst.sentinelPassword = sentinelPassword;
                inst.sentinelNodes = sentinels;
            } else if ("cluster".equals(kind)) {
                String nodesRaw = first(cfg(connection, "clusterNodes"), externalText(connection, "clusterNodes"));
                Set<HostAndPort> seeds = parseHostPorts(nodesRaw, 6379);
                if (seeds.isEmpty()) {
                    throw new IllegalArgumentException("clusterNodes is required (host:port,host:port)");
                }
                HostAndPort seed = seeds.iterator().next();
                inst = new Instance(
                        "default",
                        "cluster/" + seed.getHost(),
                        seed.getHost(),
                        seed.getPort(),
                        0,
                        password,
                        username,
                        ssl,
                        "cluster"
                );
                inst.mode = Instance.Mode.CLUSTER;
                inst.clusterNodes = seeds;
            } else {
                String host = first(connection.path("host").asText(""), "127.0.0.1");
                int port = parsePort(connection.path("port").asText("6379"), 6379);
                inst = new Instance("default", host + ":" + port, host, port, database, password, username, ssl, "");
            }
            ws.instances.put(inst.id, inst);
            ws.activeId = inst.id;
        }
        if (ws.activeId == null && !ws.instances.isEmpty()) {
            ws.activeId = ws.instances.keySet().iterator().next();
        }
        return ws;
    }

    private void loadInventory(Workspace ws, Path file) {
        if (!Files.isRegularFile(file)) throw new IllegalArgumentException("Inventory not found: " + file);
        try {
            JsonNode root = yaml.readTree(file.toFile());
            JsonNode list = root.path("instances");
            if (!list.isArray() || list.isEmpty()) {
                throw new IllegalArgumentException("inventory.instances must be a non-empty array");
            }
            for (JsonNode n : list) {
                String iid = first(n.path("id").asText(""), n.path("name").asText(""), n.path("host").asText(""));
                if (iid.isBlank()) continue;
                Instance inst = new Instance(
                        iid,
                        first(n.path("name").asText(""), iid),
                        first(n.path("host").asText(""), "127.0.0.1"),
                        n.path("port").asInt(6379),
                        n.path("database").asInt(0),
                        n.path("password").asText(""),
                        n.path("username").asText(""),
                        truthy(n.path("ssl")),
                        tagsOf(n.path("tags"))
                );
                ws.instances.put(inst.id, inst);
            }
            if (ws.instances.isEmpty()) throw new IllegalArgumentException("No valid instances in inventory");
            ws.activeId = ws.instances.keySet().iterator().next();
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to read inventory: " + e.getMessage());
        }
    }

    private Path demoFleet() {
        Path dest = (pluginDataDir != null ? pluginDataDir : Path.of("").toAbsolutePath()).resolve("demo-fleet");
        try (var in = RedisOpsPluginMain.class.getResourceAsStream("/demo-fleet/redis-fleet.yml")) {
            if (in != null) {
                Files.createDirectories(dest);
                Files.copy(in, dest.resolve("redis-fleet.yml"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
            // best effort
        }
        return dest.resolve("redis-fleet.yml");
    }

    private static boolean isDangerous(String verb, String[] parts) {
        if ("CONFIG".equals(verb)) {
            return parts.length < 2 || !"GET".equalsIgnoreCase(parts[1]);
        }
        return DANGEROUS.contains(verb);
    }

    private static String formatReply(Object reply) {
        if (reply == null) return "(nil)";
        if (reply instanceof byte[] bytes) return new String(bytes, StandardCharsets.UTF_8);
        if (reply instanceof List<?> list) {
            return list.stream().map(RedisOpsPluginMain::formatReply).collect(Collectors.joining("\n"));
        }
        return String.valueOf(reply);
    }

    private static byte[][] restArgs(String[] parts) {
        if (parts.length <= 1) return new byte[0][];
        byte[][] args = new byte[parts.length - 1][];
        for (int i = 1; i < parts.length; i++) args[i - 1] = parts[i].getBytes(StandardCharsets.UTF_8);
        return args;
    }

    private static String[] splitCommand(String raw) {
        List<String> parts = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuote = false;
        char quote = 0;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (inQuote) {
                if (c == quote) inQuote = false;
                else cur.append(c);
                continue;
            }
            if (c == '"' || c == '\'') {
                inQuote = true;
                quote = c;
                continue;
            }
            if (Character.isWhitespace(c)) {
                if (!cur.isEmpty()) {
                    parts.add(cur.toString());
                    cur.setLength(0);
                }
                continue;
            }
            cur.append(c);
        }
        if (!cur.isEmpty()) parts.add(cur.toString());
        return parts.toArray(String[]::new);
    }

    private static Map<String, String> parseInfo(String info) {
        Map<String, String> map = new LinkedHashMap<>();
        if (info == null) return map;
        for (String line : info.split("\\r?\\n")) {
            if (line.isBlank() || line.startsWith("#")) continue;
            int colon = line.indexOf(':');
            if (colon > 0) map.put(line.substring(0, colon), line.substring(colon + 1));
        }
        return map;
    }

    private String cfg(JsonNode connection, String key) {
        String ext = externalText(connection, key);
        if (!ext.isEmpty()) return ext;
        JsonNode cfg = connection.path("config");
        if (cfg.isObject() && cfg.has(key)) return cfg.path(key).asText("");
        return connection.path(key).asText("");
    }

    /** Plugin form fields only. Does not fall through to host-injected connection.username. */
    private static String externalText(JsonNode connection, String key) {
        JsonNode ext = connection.path("external_config");
        if (ext.isObject() && ext.has(key) && !ext.get(key).isNull()) {
            return ext.get(key).asText("");
        }
        return "";
    }

    private ObjectNode ok(Object... kv) {
        ObjectNode n = mapper().createObjectNode();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            Object v = kv[i + 1];
            String k = String.valueOf(kv[i]);
            if (v instanceof Boolean b) n.put(k, b);
            else if (v instanceof Integer iv) n.put(k, iv);
            else if (v instanceof Long lv) n.put(k, lv);
            else if (v instanceof Double dv) n.put(k, dv);
            else n.put(k, String.valueOf(v));
        }
        return n;
    }

    private static String tagsOf(JsonNode tags) {
        if (!tags.isArray()) return tags.isTextual() ? tags.asText("") : "";
        StringBuilder sb = new StringBuilder();
        for (JsonNode t : tags) {
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(t.asText());
        }
        return sb.toString();
    }

    private static String first(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return "";
    }

    private static int parsePort(String raw, int fallback) {
        try { return Integer.parseInt(raw.trim()); } catch (Exception e) { return fallback; }
    }

    private static int parseInt(String raw, int fallback) {
        try { return Integer.parseInt(raw.trim()); } catch (Exception e) { return fallback; }
    }

    private static long parseLong(String raw) {
        try { return Long.parseLong(raw.trim()); } catch (Exception e) { return 0L; }
    }

    private static long parseInfoField(String raw, String field) {
        if (raw == null) return 0;
        for (String part : raw.split(",")) {
            String[] kv = part.split("=");
            if (kv.length == 2 && field.equals(kv[0].trim())) return parseLong(kv[1]);
        }
        return 0;
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    private static boolean truthy(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return false;
        if (n.isBoolean()) return n.asBoolean();
        String t = n.asText("").trim().toLowerCase(Locale.ROOT);
        return "1".equals(t) || "true".equals(t) || "yes".equals(t) || "on".equals(t);
    }

    private static boolean truthy(String raw) {
        if (raw == null) return false;
        String t = raw.trim().toLowerCase(Locale.ROOT);
        return "1".equals(t) || "true".equals(t) || "yes".equals(t) || "on".equals(t);
    }

    private static Set<HostAndPort> parseHostPorts(String raw, int defaultPort) {
        Set<HostAndPort> out = new LinkedHashSet<>();
        if (raw == null || raw.isBlank()) return out;
        for (String part : raw.split("[,;\\s]+")) {
            String p = part.trim();
            if (p.isEmpty()) continue;
            int colon = p.lastIndexOf(':');
            if (colon > 0 && colon < p.length() - 1) {
                String h = p.substring(0, colon).trim();
                int port = parsePort(p.substring(colon + 1), defaultPort);
                if (!h.isEmpty()) out.add(new HostAndPort(h, port));
            } else {
                out.add(new HostAndPort(p, defaultPort));
            }
        }
        return out;
    }

    private static String msg(Exception e) {
        return e.getMessage() == null ? e.toString() : e.getMessage();
    }

    private record KeySize(String key, String type, long bytes) {}

    private static final class Workspace {
        final String id;
        final String kind;
        final Map<String, Instance> instances = new LinkedHashMap<>();
        volatile String activeId;

        Workspace(String id, String kind) {
            this.id = id;
            this.kind = kind;
        }

        void close() {
            for (Instance i : instances.values()) i.closeQuietly();
        }
    }

    private static final class Instance {
        enum Mode {
            STANDALONE, SENTINEL, CLUSTER;

            String label() {
                return name().toLowerCase(Locale.ROOT);
            }
        }

        final String id;
        final String name;
        volatile String host;
        volatile int port;
        volatile int database;
        final String password;
        final String username;
        final boolean ssl;
        final String tags;
        volatile Mode mode = Mode.STANDALONE;
        volatile String masterName = "";
        volatile String sentinelPassword = "";
        volatile Set<HostAndPort> sentinelNodes = Set.of();
        volatile Set<HostAndPort> clusterNodes = Set.of();
        volatile Jedis jedis;

        Instance(String id, String name, String host, int port, int database, String password, String username, boolean ssl, String tags) {
            this.id = id;
            this.name = name;
            this.host = host;
            this.port = port;
            this.database = database;
            this.password = password == null ? "" : password;
            this.username = username == null ? "" : username;
            this.ssl = ssl;
            this.tags = tags == null ? "" : tags;
        }

        String endpointLabel() {
            return mode.label() + " " + host + ":" + port
                    + " ssl=" + ssl
                    + " acl=" + (username.isBlank() ? "no" : "yes")
                    + (mode == Mode.CLUSTER ? "" : " db=" + database)
                    + (mode == Mode.SENTINEL ? " master=" + masterName : "");
        }

        private JedisClientConfig redisClientConfig(int db) {
            // Leave protocol unset. Jedis sends HELLO whenever a protocol is set,
            // including RESP2, and Redis <= 5 rejects HELLO. AUTH-only works on 4.x.
            // CLIENT SETINFO is Redis 7.2+; disable it so the handshake does not stall.
            DefaultJedisClientConfig.Builder cfg = DefaultJedisClientConfig.builder()
                    .clientSetInfoConfig(ClientSetInfoConfig.DISABLED)
                    .connectionTimeoutMillis(5000)
                    .socketTimeoutMillis(12000)
                    .database(Math.max(0, db));
            if (ssl) cfg.ssl(true);
            if (!username.isBlank()) cfg.user(username);
            if (!password.isBlank()) cfg.password(password);
            return cfg.build();
        }

        private JedisClientConfig sentinelClientConfig() {
            DefaultJedisClientConfig.Builder cfg = DefaultJedisClientConfig.builder()
                    .clientSetInfoConfig(ClientSetInfoConfig.DISABLED)
                    .connectionTimeoutMillis(4000)
                    .socketTimeoutMillis(6000);
            if (ssl) cfg.ssl(true);
            if (sentinelPassword != null && !sentinelPassword.isBlank()) cfg.password(sentinelPassword);
            return cfg.build();
        }

        private HostAndPort resolveSentinelMaster() {
            Exception last = null;
            for (HostAndPort sp : sentinelNodes) {
                try (Jedis sentinel = new Jedis(sp, sentinelClientConfig())) {
                    List<String> addr = sentinel.sentinelGetMasterAddrByName(masterName);
                    if (addr != null && addr.size() >= 2) {
                        return new HostAndPort(addr.get(0), Integer.parseInt(addr.get(1)));
                    }
                    last = new IllegalStateException("master '" + masterName + "' not found on " + sp);
                } catch (Exception e) {
                    last = e;
                }
            }
            throw new IllegalStateException(
                    "Cannot resolve Sentinel master '" + masterName + "' from " + sentinelNodes.size() + " node(s)",
                    last);
        }

        /**
         * Pick the first cluster master from CLUSTER NODES for a Jedis session.
         * Full multi-master key routing is not supported; Keys/SCAN are node-local.
         */
        private HostAndPort resolveClusterNode() {
            Exception last = null;
            Set<HostAndPort> seeds = clusterNodes == null || clusterNodes.isEmpty()
                    ? Set.of(new HostAndPort(host, port))
                    : clusterNodes;
            for (HostAndPort seed : seeds) {
                try (Jedis probe = new Jedis(seed, redisClientConfig(0))) {
                    String nodes = probe.clusterNodes();
                    HostAndPort master = parseClusterMaster(nodes);
                    if (master != null) return master;
                    last = new IllegalStateException("no master in CLUSTER NODES from " + seed);
                } catch (Exception e) {
                    last = e;
                }
            }
            throw new IllegalStateException(
                    "Cannot resolve Cluster master from " + seeds.size() + " seed(s)",
                    last);
        }

        private static HostAndPort parseClusterMaster(String clusterNodes) {
            if (clusterNodes == null || clusterNodes.isBlank()) return null;
            for (String line : clusterNodes.split("\\r?\\n")) {
                String t = line.trim();
                if (t.isEmpty() || t.contains("fail") || t.contains("handshake")) continue;
                // id ip:port@bus flags ...
                String[] parts = t.split("\\s+");
                if (parts.length < 3) continue;
                String flags = parts[2].toLowerCase(Locale.ROOT);
                if (!flags.contains("master") || flags.contains("noaddr")) continue;
                String endpoint = parts[1];
                int at = endpoint.indexOf('@');
                if (at > 0) endpoint = endpoint.substring(0, at);
                int colon = endpoint.lastIndexOf(':');
                if (colon <= 0) continue;
                String h = endpoint.substring(0, colon);
                if (h.startsWith("[")) { // IPv6 [addr]:port — skip for now
                    continue;
                }
                try {
                    return new HostAndPort(h, Integer.parseInt(endpoint.substring(colon + 1)));
                } catch (Exception ignored) {
                    // try next line
                }
            }
            return null;
        }

        synchronized void ensure() {
            if (jedis != null) {
                try {
                    jedis.ping();
                    if (mode != Mode.CLUSTER) {
                        // Keep session on the selected logical DB after reconnect races.
                        jedis.select(database);
                    }
                    return;
                } catch (Exception e) {
                    closeQuietly();
                }
            }
            if (mode == Mode.SENTINEL) {
                HostAndPort master = resolveSentinelMaster();
                host = master.getHost();
                port = master.getPort();
                jedis = new Jedis(master, redisClientConfig(database));
            } else if (mode == Mode.CLUSTER) {
                HostAndPort node = resolveClusterNode();
                host = node.getHost();
                port = node.getPort();
                jedis = new Jedis(node, redisClientConfig(0));
            } else {
                jedis = new Jedis(new HostAndPort(host, port), redisClientConfig(database));
            }
            jedis.ping();
        }

        synchronized void closeQuietly() {
            if (jedis != null) {
                try { jedis.close(); } catch (Exception ignored) { }
                jedis = null;
            }
        }
    }
}
