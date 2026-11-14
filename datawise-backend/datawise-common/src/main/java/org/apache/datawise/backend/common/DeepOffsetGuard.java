package org.apache.datawise.backend.common;

import java.util.function.Supplier;

/**
 * Marks the current thread as data-movement (backup / migration / bulk export)
 * so interactive deep-offset caps are not applied.
 */
public final class DeepOffsetGuard {

    private static final ThreadLocal<Integer> DEPTH = ThreadLocal.withInitial(() -> 0);

    private DeepOffsetGuard() {
    }

    public static boolean isDataMovement() {
        return DEPTH.get() > 0;
    }

    public static void run(Runnable task) {
        run(() -> {
            task.run();
            return null;
        });
    }

    public static <T> T run(Supplier<T> task) {
        DEPTH.set(DEPTH.get() + 1);
        try {
            return task.get();
        } finally {
            int next = DEPTH.get() - 1;
            if (next <= 0) {
                DEPTH.remove();
            } else {
                DEPTH.set(next);
            }
        }
    }
}
