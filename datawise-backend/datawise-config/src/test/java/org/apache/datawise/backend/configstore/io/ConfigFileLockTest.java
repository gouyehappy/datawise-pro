package org.apache.datawise.backend.configstore.io;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Cross-process safety of config read-modify-write. A real second process cannot be spawned from
 * a unit test cheaply, but holding the lock file from a separate channel reproduces exactly what
 * another process does.
 */
class ConfigFileLockTest {

    @Test
    void lockFileIsASiblingSoWritesCannotInvalidateIt(@TempDir Path dir) {
        Path target = dir.resolve("users.json");

        assertEquals(dir.resolve("users.json.lock"), ConfigFileLock.lockFileFor(target));
    }

    @Test
    void bodyRunsInsideTheLockAndTheLockIsReleased(@TempDir Path dir) throws IOException {
        Path target = dir.resolve("users.json");
        int result = ConfigFileLock.withExclusiveLock(target, () -> {
            assertTrue(Files.exists(ConfigFileLock.lockFileFor(target)));
            return 42;
        });

        assertEquals(42, result);
        // Released: a second acquisition must succeed immediately.
        assertEquals(7, ConfigFileLock.withExclusiveLock(target, () -> 7));
    }

    @Test
    void anotherHolderMakesTheCallTimeOut(@TempDir Path dir) throws IOException {
        Path target = dir.resolve("users.json");
        Path lockFile = ConfigFileLock.lockFileFor(target);
        Files.createDirectories(lockFile.getParent());

        try (
                FileChannel channel = FileChannel.open(
                        lockFile,
                        StandardOpenOption.CREATE,
                        StandardOpenOption.WRITE);
                FileLock ignored = channel.lock()) {
            IllegalStateException thrown = assertThrows(
                    IllegalStateException.class,
                    () -> ConfigFileLock.withExclusiveLock(target, 200L, () -> "never"));
            assertTrue(thrown.getMessage().contains("Timed out"), thrown.getMessage());
        }
    }

    @Test
    void threadsInOneJvmSerialiseInsteadOfOverlapping(@TempDir Path dir) throws Exception {
        Path target = dir.resolve("users.json");
        AtomicInteger inside = new AtomicInteger();
        AtomicInteger maxInside = new AtomicInteger();
        CountDownLatch start = new CountDownLatch(1);
        int threads = 4;
        CountDownLatch done = new CountDownLatch(threads);

        for (int i = 0; i < threads; i++) {
            Thread worker = new Thread(() -> {
                try {
                    start.await();
                    ConfigFileLock.runWithExclusiveLock(target, () -> {
                        int now = inside.incrementAndGet();
                        maxInside.accumulateAndGet(now, Math::max);
                        try {
                            Thread.sleep(20L);
                        } catch (InterruptedException ex) {
                            Thread.currentThread().interrupt();
                        } finally {
                            inside.decrementAndGet();
                        }
                    });
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
            worker.start();
        }
        start.countDown();
        assertTrue(done.await(10, TimeUnit.SECONDS), "workers did not finish");
        assertEquals(1, maxInside.get(), "only one thread may hold the config lock");
    }

    @Test
    void lockFileIsCreatedNextToAnExplicitlyMissingParent(@TempDir Path dir) throws IOException {
        Path nested = dir.resolve("tenant-a").resolve("users.json");

        ConfigFileLock.runWithExclusiveLock(nested, () -> {
        });

        assertTrue(Files.exists(ConfigFileLock.lockFileFor(nested)));
    }
}
