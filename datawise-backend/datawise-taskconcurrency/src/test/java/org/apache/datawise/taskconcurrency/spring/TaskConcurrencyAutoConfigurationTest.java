package org.apache.datawise.taskconcurrency.spring;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyStore;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.apache.datawise.taskconcurrency.runtime.TaskConcurrencyRuntime;
import org.apache.datawise.taskconcurrency.store.InMemoryTaskConcurrencyStore;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class TaskConcurrencyAutoConfigurationTest
{
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(TaskConcurrencyAutoConfiguration.class))
            .withPropertyValues(
                    "spring.application.name=test-app",
                    "datawise.task-concurrency.store-type=in-memory",
                    "datawise.task-concurrency.global-max-concurrent=8");

    @Test
    void autoConfiguresInMemoryStoreAndController()
    {
        contextRunner
                .withUserConfiguration(MeterRegistryTestConfig.class)
                .run(context -> {
                    assertThat(context).hasSingleBean(TaskConcurrencyController.class);
                    assertThat(context).hasSingleBean(TaskConcurrencyStore.class);
                    assertThat(context.getBean(TaskConcurrencyStore.class))
                            .isInstanceOf(InMemoryTaskConcurrencyStore.class);
                    assertThat(context).hasSingleBean(TaskConcurrencyMetricsListener.class);
                    assertThat(context).doesNotHaveBean(TaskConcurrencyRuntime.class);
                });
    }

    @Test
    void startsRuntimeWhenTaskHandlerPresent()
    {
        contextRunner
                .withUserConfiguration(MeterRegistryTestConfig.class, TaskHandlerTestConfig.class)
                .withPropertyValues("datawise.task-concurrency.runtime-enabled=true")
                .run(context -> {
                    assertThat(context).hasSingleBean(TaskConcurrencyController.class);
                    assertThat(context).hasSingleBean(TaskHandler.class);
                    assertThat(context).hasSingleBean(TaskConcurrencyRuntime.class);
                    assertThat(context.getBean(TaskConcurrencyRuntime.class).isStarted()).isTrue();
                });
    }

    @Test
    void disabledByProperty()
    {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(TaskConcurrencyAutoConfiguration.class))
                .withPropertyValues("datawise.task-concurrency.enabled=false")
                .run(context -> assertThat(context).doesNotHaveBean(TaskConcurrencyController.class));
    }

    @Configuration
    static class MeterRegistryTestConfig
    {
        @Bean
        SimpleMeterRegistry meterRegistry()
        {
            return new SimpleMeterRegistry();
        }
    }

    @Configuration
    static class TaskHandlerTestConfig
    {
        @Bean
        TaskHandler taskHandler()
        {
            return ctx -> ctx.ack();
        }
    }
}
