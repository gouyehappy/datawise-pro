package org.apache.datawise.backend.connector.redis.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

/**
 * 将 Redis 客户端异常转为面向用户的说明，避免驱动/网络原文直出 UI。
 */
public final class RedisConnectionErrors {

    private RedisConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        return ConnectorErrorSupport.toUserMessage(entity, error, ConnectorErrorTemplate.redis());
    }

    public static String toCommandErrorMessage(ConnectionEntity entity, Throwable error) {
        return toUserMessage(entity, error);
    }
}
