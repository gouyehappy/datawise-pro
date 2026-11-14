package org.apache.datawise.backend.common.support;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.AccessDeniedException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;

/**
 * Temp-file → fsync → target replace with Windows-friendly fallback.
 *
 * <p>On Windows, {@link StandardCopyOption#ATOMIC_MOVE} often throws
 * {@link AccessDeniedException} when another process (or concurrent request) holds the
 * target — not only {@link AtomicMoveNotSupportedException}. Retry a non-atomic replace
 * so config writes (app.xml / sessions.json) do not surface as generic "IO error".
 */
public final class AtomicFileWrites {

    private static final int MAX_ATTEMPTS = 6;

    private AtomicFileWrites() {
    }

    /** Write bytes via temp file + fsync + replace (preferred over bare {@code Files.write}). */
    public static void writeBytes(Path target, byte[] bytes) throws IOException {
        if (target == null) {
            throw new IllegalArgumentException("target is required");
        }
        byte[] payload = bytes != null ? bytes : new byte[0];
        Path parent = target.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Path temp = Files.createTempFile(
                parent != null ? parent : Path.of("."),
                "." + target.getFileName() + ".",
                ".tmp"
        );
        try {
            Files.write(temp, payload);
            try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.WRITE)) {
                channel.force(true);
            }
            if (parent != null) {
                try (FileChannel dirChannel = FileChannel.open(parent, StandardOpenOption.READ)) {
                    dirChannel.force(true);
                } catch (Exception ignored) {
                    // Directory fsync is best-effort (not supported on all platforms/FS).
                }
            }
            moveReplace(temp, target);
            temp = null;
        } finally {
            if (temp != null) {
                Files.deleteIfExists(temp);
            }
        }
    }

    public static void moveReplace(Path temp, Path target) throws IOException {
        try {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return;
        } catch (AtomicMoveNotSupportedException | AccessDeniedException ignored) {
            // fall through to non-atomic replace with short retries
        }
        IOException last = null;
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                return;
            } catch (AccessDeniedException ex) {
                last = ex;
                sleepBriefly(attempt);
            }
        }
        if (last != null) {
            throw last;
        }
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
    }

    private static void sleepBriefly(int attempt) throws AccessDeniedException {
        try {
            Thread.sleep(20L * (attempt + 1));
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new AccessDeniedException(String.valueOf(ie.getMessage()));
        }
    }
}
