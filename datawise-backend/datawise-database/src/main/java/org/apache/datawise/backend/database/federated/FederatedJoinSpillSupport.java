package org.apache.datawise.backend.database.federated;

import java.io.EOFException;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

/**
 * Grace-style hash join with disk spill for the build side.
 * Probe rows stay in memory (already capped by {@link FederatedJoinLimits#HARD_MAX_ROWS}).
 */
final class FederatedJoinSpillSupport {

    private FederatedJoinSpillSupport() {
    }

    static FederatedJoinExecutor.JoinOutcome hashJoinWithSpill(
            List<Map<String, Object>> leftRows,
            List<Map<String, Object>> rightRows,
            List<String[]> eqPairs,
            int maxRows,
            BiFunction<Map<String, Object>, Boolean, Object> keyFn
    ) {
        boolean buildRight = rightRows.size() <= leftRows.size();
        List<Map<String, Object>> buildRows = buildRight ? rightRows : leftRows;
        List<Map<String, Object>> probeRows = buildRight ? leftRows : rightRows;

        Path spillDir = null;
        try {
            spillDir = Files.createTempDirectory("datawise-fed-join-");
            Path[] bucketFiles = new Path[FederatedJoinLimits.SPILL_BUCKETS];
            ObjectOutputStream[] writers = new ObjectOutputStream[FederatedJoinLimits.SPILL_BUCKETS];
            try {
                for (int i = 0; i < FederatedJoinLimits.SPILL_BUCKETS; i++) {
                    bucketFiles[i] = spillDir.resolve("b" + i + ".bin");
                    writers[i] = new ObjectOutputStream(Files.newOutputStream(bucketFiles[i]));
                }
                for (Map<String, Object> row : buildRows) {
                    Object key = keyFn.apply(row, buildRight);
                    if (key == null) {
                        continue;
                    }
                    int bucket = bucketOf(key);
                    writers[bucket].writeObject(key);
                    writers[bucket].writeObject(new LinkedHashMap<>(row));
                }
            } finally {
                for (ObjectOutputStream writer : writers) {
                    if (writer != null) {
                        try {
                            writer.close();
                        } catch (IOException ignored) {
                            // best-effort close
                        }
                    }
                }
            }

            List<Map<String, Object>> joined = new ArrayList<>();
            for (int bucket = 0; bucket < FederatedJoinLimits.SPILL_BUCKETS; bucket++) {
                Map<Object, List<Map<String, Object>>> index = loadBucket(bucketFiles[bucket]);
                if (index.isEmpty()) {
                    continue;
                }
                for (Map<String, Object> probe : probeRows) {
                    Object key = keyFn.apply(probe, !buildRight);
                    if (key == null || bucketOf(key) != bucket) {
                        continue;
                    }
                    List<Map<String, Object>> matches = index.get(key);
                    if (matches == null) {
                        continue;
                    }
                    for (Map<String, Object> build : matches) {
                        Map<String, Object> combined = new LinkedHashMap<>();
                        if (buildRight) {
                            combined.putAll(probe);
                            combined.putAll(build);
                        } else {
                            combined.putAll(build);
                            combined.putAll(probe);
                        }
                        joined.add(combined);
                        if (joined.size() >= maxRows) {
                            return new FederatedJoinExecutor.JoinOutcome(joined, true);
                        }
                    }
                }
            }
            return new FederatedJoinExecutor.JoinOutcome(joined, false);
        } catch (IOException ex) {
            throw new UncheckedIOException(
                    new IOException("federated JOIN spill failed: " + ex.getMessage(), ex)
            );
        } catch (ClassNotFoundException ex) {
            throw new IllegalStateException("federated JOIN spill deserialize failed", ex);
        } finally {
            deleteRecursively(spillDir);
        }
    }

    static int bucketOf(Object key) {
        int hash = key == null ? 0 : key.hashCode();
        return Math.floorMod(hash, FederatedJoinLimits.SPILL_BUCKETS);
    }

    private static Map<Object, List<Map<String, Object>>> loadBucket(Path file)
            throws IOException, ClassNotFoundException {
        Map<Object, List<Map<String, Object>>> index = new HashMap<>();
        if (!Files.exists(file) || Files.size(file) == 0) {
            return index;
        }
        try (ObjectInputStream in = new ObjectInputStream(Files.newInputStream(file))) {
            while (true) {
                try {
                    Object key = in.readObject();
                    @SuppressWarnings("unchecked")
                    Map<String, Object> row = (Map<String, Object>) in.readObject();
                    index.computeIfAbsent(key, ignored -> new ArrayList<>()).add(row);
                } catch (EOFException eof) {
                    break;
                }
            }
        }
        return index;
    }

    private static void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (var walk = Files.walk(root)) {
            List<Path> paths = walk.sorted((a, b) -> b.compareTo(a)).toList();
            for (Path path : paths) {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            }
        } catch (IOException ignored) {
            // best-effort cleanup
        }
    }
}
