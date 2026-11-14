package org.apache.datawise.backend.security;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContentFeatureGateAspectTest {

    private final FeaturePermissionAccess access = mock(FeaturePermissionAccess.class);
    private final ConnectionVisibilityService visibility = mock(ConnectionVisibilityService.class);
    private final ContentFeatureGateAspect aspect = new ContentFeatureGateAspect(access, visibility);

    @Test
    void explorerGatesDelegateToFeaturePermissionAccess() {
        aspect.checkExplorerMethod(gate(ExplorerFeatureGate.CONNECTION));
        verify(access).requireExplorerContextConnection();

        aspect.checkExplorerMethod(gate(ExplorerFeatureGate.CATALOG_MUTATION));
        verify(access).requireExplorerCatalogMutation();

        aspect.checkExplorerMethod(gate(ExplorerFeatureGate.DANGEROUS));
        verify(access).requireExplorerContextDangerous();

        aspect.checkExplorerMethod(gate(ExplorerFeatureGate.EXPORT));
        verify(access).requireExplorerContextExport();

        aspect.checkExplorerMethod(gate(ExplorerFeatureGate.CONSOLE));
        verify(access).requireExplorerContextConsole();
    }

    @Test
    void sqlExecuteReadsSqlAccessorFromRequestBody() {
        JoinPoint joinPoint = mock(JoinPoint.class);
        when(joinPoint.getArgs()).thenReturn(new Object[]{new SqlBody("select 1")});

        aspect.checkSqlExecute(joinPoint);

        verify(access).requireSqlExecute("select 1");
    }

    @Test
    void redisCommandReadsCommandAccessorFromRequestBody() {
        JoinPoint joinPoint = mock(JoinPoint.class);
        when(joinPoint.getArgs()).thenReturn(new Object[]{new RedisBody("FLUSHALL")});

        aspect.checkRedisCommand(joinPoint);

        verify(access).requireRedisCommand("FLUSHALL");
    }

    @Test
    void explorerNodeDeleteUsesCatalogStructureLookup() {
        JoinPoint joinPoint = mock(JoinPoint.class);
        MethodSignature signature = mock(MethodSignature.class);
        when(joinPoint.getSignature()).thenReturn(signature);
        when(signature.getParameterNames()).thenReturn(new String[]{"nodeId"});
        when(joinPoint.getArgs()).thenReturn(new Object[]{"conn-1"});
        when(visibility.resolveGroupEntity("conn-1")).thenReturn(Optional.empty());
        when(visibility.resolveConnectionEntity("conn-1")).thenReturn(Optional.of(new ConnectionEntity()));

        aspect.checkExplorerNodeDelete(joinPoint, nodeDelete());

        verify(access).requireExplorerNodeDelete(true);
    }

    private static RequiresExplorerGate gate(ExplorerFeatureGate value) {
        return new RequiresExplorerGate() {
            @Override
            public ExplorerFeatureGate value() {
                return value;
            }

            @Override
            public Class<? extends java.lang.annotation.Annotation> annotationType() {
                return RequiresExplorerGate.class;
            }
        };
    }

    private static RequiresExplorerNodeDelete nodeDelete() {
        return new RequiresExplorerNodeDelete() {
            @Override
            public String nodeIdParam() {
                return "nodeId";
            }

            @Override
            public Class<? extends java.lang.annotation.Annotation> annotationType() {
                return RequiresExplorerNodeDelete.class;
            }
        };
    }

    private record SqlBody(String sql) {
    }

    private record RedisBody(String command) {
    }
}
