package org.apache.datawise.backend.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares an Explorer access gate with guest / API-token aware policy.
 * Prefer this over manual {@code featurePermissionAccess.requireExplorer*} calls.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresExplorerGate {

    ExplorerFeatureGate value();
}
