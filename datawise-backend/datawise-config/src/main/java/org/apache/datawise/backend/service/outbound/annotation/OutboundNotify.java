package org.apache.datawise.backend.service.outbound.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Publishes an outbound event after a public Spring bean method returns or throws.
 * Recipient is always {@code UserContext.getUserId()}. For custom recipients use
 * {@link org.apache.datawise.backend.service.outbound.OutboundNotifySupport#publish}.
 *
 * <pre>{@code
 * @OutboundNotify(
 *     type = OutboundEventType.SQL_PRODUCTION_BLOCKED,
 *     when = When.AFTER_THROWING,
 *     onException = ProductionWriteBlockedException.class,
 *     data = {
 *         @OutboundData(key = "connectionId", value = "#connection?.id"),
 *         @OutboundData(key = "name", value = "#connection?.name")
 *     }
 * )
 * }</pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface OutboundNotify {

    String type();

    When when() default When.AFTER_RETURNING;

    /** SpEL; blank means always publish. */
    String condition() default "";

    OutboundData[] data() default {};

    Class<? extends Throwable>[] onException() default {Throwable.class};

    enum When {
        AFTER_RETURNING,
        AFTER_THROWING
    }
}
