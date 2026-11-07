package org.apache.datawise.backend.sse;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class SseEventBusAutoConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(SseEventBusAutoConfiguration.class))
            .withPropertyValues("spring.application.name=test-app");

    @Test
    void defaultsToInMemoryBus() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(SseEventBus.class);
            assertThat(context.getBean(SseEventBus.class)).isInstanceOf(InMemorySseEventBus.class);
        });
    }

    @Test
    void jdbcWithoutMetadataDataSourceFails() {
        contextRunner
                .withPropertyValues("datawise.sse.bus-type=jdbc")
                .run(context -> assertThat(context).hasFailed());
    }
}
