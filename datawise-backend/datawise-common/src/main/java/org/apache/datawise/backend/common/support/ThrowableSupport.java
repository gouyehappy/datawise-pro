package org.apache.datawise.backend.common.support;

/** Shared throwable helpers for user-facing error messages. */
public final class ThrowableSupport {

    private ThrowableSupport() {
    }

    public static String rootMessage(Throwable error) {
        if (error == null) {
            return null;
        }
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current.getMessage();
    }
}
