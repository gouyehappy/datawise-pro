package org.apache.datawise.backend.connector.ssh;

import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

public final class SshShellSession {

    private static final Logger log = LoggerFactory.getLogger(SshShellSession.class);
    private static final String PTY_TYPE = "xterm-256color";
    private static final int DETACH_BUFFER_MAX_BYTES = 256 * 1024;
    private static final Consumer<byte[]> NOOP_BYTES = ignored -> {
    };
    private static final Consumer<Integer> NOOP_EXIT = ignored -> {
    };

    private final String sessionId;
    private final Session session;
    private final Session jumpSession;
    private final ChannelShell channel;
    private final OutputStream stdin;
    private final ExecutorService pumpExecutor;
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final AtomicBoolean pumpStarted = new AtomicBoolean(false);
    private final AtomicReference<Consumer<byte[]>> outputSink = new AtomicReference<>(NOOP_BYTES);
    private final AtomicReference<Consumer<Integer>> exitSink = new AtomicReference<>(NOOP_EXIT);
    private final SshShellDetachBuffer detachBuffer = new SshShellDetachBuffer(DETACH_BUFFER_MAX_BYTES);
    private final AtomicBoolean buffering = new AtomicBoolean(false);

    private SshShellSession(
            String sessionId,
            Session session,
            Session jumpSession,
            ChannelShell channel
    ) throws IOException {
        this.sessionId = sessionId;
        this.session = session;
        this.jumpSession = jumpSession;
        this.channel = channel;
        this.stdin = channel.getOutputStream();
        this.pumpExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "ssh-shell-" + sessionId);
            thread.setDaemon(true);
            return thread;
        });
    }

    public static SshShellSession open(
            String sessionId,
            ConnectionEntity entity,
            int cols,
            int rows,
            SshClientProperties properties
    ) throws SshConnectionException {
        SshConnectionSupport.validate(entity);
        SshJschSessions.OpenedSessions opened = null;
        try {
            opened = SshJschSessions.openSession(entity, properties);

            ChannelShell channel = (ChannelShell) opened.target().openChannel("shell");
            channel.setPtyType(PTY_TYPE);
            applySize(channel, cols, rows);
            channel.connect(shellChannelTimeoutMs(properties));
            SshShellSession shell = new SshShellSession(sessionId, opened.target(), opened.jump(), channel);
            opened = null;
            return shell;
        } catch (JSchException ex) {
            if (opened != null) {
                opened.disconnectQuietly();
            }
            throw new SshConnectionException(
                    SshConnectionSupport.toUserMessage(ex) + " [" + SshConnectionSupport.describeCredentials(entity) + "]",
                    ex
            );
        } catch (IOException ex) {
            if (opened != null) {
                opened.disconnectQuietly();
            }
            throw new SshConnectionException("Failed to open SSH shell channel", ex);
        }
    }

    /**
     * Starts the PTY pump on first call; later calls only swap sinks (WS resume).
     * Pumps raw PTY bytes — callers must not decode as UTF-8 String per-chunk.
     */
    public void attachOutput(Consumer<byte[]> onOutput, Consumer<Integer> onExit) {
        Consumer<byte[]> output = onOutput != null ? onOutput : NOOP_BYTES;
        Consumer<Integer> exit = onExit != null ? onExit : NOOP_EXIT;
        buffering.set(false);
        outputSink.set(output);
        exitSink.set(exit);
        SshShellDetachBuffer.deliver(detachBuffer.drain(), output);
        if (pumpStarted.compareAndSet(false, true)) {
            startPump();
        }
    }

    /**
     * @deprecated use {@link #attachOutput(Consumer, Consumer)}
     */
    @Deprecated
    public void pumpOutput(Consumer<byte[]> onOutput, Consumer<Integer> onExit) {
        attachOutput(onOutput, onExit);
    }

    /** Buffer (and stop forwarding) while the WebSocket is briefly down. */
    public void detachOutput() {
        buffering.set(true);
        outputSink.set(this::bufferWhileDetached);
        // Keep exitSink so process exit still tears down the managed session.
    }

    public boolean isOpen() {
        return !closed.get() && channel.isConnected();
    }

    public void write(String data) throws IOException {
        if (closed.get()) {
            return;
        }
        stdin.write(data.getBytes(StandardCharsets.UTF_8));
        stdin.flush();
    }

    public void resize(int cols, int rows) {
        if (closed.get()) {
            return;
        }
        try {
            applySize(channel, cols, rows);
        } catch (Exception ex) {
            log.debug("SSH shell resize failed for {}", sessionId, ex);
        }
    }

    public void destroy() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        buffering.set(false);
        outputSink.set(NOOP_BYTES);
        exitSink.set(NOOP_EXIT);
        detachBuffer.clear();
        try {
            channel.disconnect();
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "SSH shell channel disconnect failed", ex);
        }
        try {
            session.disconnect();
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "SSH session disconnect failed", ex);
        }
        if (jumpSession != null) {
            try {
                jumpSession.disconnect();
            } catch (Exception ex) {
                ExceptionLogging.warn(log, "SSH jump session disconnect failed", ex);
            }
        }
        pumpExecutor.shutdownNow();
    }

    private void startPump() {
        pumpExecutor.submit(() -> {
            try (InputStream stdout = channel.getInputStream()) {
                // Larger reads → fewer bridge.accept hops under flood (still coalesced on WS).
                byte[] buffer = new byte[16_384];
                int read;
                while (!closed.get() && (read = stdout.read(buffer)) >= 0) {
                    if (read == 0) {
                        continue;
                    }
                    byte[] chunk = new byte[read];
                    System.arraycopy(buffer, 0, chunk, 0, read);
                    outputSink.get().accept(chunk);
                }
            } catch (IOException ex) {
                if (!closed.get()) {
                    log.debug("SSH shell output stream closed for {}", sessionId, ex);
                }
            } finally {
                int exitCode = channel.isClosed() ? channel.getExitStatus() : 0;
                if (exitCode < 0) {
                    exitCode = 0;
                }
                exitSink.get().accept(exitCode);
            }
        });
    }

    private void bufferWhileDetached(byte[] chunk) {
        if (!buffering.get()) {
            return;
        }
        detachBuffer.append(chunk);
    }

    private static void applySize(ChannelShell channel, int cols, int rows) {
        int safeCols = Math.max(cols, 20);
        int safeRows = Math.max(rows, 8);
        channel.setPtySize(safeCols, safeRows, safeCols * 8, safeRows * 16);
    }

    /** PTY channel opens quickly once the session is authenticated. */
    private static int shellChannelTimeoutMs(SshClientProperties properties) {
        return Math.min(10_000, properties.getConnectTimeoutMs());
    }
}
