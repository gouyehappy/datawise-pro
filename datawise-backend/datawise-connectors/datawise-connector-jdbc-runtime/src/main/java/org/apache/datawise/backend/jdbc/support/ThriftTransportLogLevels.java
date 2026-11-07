package org.apache.datawise.backend.jdbc.support;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import org.slf4j.LoggerFactory;

/**
 * Hive JDBC 通过独立 ClassLoader 加载 libthrift；在首次加载 Hive 驱动后再次压低
 * Thrift/Hive 传输层 logger，避免 Hikari keepalive 触发 DEBUG 刷屏。
 */
public final class ThriftTransportLogLevels {

    private static final String[] NOISY_LOGGERS = {
            "org.apache.thrift",
            "org.apache.thrift.transport",
            "org.apache.thrift.transport.TSaslTransport",
            "org.apache.hive",
            "org.apache.hive.service.auth",
            "org.apache.hive.jdbc",
    };

    private ThriftTransportLogLevels() {
    }

    public static void applyQuietly() {
        try {
            apply();
        } catch (RuntimeException ignored) {
            // logback may be absent in unit tests
        }
    }

    public static void apply() {
        if (!(LoggerFactory.getILoggerFactory() instanceof LoggerContext context)) {
            return;
        }
        for (String name : NOISY_LOGGERS) {
            context.getLogger(name).setLevel(Level.WARN);
        }
    }
}
