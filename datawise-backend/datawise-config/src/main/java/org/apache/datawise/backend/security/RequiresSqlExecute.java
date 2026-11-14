package org.apache.datawise.backend.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Content-aware SQL execute gate: RUN always; DANGEROUS_SQL when the statement writes.
 * Looks for {@code sql()} on a request-body argument (e.g. ExecuteSqlRequest).
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresSqlExecute {
}
