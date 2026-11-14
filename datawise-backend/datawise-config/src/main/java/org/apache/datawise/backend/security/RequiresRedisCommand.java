package org.apache.datawise.backend.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Content-aware Redis command gate: CONSOLE always; DANGEROUS for mutating commands.
 * Looks for {@code command()} on a request-body argument (e.g. ExecuteRedisCommandRequest).
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresRedisCommand {
}
