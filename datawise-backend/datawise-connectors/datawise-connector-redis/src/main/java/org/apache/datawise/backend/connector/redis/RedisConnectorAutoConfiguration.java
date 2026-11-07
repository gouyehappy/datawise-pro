package org.apache.datawise.backend.connector.redis;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "io.lettuce.core.RedisClient")
public class RedisConnectorAutoConfiguration {

    @Bean
    RedisConnectorOperations redisConnectorOperations() {
        return new RedisConnectorOperations();
    }

    @Bean
    RedisDataSourceConnector redisDataSourceConnector(RedisConnectorOperations redis) {
        return new RedisDataSourceConnector(redis);
    }
}
