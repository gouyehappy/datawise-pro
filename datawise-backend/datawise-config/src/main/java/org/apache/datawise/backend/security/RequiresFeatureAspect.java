package org.apache.datawise.backend.security;

import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.stereotype.Component;

/**
 * AOP gate for {@link RequiresFeature}. Prefer annotations on new endpoints;
 * existing controllers can migrate off manual {@code requireXxx()} gradually.
 */
@Aspect
@Component
public class RequiresFeatureAspect {

    private final FeaturePermissionAccess featurePermissionAccess;

    public RequiresFeatureAspect(FeaturePermissionAccess featurePermissionAccess) {
        this.featurePermissionAccess = featurePermissionAccess;
    }

    @Before("@annotation(requiresFeature)")
    public void checkMethod(RequiresFeature requiresFeature) {
        featurePermissionAccess.requirePermission(requiresFeature.value());
    }

    @Before("@within(requiresFeature) && !@annotation(org.apache.datawise.backend.security.RequiresFeature)")
    public void checkType(RequiresFeature requiresFeature) {
        featurePermissionAccess.requirePermission(requiresFeature.value());
    }
}
