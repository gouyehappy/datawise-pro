package org.apache.datawise.backend.service.outbound.annotation;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.expression.MethodBasedEvaluationContext;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.core.ParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;

/** Aspect for {@link OutboundNotify}. Publish failures never affect the business call. */
@Aspect
@Component
public class OutboundNotifyAspect {

    private static final Logger log = LoggerFactory.getLogger(OutboundNotifyAspect.class);

    private final OutboundNotifySupport notifySupport;
    private final ExpressionParser parser = new SpelExpressionParser();
    private final ParameterNameDiscoverer names = new DefaultParameterNameDiscoverer();

    public OutboundNotifyAspect(OutboundNotifySupport notifySupport) {
        this.notifySupport = notifySupport;
    }

    @Around("@annotation(meta)")
    public Object around(ProceedingJoinPoint pjp, OutboundNotify meta) throws Throwable {
        if (meta.when() == OutboundNotify.When.AFTER_THROWING) {
            try {
                return pjp.proceed();
            } catch (Throwable ex) {
                if (matches(meta.onException(), ex)) {
                    publishQuietly(pjp, meta, null, ex);
                }
                throw ex;
            }
        }
        Object result = pjp.proceed();
        publishQuietly(pjp, meta, result, null);
        return result;
    }

    private void publishQuietly(ProceedingJoinPoint pjp, OutboundNotify meta, Object result, Throwable ex) {
        try {
            Long userId = UserContext.getUserId();
            if (userId == null) {
                return;
            }
            EvaluationContext ctx = context(pjp, result, ex);
            if (!conditionPasses(meta.condition(), ctx)) {
                return;
            }
            notifySupport.publish(meta.type(), resolveData(meta.data(), ctx), userId);
        } catch (RuntimeException failure) {
            ExceptionLogging.recoverable(log, "OutboundNotify skipped type=" + meta.type(), failure);
        }
    }

    private EvaluationContext context(ProceedingJoinPoint pjp, Object result, Throwable ex) {
        Method method = ((MethodSignature) pjp.getSignature()).getMethod();
        Object[] args = pjp.getArgs() != null ? pjp.getArgs() : new Object[0];
        MethodBasedEvaluationContext ctx = new MethodBasedEvaluationContext(pjp.getTarget(), method, args, names);
        for (int i = 0; i < args.length; i++) {
            ctx.setVariable("a" + i, args[i]);
            ctx.setVariable("p" + i, args[i]);
        }
        ctx.setVariable("return", result);
        ctx.setVariable("exception", ex);
        return ctx;
    }

    private boolean conditionPasses(String condition, EvaluationContext ctx) {
        if (condition == null || condition.isBlank()) {
            return true;
        }
        return Boolean.TRUE.equals(parser.parseExpression(condition).getValue(ctx, Boolean.class));
    }

    private Map<String, Object> resolveData(OutboundData[] mappings, EvaluationContext ctx) {
        Map<String, Object> data = new LinkedHashMap<>();
        if (mappings == null) {
            return data;
        }
        for (OutboundData mapping : mappings) {
            if (mapping == null || mapping.key() == null || mapping.key().isBlank()) {
                continue;
            }
            Object value = null;
            if (mapping.value() != null && !mapping.value().isBlank()) {
                value = parser.parseExpression(mapping.value()).getValue(ctx);
            }
            data.put(mapping.key(), value != null ? value : "");
        }
        return data;
    }

    private static boolean matches(Class<? extends Throwable>[] types, Throwable ex) {
        if (types == null || types.length == 0) {
            return true;
        }
        for (Class<? extends Throwable> type : types) {
            if (type != null && type.isInstance(ex)) {
                return true;
            }
        }
        return false;
    }
}
