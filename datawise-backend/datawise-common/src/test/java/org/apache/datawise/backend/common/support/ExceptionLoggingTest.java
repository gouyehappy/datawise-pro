package org.apache.datawise.backend.common.support;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class ExceptionLoggingTest {

    @Test
    void recoverable_acceptsNullWithoutThrowing() {
        var log = LoggerFactory.getLogger(ExceptionLoggingTest.class);
        assertDoesNotThrow(() -> ExceptionLogging.recoverable(log, "ctx", null));
    }

    @Test
    void warn_attachesFullThrowableToBusinessAndExceptionLoggers() {
        Logger businessLog = (Logger) LoggerFactory.getLogger("org.apache.datawise.backend.test.BusinessLog");
        Logger exceptionLog = (Logger) LoggerFactory.getLogger("datawise.exception");
        Level originalBusinessLevel = businessLog.getLevel();
        Level originalExceptionLevel = exceptionLog.getLevel();
        boolean originalBusinessAdditive = businessLog.isAdditive();
        boolean originalExceptionAdditive = exceptionLog.isAdditive();
        ListAppender<ILoggingEvent> businessAppender = new ListAppender<>();
        ListAppender<ILoggingEvent> exceptionAppender = new ListAppender<>();
        businessAppender.start();
        exceptionAppender.start();
        businessLog.addAppender(businessAppender);
        exceptionLog.addAppender(exceptionAppender);
        businessLog.setLevel(Level.INFO);
        exceptionLog.setLevel(Level.WARN);
        businessLog.setAdditive(false);
        exceptionLog.setAdditive(false);
        try {
            Exception ex = new IllegalArgumentException("bad\ninput");
            ExceptionLogging.warn(businessLog, "connection.open", ex);

            assertThat(businessAppender.list).hasSize(1);
            assertThat(businessAppender.list.get(0).getFormattedMessage())
                    .startsWith("connection.open | level=warn | errorType=IllegalArgumentException | error=bad input | at=");
            assertThat(businessAppender.list.get(0).getThrowableProxy()).isNotNull();
            assertThat(businessAppender.list.get(0).getThrowableProxy().getClassName())
                    .isEqualTo(IllegalArgumentException.class.getName());

            assertThat(exceptionAppender.list).hasSize(1);
            assertThat(exceptionAppender.list.get(0).getFormattedMessage())
                    .startsWith("connection.open | source=BusinessLog | level=warn | errorType=IllegalArgumentException | error=bad input | at=");
            assertThat(exceptionAppender.list.get(0).getThrowableProxy()).isNotNull();
        } finally {
            businessLog.detachAppender(businessAppender);
            exceptionLog.detachAppender(exceptionAppender);
            businessLog.setLevel(originalBusinessLevel);
            exceptionLog.setLevel(originalExceptionLevel);
            businessLog.setAdditive(originalBusinessAdditive);
            exceptionLog.setAdditive(originalExceptionAdditive);
        }
    }
}
