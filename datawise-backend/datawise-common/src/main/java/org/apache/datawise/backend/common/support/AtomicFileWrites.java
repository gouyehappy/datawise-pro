package org.apache.datawise.backend.common.support;

import java.io.IOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Temp-file → target replace with Windows-friendly fallback.
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
