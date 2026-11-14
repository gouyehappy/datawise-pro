package org.apache.datawise.backend.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares a feature permission required for a controller method.
 * Enforced by {@link RequiresFeatureAspect} (session RBAC + API Token scope mapping).
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresFeature {

    /** Feature key from {@link org.apache.datawise.backend.domain.UserFeaturePermission}. */
    String value();
}
