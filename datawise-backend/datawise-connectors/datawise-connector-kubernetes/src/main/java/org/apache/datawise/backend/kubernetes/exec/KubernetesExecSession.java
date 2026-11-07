package org.apache.datawise.backend.kubernetes.exec;

import org.apache.datawise.backend.kubernetes.KubernetesConnectionConfig;
import org.apache.datawise.backend.kubernetes.KubernetesTlsSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.IntConsumer;

/**
 * Interactive pod exec via Kubernetes WebSocket channel protocol ({@code v4.channel.k8s.io}).
 * Channel 0=stdin, 1=stdout, 2=stderr, 3=error, 4=resize.
 * <p>
 * Uses a raw socket WebSocket client (not JDK {@code HttpClient}) so
 * {@code insecureSkipTlsVerify} can skip hostname verification the same way REST does.
 */
public final class KubernetesExecSession {

    private static final Logger log = LoggerFactory.getLogger(KubernetesExecSession.class);
    private static final String SUBPROTOCOL = "v4.channel.k8s.io";
    private static final byte CHANNEL_STDIN = 0;
    private static final byte CHANNEL_STDOUT = 1;
    private static final byte CHANNEL_STDERR = 2;
    private static final byte CHANNEL_ERROR = 3;
    private static final byte CHANNEL_RESIZE = 4;
    private static final int OPCODE_TEXT = 0x1;
    private static final int OPCODE_BINARY = 0x2;
    private static final int OPCODE_CLOSE = 0x8;
    private static final int OPCODE_PING = 0x9;
    private static final int OPCODE_PONG = 0xA;
    private static final int CONNECT_TIMEOUT_MS = 20_000;

    private final String sessionId;
    private final Socket socket;
    private final OutputStream output;
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final Object writeLock = new Object();
    private volatile Consumer<byte[]> outputHandler = data -> {
    };
    private volatile IntConsumer exitHandler = code -> {
    };
    private Thread readerThread;

    private KubernetesExecSession(String sessionId, Socket socket, OutputStream output) {
        this.sessionId = sessionId;
        this.socket = socket;
        this.output = output;
    }

    public static KubernetesExecSession open(
            String sessionId,
            ConnectionEntity entity,
            String namespace,
            String podName,
            String container,
            int cols,
            int rows,
            List<String> command
    ) throws Exception {
        if (namespace == null || namespace.isBlank()) {
            throw new IllegalArgumentException("namespace is required");
        }
        if (podName == null || podName.isBlank()) {
            throw new IllegalArgumentException("podName is required");
        }
        KubernetesConnectionConfig config = KubernetesConnectionConfig.from(entity);
        List<String> cmd = command == null || command.isEmpty()
                ? List.of("/bin/sh", "-c", "exec /bin/bash || exec /bin/sh")
                : List.copyOf(command);
        String path = "/api/v1/namespaces/" + encode(namespace) + "/pods/" + encode(podName) + "/exec"
                + buildExecQuery(cmd, container);
        URI httpUri = config.resolve(path);
        URI wsUri = toWebSocketUri(httpUri);

        Socket socket = null;
        try {
            socket = KubernetesTlsSupport.openSocket(wsUri, config.insecureSkipTlsVerify(), CONNECT_TIMEOUT_MS);
            OutputStream out = socket.getOutputStream();
            InputStream in = socket.getInputStream();
            performHandshake(wsUri, out, in, config.bearerToken());
            KubernetesExecSession session = new KubernetesExecSession(sessionId, socket, out);
            socket = null;
            session.startReader(in);
            session.resize(cols > 0 ? cols : 80, rows > 0 ? rows : 24);
            return session;
        } catch (Exception ex) {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // ignore
                }
            }
            throw new IllegalStateException(formatWebSocketError(ex), ex);
        }
    }

    public void pumpOutput(Consumer<byte[]> onOutput, IntConsumer onExit) {
        this.outputHandler = onOutput != null ? onOutput : data -> {
        };
        this.exitHandler = onExit != null ? onExit : code -> {
        };
    }

    public void write(String data) {
        if (closed.get() || data == null || data.isEmpty()) {
            return;
        }
        byte[] payload = data.getBytes(StandardCharsets.UTF_8);
        byte[] frame = new byte[1 + payload.length];
        frame[0] = CHANNEL_STDIN;
        System.arraycopy(payload, 0, frame, 1, payload.length);
        sendFrame(OPCODE_BINARY, frame);
    }

    public void resize(int cols, int rows) {
        if (closed.get()) {
            return;
        }
        int safeCols = Math.max(1, cols);
        int safeRows = Math.max(1, rows);
        String json = "{\"Width\":" + safeCols + ",\"Height\":" + safeRows + "}";
        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        byte[] frame = new byte[1 + payload.length];
        frame[0] = CHANNEL_RESIZE;
        System.arraycopy(payload, 0, frame, 1, payload.length);
        sendFrame(OPCODE_BINARY, frame);
    }

    public void destroy() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        try {
            sendFrame(OPCODE_CLOSE, new byte[]{0x03, (byte) 0xe8}); // 1000
        } catch (Exception ex) {
            log.debug("k8s.exec close frame failed sessionId={}", sessionId, ex);
        }
        try {
            socket.close();
        } catch (Exception ex) {
            log.debug("k8s.exec socket close failed sessionId={}", sessionId, ex);
        }
        if (readerThread != null && readerThread != Thread.currentThread()) {
            readerThread.interrupt();
        }
    }

    private void startReader(InputStream in) {
        Thread thread = new Thread(() -> readLoop(in), "k8s-exec-ws-" + sessionId);
        thread.setDaemon(true);
        this.readerThread = thread;
        thread.start();
    }

    private void readLoop(InputStream in) {
        ByteArrayOutputStream fragment = new ByteArrayOutputStream();
        int fragmentOpcode = -1;
        try {
            while (!closed.get()) {
                int b1 = in.read();
                if (b1 < 0) {
                    break;
                }
                int b2 = in.read();
                if (b2 < 0) {
                    break;
                }
                boolean fin = (b1 & 0x80) != 0;
                int opcode = b1 & 0x0F;
                boolean masked = (b2 & 0x80) != 0;
                long len = b2 & 0x7F;
                if (len == 126) {
                    len = ((long) readFully(in) << 8) | readFully(in);
                } else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) {
                        len = (len << 8) | readFully(in);
                    }
                }
                if (len > 8 * 1024 * 1024) {
                    throw new IOException("WebSocket frame too large: " + len);
                }
                byte[] mask = null;
                if (masked) {
                    mask = new byte[4];
                    readFully(in, mask, 0, 4);
                }
                byte[] payload = new byte[(int) len];
                if (len > 0) {
                    readFully(in, payload, 0, payload.length);
                    if (mask != null) {
                        for (int i = 0; i < payload.length; i++) {
                            payload[i] = (byte) (payload[i] ^ mask[i % 4]);
                        }
                    }
                }
                if (opcode == OPCODE_CLOSE) {
                    break;
                }
                if (opcode == OPCODE_PING) {
                    sendFrame(OPCODE_PONG, payload);
                    continue;
                }
                if (opcode == OPCODE_PONG) {
                    continue;
                }
                if (opcode == 0x0) {
                    if (fragmentOpcode < 0) {
                        continue;
                    }
                    fragment.write(payload);
                    if (fin) {
                        dispatchPayload(fragmentOpcode, fragment.toByteArray());
                        fragment.reset();
                        fragmentOpcode = -1;
                    }
                    continue;
                }
                if (opcode == OPCODE_TEXT || opcode == OPCODE_BINARY) {
                    if (!fin) {
                        fragment.reset();
                        fragment.write(payload);
                        fragmentOpcode = opcode;
                        continue;
                    }
                    dispatchPayload(opcode, payload);
                }
            }
        } catch (Exception ex) {
            if (!closed.get()) {
                log.debug("k8s.exec reader ended sessionId={}", sessionId, ex);
                emitText(formatWebSocketError(ex) + "\n");
            }
        } finally {
            if (closed.compareAndSet(false, true)) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // ignore
                }
                exitHandler.accept(1);
            }
        }
    }

    private void dispatchPayload(int opcode, byte[] payload) {
        if (opcode == OPCODE_TEXT) {
            if (payload.length > 0) {
                outputHandler.accept(payload);
            }
            return;
        }
        handleBinary(payload);
    }

    private void handleBinary(byte[] data) {
        if (data == null || data.length == 0) {
            return;
        }
        byte channel = data[0];
        byte[] payload = new byte[data.length - 1];
        if (payload.length > 0) {
            System.arraycopy(data, 1, payload, 0, payload.length);
        }
        if (channel == CHANNEL_STDOUT || channel == CHANNEL_STDERR) {
            if (payload.length > 0) {
                outputHandler.accept(payload);
            }
            return;
        }
        if (channel == CHANNEL_ERROR) {
            String message = new String(payload, StandardCharsets.UTF_8);
            if (!message.isBlank()) {
                emitText(message + (message.endsWith("\n") ? "" : "\n"));
            }
            int code = parseExitCode(message);
            if (closed.compareAndSet(false, true)) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // ignore
                }
                exitHandler.accept(code);
            }
        }
    }

    private void emitText(String text) {
        if (text == null || text.isEmpty()) {
            return;
        }
        outputHandler.accept(text.getBytes(StandardCharsets.UTF_8));
    }

    private void sendFrame(int opcode, byte[] payload) {
        if (closed.get() && opcode != OPCODE_CLOSE) {
            return;
        }
        byte[] body = payload != null ? payload : new byte[0];
        byte[] mask = new byte[4];
        new SecureRandom().nextBytes(mask);
        byte[] masked = new byte[body.length];
        for (int i = 0; i < body.length; i++) {
            masked[i] = (byte) (body[i] ^ mask[i % 4]);
        }
        ByteArrayOutputStream frame = new ByteArrayOutputStream(body.length + 14);
        frame.write(0x80 | (opcode & 0x0F));
        if (body.length < 126) {
            frame.write(0x80 | body.length);
        } else if (body.length <= 0xFFFF) {
            frame.write(0x80 | 126);
            frame.write((body.length >>> 8) & 0xFF);
            frame.write(body.length & 0xFF);
        } else {
            frame.write(0x80 | 127);
            for (int shift = 56; shift >= 0; shift -= 8) {
                frame.write((int) ((body.length >>> shift) & 0xFF));
            }
        }
        frame.write(mask, 0, 4);
        frame.write(masked, 0, masked.length);
        synchronized (writeLock) {
            try {
                output.write(frame.toByteArray());
                output.flush();
            } catch (IOException ex) {
                if (!closed.get()) {
                    log.debug("k8s.exec write failed sessionId={}", sessionId, ex);
                }
            }
        }
    }

    private static void performHandshake(URI wsUri, OutputStream out, InputStream in, String bearerToken)
            throws IOException {
        String key = Base64.getEncoder().encodeToString(randomBytes(16));
        String path = wsUri.getRawPath();
        if (path == null || path.isBlank()) {
            path = "/";
        }
        if (wsUri.getRawQuery() != null && !wsUri.getRawQuery().isBlank()) {
            path = path + "?" + wsUri.getRawQuery();
        }
        String hostHeader = wsUri.getHost();
        if (wsUri.getPort() > 0) {
            hostHeader = hostHeader + ":" + wsUri.getPort();
        }
        StringBuilder req = new StringBuilder();
        req.append("GET ").append(path).append(" HTTP/1.1\r\n");
        req.append("Host: ").append(hostHeader).append("\r\n");
        req.append("Upgrade: websocket\r\n");
        req.append("Connection: Upgrade\r\n");
        req.append("Sec-WebSocket-Key: ").append(key).append("\r\n");
        req.append("Sec-WebSocket-Version: 13\r\n");
        req.append("Sec-WebSocket-Protocol: ").append(SUBPROTOCOL).append("\r\n");
        if (bearerToken != null && !bearerToken.isBlank()) {
            req.append("Authorization: Bearer ").append(bearerToken.trim()).append("\r\n");
        }
        req.append("\r\n");
        out.write(req.toString().getBytes(StandardCharsets.US_ASCII));
        out.flush();

        String statusLine = readHttpLine(in);
        if (statusLine == null || statusLine.isBlank()) {
            throw new IOException("Kubernetes exec WebSocket handshake returned empty response");
        }
        if (!statusLine.contains(" 101 ")) {
            int contentLength = -1;
            String line;
            while ((line = readHttpLine(in)) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0 && "content-length".equalsIgnoreCase(line.substring(0, colon).trim())) {
                    try {
                        contentLength = Integer.parseInt(line.substring(colon + 1).trim());
                    } catch (NumberFormatException ignored) {
                        contentLength = -1;
                    }
                }
            }
            String responseBody = "";
            if (contentLength > 0 && contentLength <= 65_536) {
                byte[] buf = new byte[contentLength];
                readFully(in, buf, 0, contentLength);
                responseBody = new String(buf, StandardCharsets.UTF_8).trim();
            }
            throw new IOException(formatHandshakeFailure(statusLine, responseBody));
        }
        String line;
        while ((line = readHttpLine(in)) != null && !line.isEmpty()) {
            // consume headers
        }
    }

    private static String readHttpLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(128);
        int prev = -1;
        while (true) {
            int b = in.read();
            if (b < 0) {
                if (buf.size() == 0) {
                    return null;
                }
                break;
            }
            if (prev == '\r' && b == '\n') {
                break;
            }
            if (b != '\r') {
                buf.write(b);
            }
            prev = b;
            if (buf.size() > 16_384) {
                throw new IOException("HTTP header line too long");
            }
        }
        return buf.toString(StandardCharsets.US_ASCII);
    }

    private static int readFully(InputStream in) throws IOException {
        int b = in.read();
        if (b < 0) {
            throw new IOException("Unexpected end of WebSocket stream");
        }
        return b;
    }

    private static void readFully(InputStream in, byte[] buf, int off, int len) throws IOException {
        int read = 0;
        while (read < len) {
            int n = in.read(buf, off + read, len - read);
            if (n < 0) {
                throw new IOException("Unexpected end of WebSocket stream");
            }
            read += n;
        }
    }

    private static byte[] randomBytes(int size) {
        byte[] bytes = new byte[size];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }

    private static int parseExitCode(String message) {
        if (message == null || message.isBlank()) {
            return 1;
        }
        int idx = message.indexOf("\"ExitCode\"");
        if (idx >= 0) {
            int colon = message.indexOf(':', idx);
            if (colon > 0) {
                int end = colon + 1;
                while (end < message.length() && Character.isWhitespace(message.charAt(end))) {
                    end++;
                }
                int start = end;
                while (end < message.length() && Character.isDigit(message.charAt(end))) {
                    end++;
                }
                if (end > start) {
                    try {
                        return Integer.parseInt(message.substring(start, end));
                    } catch (NumberFormatException ignored) {
                        return 1;
                    }
                }
            }
        }
        if (message.contains("\"Success\"") || message.contains("Success")) {
            return 0;
        }
        return 1;
    }

    private static String buildExecQuery(List<String> command, String container) {
        StringBuilder sb = new StringBuilder("?");
        sb.append("stdin=true&stdout=true&stderr=true&tty=true");
        if (container != null && !container.isBlank()) {
            sb.append("&container=").append(encodeQuery(container.trim()));
        }
        for (String part : command) {
            sb.append("&command=").append(encodeQuery(part));
        }
        return sb.toString();
    }

    private static URI toWebSocketUri(URI httpUri) {
        String scheme = "https".equalsIgnoreCase(httpUri.getScheme()) ? "wss" : "ws";
        try {
            return new URI(
                    scheme,
                    httpUri.getUserInfo(),
                    httpUri.getHost(),
                    httpUri.getPort(),
                    httpUri.getPath(),
                    httpUri.getQuery(),
                    httpUri.getFragment()
            );
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid Kubernetes exec WebSocket URI", ex);
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String encodeQuery(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String formatHandshakeFailure(String statusLine, String responseBody) {
        String apiMessage = extractKubernetesApiMessage(responseBody);
        String status = statusLine == null ? "" : statusLine.trim();
        boolean forbidden = status.contains(" 403 ");
        StringBuilder sb = new StringBuilder();
        if (forbidden) {
            sb.append("Kubernetes 拒绝进入容器（403 Forbidden）");
            if (apiMessage != null && !apiMessage.isBlank()) {
                sb.append("：").append(apiMessage.trim());
            } else {
                sb.append("：当前 Token 可能缺少 pods/exec 权限");
            }
            return sb.toString();
        }
        sb.append("Kubernetes exec WebSocket handshake failed: ").append(status);
        if (apiMessage != null && !apiMessage.isBlank()) {
            sb.append(" — ").append(apiMessage.trim());
        } else if (responseBody != null && !responseBody.isBlank()) {
            String clipped = responseBody.length() > 400 ? responseBody.substring(0, 400) + "…" : responseBody;
            sb.append(" — ").append(clipped);
        }
        return sb.toString();
    }

    /** Best-effort parse of Kubernetes Status JSON ({@code message} / {@code reason}). */
    private static String extractKubernetesApiMessage(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return null;
        }
        String message = extractJsonStringField(responseBody, "message");
        if (message != null && !message.isBlank()) {
            return message;
        }
        return extractJsonStringField(responseBody, "reason");
    }

    private static String extractJsonStringField(String json, String field) {
        String key = "\"" + field + "\"";
        int keyIdx = json.indexOf(key);
        if (keyIdx < 0) {
            return null;
        }
        int colon = json.indexOf(':', keyIdx + key.length());
        if (colon < 0) {
            return null;
        }
        int startQuote = json.indexOf('"', colon + 1);
        if (startQuote < 0) {
            return null;
        }
        StringBuilder value = new StringBuilder();
        for (int i = startQuote + 1; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                value.append(json.charAt(i + 1));
                i++;
                continue;
            }
            if (c == '"') {
                return value.toString();
            }
            value.append(c);
        }
        return null;
    }

    private static String formatWebSocketError(Throwable error) {
        if (error == null) {
            return "Kubernetes exec WebSocket error";
        }
        StringBuilder sb = new StringBuilder();
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && !message.isBlank()) {
                if (sb.length() > 0) {
                    sb.append(": ");
                }
                sb.append(message.trim());
            } else if (sb.length() == 0) {
                sb.append(current.getClass().getSimpleName());
            }
            current = current.getCause();
            if (sb.length() > 800) {
                break;
            }
        }
        return sb.length() > 0 ? sb.toString() : "Kubernetes exec WebSocket error";
    }
}
