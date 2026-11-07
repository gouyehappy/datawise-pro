package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginTransport;
import org.apache.datawise.backend.domain.communityplugin.InstalledCommunityPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Sidecar JSON-RPC session over {@code stdio-jsonl} or DBX-compatible {@code stdio-framed}.
 */
public final class CommunityPluginSidecarSession implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(CommunityPluginSidecarSession.class);
    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(30);
    /** Must stay in sync with {@code CommunityPluginCompatibilityGate.HOST_API}. */
    public static final String HOST_API_VERSION = "1.7";
    public static final int PROTOCOL_VERSION_INT = 1;
    public static final String PROTOCOL_VERSION = "1";

    private final String pluginId;
    private final ObjectMapper mapper;
    private final Process process;
    private final CommunityPluginTransport transport;
    private final OutputStream stdinRaw;
    private final InputStream stdoutRaw;
    private final BufferedWriter jsonlWriter;
    private final BufferedReader jsonlReader;
    private final AtomicLong nextId = new AtomicLong(1);
    private final ConcurrentHashMap<Long, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final Thread readerThread;
    private final CopyOnWriteArrayList<Consumer<JsonNode>> eventListeners = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<BiConsumer<String, byte[]>> binaryListeners = new CopyOnWriteArrayList<>();

    private CommunityPluginSidecarSession(
            String pluginId,
            ObjectMapper mapper,
            Process process,
            CommunityPluginTransport transport,
            InputStream stdout,
            OutputStream stdin
    ) {
        this.pluginId = pluginId;
        this.mapper = mapper;
        this.process = process;
        this.transport = transport != null ? transport : CommunityPluginTransport.STDIO_JSONL;
        this.stdoutRaw = stdout;
        this.stdinRaw = stdin;
        if (this.transport.isFramed()) {
            this.jsonlWriter = null;
            this.jsonlReader = null;
        } else {
            this.jsonlWriter = new BufferedWriter(new OutputStreamWriter(stdin, StandardCharsets.UTF_8));
            this.jsonlReader = new BufferedReader(new InputStreamReader(stdout, StandardCharsets.UTF_8));
        }
        this.readerThread = new Thread(this::readLoop, "community-plugin-" + pluginId);
        this.readerThread.setDaemon(true);
        this.readerThread.start();
    }

    public static CommunityPluginSidecarSession start(
            InstalledCommunityPlugin plugin,
            ObjectMapper mapper,
            Path pluginDataDir,
            String appVersion
    ) {
        Objects.requireNonNull(plugin, "plugin");
        CommunityPluginTransport transport = CommunityPluginTransport.fromWire(
                plugin.manifest().entrypoints().backend().transport());
        Path exe = resolveExecutable(plugin);
        try {
            Files.createDirectories(pluginDataDir);
            List<String> command = buildCommand(exe);
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(plugin.path().toFile());
            pb.redirectError(ProcessBuilder.Redirect.INHERIT);
            Map<String, String> env = pb.environment();
            env.put("DATAWISE_PLUGIN_DATA_DIR", pluginDataDir.toAbsolutePath().toString());
            env.put("DATAWISE_PLUGIN_ID", plugin.manifest().id());
            env.put("DATAWISE_APP_VERSION", appVersion != null ? appVersion : "");
            Process process = pb.start();
            CommunityPluginSidecarSession session = new CommunityPluginSidecarSession(
                    plugin.manifest().id(),
                    mapper,
                    process,
                    transport,
                    process.getInputStream(),
                    process.getOutputStream()
            );
            session.initialize(appVersion, pluginDataDir);
            return session;
        } catch (CommunityPluginException e) {
            throw e;
        } catch (Exception e) {
            throw new CommunityPluginException("Failed to start plugin sidecar: " + e.getMessage(), e);
        }
    }

    /** Test helper: attach to existing streams (no OS process). Defaults to jsonl. */
    public static CommunityPluginSidecarSession attach(
            String pluginId,
            ObjectMapper mapper,
            InputStream stdout,
            OutputStream stdin,
            String appVersion,
            Path pluginDataDir
    ) {
        return attach(pluginId, mapper, stdout, stdin, appVersion, pluginDataDir, CommunityPluginTransport.STDIO_JSONL);
    }

    public static CommunityPluginSidecarSession attach(
            String pluginId,
            ObjectMapper mapper,
            InputStream stdout,
            OutputStream stdin,
            String appVersion,
            Path pluginDataDir,
            CommunityPluginTransport transport
    ) {
        CommunityPluginSidecarSession session =
                new CommunityPluginSidecarSession(pluginId, mapper, null, transport, stdout, stdin);
        session.initialize(appVersion, pluginDataDir);
        return session;
    }

    public String pluginId() {
        return pluginId;
    }

    public CommunityPluginTransport transport() {
        return transport;
    }

    public void addEventListener(Consumer<JsonNode> listener) {
        if (listener != null) {
            eventListeners.add(listener);
        }
    }

    public void removeEventListener(Consumer<JsonNode> listener) {
        eventListeners.remove(listener);
    }

    public void addBinaryListener(BiConsumer<String, byte[]> listener) {
        if (listener != null) {
            binaryListeners.add(listener);
        }
    }

    public void removeBinaryListener(BiConsumer<String, byte[]> listener) {
        binaryListeners.remove(listener);
    }

    public JsonNode invoke(String method, JsonNode params) {
        return invoke(method, params, DEFAULT_TIMEOUT);
    }

    public JsonNode invoke(String method, JsonNode params, Duration timeout) {
        ensureOpen();
        long id = nextId.getAndIncrement();
        ObjectNode request = mapper.createObjectNode();
        request.put("jsonrpc", "2.0");
        request.put("id", id);
        request.put("method", method);
        if (params != null) {
            request.set("params", params);
        } else {
            request.putObject("params");
        }
        CompletableFuture<JsonNode> future = new CompletableFuture<>();
        pending.put(id, future);
        try {
            writeJsonMessage(request);
            return future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (CommunityPluginException e) {
            pending.remove(id);
            throw e;
        } catch (Exception e) {
            pending.remove(id);
            if (e instanceof InterruptedException || e.getCause() instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new CommunityPluginException(
                    "Plugin invoke '" + method + "' failed: " + rootMessage(e),
                    rpcErrorCode(e),
                    e);
        }
    }

    private static Throwable rootCause(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        return cause;
    }

    private static String rootMessage(Throwable e) {
        Throwable root = rootCause(e);
        return root.getMessage() != null ? root.getMessage() : root.toString();
    }

    private static Integer rpcErrorCode(Throwable e) {
        Throwable root = rootCause(e);
        if (root instanceof CommunityPluginException cpe) {
            return cpe.getRpcErrorCode();
        }
        return null;
    }

    public void notify(String method, JsonNode params) {
        ensureOpen();
        ObjectNode note = mapper.createObjectNode();
        note.put("jsonrpc", "2.0");
        note.put("method", method);
        if (params != null) {
            note.set("params", params);
        }
        try {
            writeJsonMessage(note);
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to notify plugin: " + e.getMessage(), e);
        }
    }

    /** Host → plugin binary frame (framed transport only). */
    public void sendBinary(String channel, byte[] data) {
        ensureOpen();
        if (!transport.isFramed()) {
            throw new CommunityPluginException("Binary frames require stdio-framed transport");
        }
        try {
            synchronized (stdinRaw) {
                PluginFramedCodec.writeBinary(stdinRaw, channel, data);
            }
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to send binary frame: " + e.getMessage(), e);
        }
    }

    private void initialize(String appVersion, Path pluginDataDir) {
        ObjectNode params = mapper.createObjectNode();
        params.put("hostApi", HOST_API_VERSION);
        params.put("protocolVersion", PROTOCOL_VERSION_INT);
        params.put("appVersion", appVersion != null ? appVersion : "");
        params.put("pluginDataDir", pluginDataDir != null ? pluginDataDir.toAbsolutePath().toString() : "");
        ObjectNode host = params.putObject("host");
        host.put("hostApi", HOST_API_VERSION);
        ArrayNode versions = host.putArray("protocolVersions");
        versions.add(PROTOCOL_VERSION_INT);
        JsonNode result = invoke("plugin/initialize", params, Duration.ofSeconds(15));
        if (result == null) {
            return;
        }
        if (result.has("ok") && !result.get("ok").asBoolean(true)) {
            throw new CommunityPluginException("Plugin initialize rejected: " + result);
        }
        if (result.has("protocolVersion")) {
            int negotiated = result.get("protocolVersion").asInt(-1);
            if (negotiated != PROTOCOL_VERSION_INT) {
                throw new CommunityPluginException("Plugin protocol version mismatch: " + negotiated);
            }
        }
    }

    private void writeJsonMessage(JsonNode message) throws IOException {
        byte[] payload = mapper.writeValueAsBytes(message);
        if (transport.isFramed()) {
            synchronized (stdinRaw) {
                PluginFramedCodec.writeJson(stdinRaw, payload);
            }
        } else {
            synchronized (jsonlWriter) {
                jsonlWriter.write(new String(payload, StandardCharsets.UTF_8));
                jsonlWriter.newLine();
                jsonlWriter.flush();
            }
        }
    }

    private void readLoop() {
        try {
            if (transport.isFramed()) {
                readFramedLoop();
            } else {
                readJsonlLoop();
            }
        } catch (Exception e) {
            if (e instanceof InterruptedException || e.getCause() instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            if (!closed.get()) {
                log.warn("Community plugin {} stdout reader ended: {}", pluginId, e.getMessage());
                failAll(e);
            }
        } finally {
            failAll(new CommunityPluginException("Plugin sidecar closed"));
        }
    }

    private void readJsonlLoop() throws IOException {
        String line;
        while (!closed.get() && (line = jsonlReader.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            dispatchJsonMessage(mapper.readTree(line));
        }
    }

    private void readFramedLoop() throws IOException {
        while (!closed.get()) {
            PluginFramedCodec.Frame frame = PluginFramedCodec.readFrame(stdoutRaw);
            if (frame == null) {
                return;
            }
            if (frame instanceof PluginFramedCodec.JsonFrame json) {
                dispatchJsonMessage(mapper.readTree(json.payload()));
            } else if (frame instanceof PluginFramedCodec.BinaryFrame binary) {
                for (BiConsumer<String, byte[]> listener : binaryListeners) {
                    try {
                        listener.accept(binary.channel(), binary.data());
                    } catch (Exception e) {
                        log.debug("Binary listener failed for {}: {}", pluginId, e.getMessage());
                    }
                }
            }
        }
    }

    private void dispatchJsonMessage(JsonNode message) {
        if (message.has("id") && (message.has("result") || message.has("error"))) {
            long id = message.get("id").asLong();
            CompletableFuture<JsonNode> future = pending.remove(id);
            if (future == null) {
                return;
            }
            if (message.has("error")) {
                JsonNode error = message.get("error");
                String msg = error.has("message") ? error.get("message").asText() : error.toString();
                Integer code = error.has("code") && error.get("code").isInt() ? error.get("code").asInt() : null;
                future.completeExceptionally(new CommunityPluginException(msg, code));
            } else {
                future.complete(message.get("result"));
            }
            return;
        }
        if (message.has("method")) {
            for (Consumer<JsonNode> listener : eventListeners) {
                try {
                    listener.accept(message);
                } catch (Exception e) {
                    log.debug("Event listener failed for {}: {}", pluginId, e.getMessage());
                }
            }
        }
    }

    private void failAll(Throwable error) {
        for (CompletableFuture<JsonNode> future : pending.values()) {
            future.completeExceptionally(error);
        }
        pending.clear();
    }

    private void ensureOpen() {
        if (closed.get()) {
            throw new CommunityPluginException("Plugin sidecar is closed: " + pluginId);
        }
        if (process != null && !process.isAlive()) {
            throw new CommunityPluginException("Plugin sidecar process exited: " + pluginId);
        }
    }

    static Path resolveExecutable(InstalledCommunityPlugin plugin) {
        String executable = plugin.manifest().entrypoints().backend().executable();
        Path root = plugin.path();
        Path direct = root.resolve(executable).normalize();
        if (direct.startsWith(root) && Files.isRegularFile(direct)) {
            return direct;
        }
        // Prefer bin/<os-arch>/<filename> when package ships multi-arch layout.
        Path fileName = Path.of(executable).getFileName();
        if (fileName != null) {
            Path targeted = root.resolve("bin")
                    .resolve(org.apache.datawise.backend.domain.communityplugin.DwpCodec.currentTarget())
                    .resolve(fileName.toString())
                    .normalize();
            if (targeted.startsWith(root) && Files.isRegularFile(targeted)) {
                return targeted;
            }
        }
        throw new CommunityPluginException("Backend executable not found: " + executable);
    }

    private static List<String> buildCommand(Path exe) {
        List<String> command = new ArrayList<>();
        String name = exe.getFileName().toString().toLowerCase();
        if (name.endsWith(".bat") || name.endsWith(".cmd")) {
            command.add("cmd.exe");
            command.add("/c");
            command.add(exe.toAbsolutePath().toString());
        } else if (name.endsWith(".jar")) {
            // Prefer java.home — desktop installers are a single JVM under jpackage, so
            // ProcessHandle.current().command() is often DataWiseCLI.exe (not java).
            // Spawning that with "-jar plugin.jar" exits immediately → "Plugin sidecar closed".
            command.add(resolveJavaExecutable());
            command.add("-jar");
            command.add(exe.toAbsolutePath().toString());
        } else {
            command.add(exe.toAbsolutePath().toString());
        }
        return command;
    }

    /** Visible for tests: absolute path to the host JVM's {@code java} binary when possible. */
    static String resolveJavaExecutable() {
        String home = System.getProperty("java.home");
        if (home != null && !home.isBlank()) {
            boolean win = System.getProperty("os.name", "").toLowerCase().contains("win");
            Path java = Path.of(home.trim(), "bin", win ? "java.exe" : "java");
            if (Files.isRegularFile(java)) {
                return java.toAbsolutePath().toString();
            }
        }
        return ProcessHandle.current().info().command().orElse("java");
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        failAll(new CommunityPluginException("Plugin sidecar stopped"));
        try {
            if (jsonlWriter != null) {
                jsonlWriter.close();
            } else {
                stdinRaw.close();
            }
        } catch (IOException ignored) {
        }
        if (process != null) {
            process.destroy();
            try {
                if (!process.waitFor(3, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    // Windows keeps the image mapped until the process truly
                    // exits; wait so the installer can move the version dir.
                    process.waitFor(5, TimeUnit.SECONDS);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                process.destroyForcibly();
                try {
                    process.waitFor(2, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        }
        readerThread.interrupt();
    }
}
