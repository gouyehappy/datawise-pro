package org.apache.datawise.plugin.sdk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

/**
 * Base class for DataWise community plugin sidecars using {@code stdio-jsonl} JSON-RPC.
 */
public abstract class StdioJsonRpcSidecar {

    private final ObjectMapper mapper;
    private final Object outLock = new Object();
    private volatile BufferedWriter outWriter;

    protected StdioJsonRpcSidecar() {
        this(new ObjectMapper());
    }

    protected StdioJsonRpcSidecar(ObjectMapper mapper) {
        this.mapper = mapper != null ? mapper : new ObjectMapper();
    }

    protected final ObjectMapper mapper() {
        return mapper;
    }

    /** Handle one RPC method. Throw to return a JSON-RPC error. */
    protected abstract JsonNode handle(String method, JsonNode params) throws Exception;

    /**
     * Emit a JSON-RPC notification (no {@code id}) to the host while handling a request.
     * Hosts with {@code host.events}/{@code host.binary} forward these over the plugin stream.
     */
    protected final void emitEvent(String method, JsonNode params) {
        BufferedWriter writer = outWriter;
        if (writer == null || method == null || method.isBlank()) {
            return;
        }
        try {
            ObjectNode note = mapper.createObjectNode();
            note.put("jsonrpc", "2.0");
            note.put("method", method);
            if (params != null) {
                note.set("params", params);
            } else {
                note.putObject("params");
            }
            synchronized (outLock) {
                writer.write(mapper.writeValueAsString(note));
                writer.newLine();
                writer.flush();
            }
        } catch (Exception ignored) {
            // best-effort progress — never fail the RPC
        }
    }

    /**
     * Throw from {@link #handle} for unknown methods: the sidecar answers the
     * standard JSON-RPC {@code -32601} so hosts can apply method-not-found
     * handling (e.g. tolerating optional lifecycle calls) without string matching.
     */
    public static final class UnknownMethodException extends RuntimeException {

        public UnknownMethodException(String method) {
            super("Method not found: " + method);
        }
    }

    public final void run(InputStream in, OutputStream out) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        this.outWriter = writer;
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
                response.set("result", handle(request.path("method").asText(), request.path("params")));
            } catch (UnknownMethodException e) {
                ObjectNode error = response.putObject("error");
                error.put("code", -32601);
                error.put("message", e.getMessage());
            } catch (Exception e) {
                ObjectNode error = response.putObject("error");
                error.put("code", -32000);
                error.put("message", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
            synchronized (outLock) {
                writer.write(mapper.writeValueAsString(response));
                writer.newLine();
                writer.flush();
            }
        }
    }

    public final void runStdio() throws Exception {
        run(System.in, System.out);
    }
}
