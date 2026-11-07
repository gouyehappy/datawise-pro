package org.apache.datawise.backend.common.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Structured duration logs for connection / explorer / table / SQL latency diagnosis. */
public final class PerfLogger {

    private static final Logger PERF = LoggerFactory.getLogger("datawise.perf");

    private PerfLogger() {
    }

    public static void log(Logger log, String operation, long startedAtMs, Object... keyValues) {
        if (!PERF.isInfoEnabled()) {
            return;
        }
        StringBuilder message = new StringBuilder("perf event=")
                .append(operation)
                .append(" took=")
                .append(Math.max(0, System.currentTimeMillis() - startedAtMs))
                .append("ms");
        appendKeyValues(message, keyValues);
        PERF.info("{}", message);
    }

    private static void appendKeyValues(StringBuilder message, Object... keyValues) {
        for (int index = 0; index + 1 < keyValues.length; index += 2) {
            message.append(' ').append(keyValues[index]).append('=').append(keyValues[index + 1]);
        }
    }
}
