package org.apache.datawise.backend.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Explorer node delete gate: guest may delete catalog structure nodes; otherwise DANGEROUS.
 * Resolves {@code nodeId} from method parameters (name {@link #nodeIdParam()}).
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresExplorerNodeDelete {

    /** Method parameter name holding the explorer node id. */
    String nodeIdParam() default "nodeId";
}
