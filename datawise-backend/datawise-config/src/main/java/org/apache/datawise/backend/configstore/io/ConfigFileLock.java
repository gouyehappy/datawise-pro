package org.apache.datawise.backend.configstore.io;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Cross-process mutual exclusion for read-modify-write on a config file.
 *
 * <p>The stores guard themselves with {@code synchronized}, which only serialises threads in one
 * JVM. Desktop and the headless CLI routinely run against the same config directory, so a
 * "read, merge, write" sequence in one process could still overwrite the other's rows.
 *
 * <p>The lock lives in a sibling {@code <file>.lock} file rather than the data file itself: writes
 * replace the data file atomically (new inode), which would invalidate a lock held on the old one.
 *
 * <p>{@link FileLock} is owned by the JVM, so a second thread in the same JVM asking for an
 * overlapping lock gets {@link OverlappingFileLockException} instead of blocking. A per-path
 * {@link ReentrantLock} therefore serialises threads first, and the file lock only ever arbitrates
 * between processes.
 */
public final class ConfigFileLock {

    private static final long POLL_INTERVAL_MS = 10L;
    private static final long DEFAULT_TIMEOUT_MS = 5_000L;

    private static final ConcurrentMap<String, ReentrantLock> JVM_LOCKS = new ConcurrentHashMap<>();

    private ConfigFileLock() {
    }

    /**
     * Path of the lock file that guards {@code target}. Exposed so callers can exclude it from
     * backups and directory listings.
     */
    public static Path lockFileFor(Path target) {
        return target.resolveSibling(target.getFileName() + ".lock");
    }

    public static <T> T withExclusiveLock(Path target, Supplier<T> body) {
        return withExclusiveLock(target, DEFAULT_TIMEOUT_MS, body);
    }

    public static <T> T withExclusiveLock(Path target, long timeoutMs, Supplier<T> body) {
        Path lockFile = lockFileFor(target);
        ReentrantLock jvmLock = JVM_LOCKS.computeIfAbsent(
                lockFile.toAbsolutePath().normalize().toString(),
                key -> new ReentrantLock());
        boolean jvmAcquired = false;
        try {
            jvmAcquired = jvmLock.tryLock(timeoutMs, TimeUnit.MILLISECONDS);
            if (!jvmAcquired) {
                throw new IllegalStateException(
                        "Timed out waiting for config lock on " + target + " after " + timeoutMs + "ms");
            }
            try {
                Files.createDirectories(parentOf(lockFile));
            } catch (IOException ex) {
                throw new UncheckedIOException("Cannot create lock directory for " + lockFile, ex);
            }
            try (
                    FileChannel channel = FileChannel.open(
                            lockFile,
                            StandardOpenOption.CREATE,
                            StandardOpenOption.WRITE)) {
                FileLock fileLock = acquire(channel, target, timeoutMs);
                try {
                    return body.get();
                } finally {
                    releaseQuietly(fileLock);
                }
            } catch (IOException ex) {
                throw new UncheckedIOException("Config lock I/O failure on " + lockFile, ex);
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for config lock on " + target, ex);
        } finally {
            if (jvmAcquired) {
                jvmLock.unlock();
            }
        }
    }

    public static void runWithExclusiveLock(Path target, Runnable body) {
        withExclusiveLock(target, () -> {
            body.run();
            return null;
        });
    }

    private static FileLock acquire(FileChannel channel, Path target, long timeoutMs) throws IOException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while (true) {
            try {
                FileLock lock = channel.tryLock();
                if (lock != null) {
                    return lock;
                }
            } catch (OverlappingFileLockException ignored) {
                // Another thread in this JVM holds it; the JVM lock above should prevent that,
                // but treat it as "busy" rather than failing the write.
            }
            if (System.nanoTime() >= deadline) {
                throw new IllegalStateException(
                        "Timed out waiting for another process to release " + target + " after "
                                + timeoutMs + "ms");
            }
            try {
                Thread.sleep(POLL_INTERVAL_MS);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Interrupted while waiting for config lock", ex);
            }
        }
    }

    private static void releaseQuietly(FileLock lock) {
        try {
            lock.release();
        } catch (IOException ignored) {
            // Channel close releases the lock anyway.
        }
    }

    private static Path parentOf(Path file) {
        Path parent = file.getParent();
        return parent != null ? parent : Path.of(".");
    }
}
