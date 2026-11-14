package org.apache.datawise.backend.security;

import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/**
 * AOP gates for content-aware and Explorer policy annotations.
 */
@Aspect
@Component
public class ContentFeatureGateAspect {

    private final FeaturePermissionAccess featurePermissionAccess;
    private final ConnectionVisibilityService connectionVisibilityService;

    public ContentFeatureGateAspect(
                                    FeaturePermissionAccess featurePermissionAccess,
                                    ConnectionVisibilityService connectionVisibilityService) {
        this.featurePermissionAccess = featurePermissionAccess;
        this.connectionVisibilityService = connectionVisibilityService;
    }

    @Before("@annotation(gate)")
    public void checkExplorerMethod(RequiresExplorerGate gate) {
        applyExplorerGate(gate.value());
    }

    @Before("@within(gate) && !@annotation(org.apache.datawise.backend.security.RequiresExplorerGate)")
    public void checkExplorerType(RequiresExplorerGate gate) {
        applyExplorerGate(gate.value());
    }

    @Before("@annotation(org.apache.datawise.backend.security.RequiresSqlExecute)")
    public void checkSqlExecute(JoinPoint joinPoint) {
        featurePermissionAccess.requireSqlExecute(extractNamedString(joinPoint.getArgs(), "sql"));
    }

    @Before("@annotation(org.apache.datawise.backend.security.RequiresRedisCommand)")
    public void checkRedisCommand(JoinPoint joinPoint) {
        featurePermissionAccess.requireRedisCommand(extractNamedString(joinPoint.getArgs(), "command"));
    }

    @Before("@annotation(requiresExplorerNodeDelete)")
    public void checkExplorerNodeDelete(JoinPoint joinPoint, RequiresExplorerNodeDelete requiresExplorerNodeDelete) {
        String nodeId = extractNamedParameter(joinPoint, requiresExplorerNodeDelete.nodeIdParam());
        boolean catalogStructureNode = nodeId != null
                && !nodeId.isBlank()
                && (connectionVisibilityService.resolveGroupEntity(nodeId).isPresent()
                || connectionVisibilityService.resolveConnectionEntity(nodeId).isPresent());
        featurePermissionAccess.requireExplorerNodeDelete(catalogStructureNode);
    }

    private void applyExplorerGate(ExplorerFeatureGate gate) {
        switch (gate) {
            case CONNECTION -> featurePermissionAccess.requireExplorerContextConnection();
            case CATALOG_MUTATION -> featurePermissionAccess.requireExplorerCatalogMutation();
            case DANGEROUS -> featurePermissionAccess.requireExplorerContextDangerous();
            case EXPORT -> featurePermissionAccess.requireExplorerContextExport();
            case CONSOLE -> featurePermissionAccess.requireExplorerContextConsole();
        }
    }

    private static String extractNamedParameter(JoinPoint joinPoint, String parameterName) {
        if (!(joinPoint.getSignature() instanceof MethodSignature signature)) {
            return extractFirstStringArg(joinPoint.getArgs());
        }
        String[] names = signature.getParameterNames();
        Object[] args = joinPoint.getArgs();
        if (names != null && args != null) {
            for (int i = 0; i < names.length && i < args.length; i++) {
                if (parameterName.equals(names[i]) && args[i] instanceof String text) {
                    return text;
                }
            }
        }
        return extractFirstStringArg(args);
    }

    private static String extractFirstStringArg(Object[] args) {
        if (args == null) {
            return null;
        }
        for (Object arg : args) {
            if (arg instanceof String text) {
                return text;
            }
        }
        return null;
    }

    private static String extractNamedString(Object[] args, String accessor) {
        if (args == null) {
            return null;
        }
        for (Object arg : args) {
            if (arg == null) {
                continue;
            }
            try {
                Method method = arg.getClass().getMethod(accessor);
                Object value = method.invoke(arg);
                return value instanceof String text ? text : null;
            } catch (NoSuchMethodException ignored) {
                // try next arg
            } catch (IllegalAccessException | InvocationTargetException ex) {
                throw new IllegalStateException("Failed to read " + accessor + " for feature gate", ex);
            }
        }
        return null;
    }
}
