package org.apache.datawise.backend.service.outbound.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * One outbound event data field. SpEL may use method parameter names, {@code #return}, {@code #exception}.
 */
@Target({})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface OutboundData {

    String key();

    /** SpEL expression; {@code null} results become {@code ""}. */
    String value();
}
