package org.apache.datawise.backend.ai.analysis;

import org.apache.datawise.backend.ai.AiException;
import org.apache.datawise.backend.ai.analysis.AiAnalysisErrorMapper.ErrorPayload;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class AiAnalysisErrorMapperTest {

    @Test
    void mapsTypedAnalysisExceptionWithStableCode() {
        AiException ex = new AiException(
                AiAnalysisErrorCodes.SESSION_EXPIRED,
                "分析会话已过期，请重新发起分析"
        );

        ErrorPayload payload = AiAnalysisErrorMapper.map(ex);

        assertEquals(AiAnalysisErrorCodes.SESSION_EXPIRED, payload.code());
        assertEquals("分析会话已过期，请重新发起分析", payload.message());
        assertEquals(AiAnalysisErrorCodes.SESSION_EXPIRED, payload.toMap().get("code"));
    }

    @Test
    void infersSessionExpiredFromMessageWhenUntyped() {
        ErrorPayload payload = AiAnalysisErrorMapper.map(
                new IllegalStateException("分析会话已过期，请重新发起分析")
        );

        assertEquals(AiAnalysisErrorCodes.SESSION_EXPIRED, payload.code());
    }

    @Test
    void mapsUnauthorizedExceptionToSessionExpired() {
        ErrorPayload payload = AiAnalysisErrorMapper.map(new UnauthorizedException());

        assertEquals(AiAnalysisErrorCodes.SESSION_EXPIRED, payload.code());
        assertEquals("登录会话已失效，请重新登录后再试", payload.message());
    }

    @Test
    void mapsUnauthorizedRootCauseToSessionExpired() {
        ErrorPayload payload = AiAnalysisErrorMapper.map(new IllegalStateException("UNAUTHORIZED"));

        assertEquals(AiAnalysisErrorCodes.SESSION_EXPIRED, payload.code());
        assertEquals("登录会话已失效，请重新登录后再试", payload.message());
    }

    @Test
    void unwrapsRootCauseMessage() {
        RuntimeException root = new RuntimeException("SQL 生成失败: timeout");
        AiException wrapped = new AiException(
                AiAnalysisErrorCodes.GRAPH_INVOKE_FAILED,
                "数据分析执行失败: timeout",
                root
        );

        ErrorPayload payload = AiAnalysisErrorMapper.map(wrapped);

        assertEquals(AiAnalysisErrorCodes.GRAPH_INVOKE_FAILED, payload.code());
        assertNotNull(payload.message());
    }
}
