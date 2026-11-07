package org.apache.datawise.backend.service.outbound.annotation;

import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.stereotype.Component;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class OutboundNotifyAspectTest {

    private AnnotationConfigApplicationContext context;
    private OutboundNotifySupport notifySupport;
    private DemoService demoService;

    @BeforeEach
    void setUp() {
        notifySupport = mock(OutboundNotifySupport.class);
        context = new AnnotationConfigApplicationContext();
        context.registerBean(OutboundNotifySupport.class, () -> notifySupport);
        context.register(AspectConfig.class, DemoService.class, OutboundNotifyAspect.class);
        context.refresh();
        demoService = context.getBean(DemoService.class);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        if (context != null) {
            context.close();
        }
    }

    @Test
    void afterReturningPublishesWhenConditionTrue() {
        UserContext.set(9L, false, "session-1", "default");

        assertEquals("bad", demoService.echoFail("conn-1", "bad"));
        verify(notifySupport).publish(
                eq("demo.failed"),
                eq(Map.of("connectionId", "conn-1", "message", "bad")),
                eq(9L));
    }

    @Test
    void afterReturningSkipsWhenConditionFalse() {
        UserContext.set(9L, false, "session-1", "default");
        demoService.echoFail("conn-1", "ok");
        verify(notifySupport, never()).publish(any(), any(), any(Long.class));
    }

    @Test
    void afterReturningSkipsWithoutUserContext() {
        demoService.echoFail("conn-1", "bad");
        verify(notifySupport, never()).publish(any(), any(), any(Long.class));
    }

    @Test
    void afterThrowingPublishesForMatchingException() {
        UserContext.set(3L, false, "session-1", "default");
        assertThrows(IllegalStateException.class, () -> demoService.boom("prod-db"));
        verify(notifySupport, times(1)).publish(
                eq("demo.blocked"),
                eq(Map.of("name", "prod-db")),
                eq(3L));
    }

    @Test
    void afterThrowingSkipsNonMatchingException() {
        UserContext.set(3L, false, "session-1", "default");
        assertThrows(IllegalArgumentException.class, () -> demoService.boomOther("prod-db"));
        verify(notifySupport, never()).publish(any(), any(), any(Long.class));
    }

    @Test
    void nullDataValuesBecomeEmptyString() {
        UserContext.set(1L, false, "session-1", "default");
        demoService.nullName(null);
        verify(notifySupport).publish(
                eq("demo.null"),
                eq(Map.of("name", "")),
                eq(1L));
    }

    @Configuration
    @EnableAspectJAutoProxy(proxyTargetClass = true)
    static class AspectConfig {
    }

    @Component
    static class DemoService {

        @OutboundNotify(type = "demo.failed", condition = "#return != null && #return != 'ok'", data = {
                @OutboundData(key = "connectionId", value = "#connectionId"),
                @OutboundData(key = "message", value = "#return")
        })
        public String echoFail(String connectionId, String message) {
            return message;
        }

        @OutboundNotify(type = "demo.blocked", when = OutboundNotify.When.AFTER_THROWING, onException = IllegalStateException.class, data = {@OutboundData(key = "name", value = "#name")})
        public void boom(String name) {
            throw new IllegalStateException("blocked");
        }

        @OutboundNotify(type = "demo.blocked", when = OutboundNotify.When.AFTER_THROWING, onException = IllegalStateException.class, data = {@OutboundData(key = "name", value = "#name")})
        public void boomOther(String name) {
            throw new IllegalArgumentException("other");
        }

        @OutboundNotify(type = "demo.null", data = {@OutboundData(key = "name", value = "#name")})
        public void nullName(String name) {
        }
    }
}
