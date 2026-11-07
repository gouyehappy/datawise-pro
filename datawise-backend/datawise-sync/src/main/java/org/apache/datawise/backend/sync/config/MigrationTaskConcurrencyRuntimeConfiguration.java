package org.apache.datawise.backend.sync.config;

import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.runtime.TaskConcurrencyRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * Fallback wiring so migration always has a started {@link TaskConcurrencyRuntime} when a handler exists.
 * <p>
 * Do not put {@code @ConditionalOnBean(TaskHandler)} on this {@code @Configuration} class —
 * that condition is evaluated too early and can skip the whole config permanently
 * (jobs enqueue but never dispatch).
 */
@Configuration
@ConditionalOnClass(TaskConcurrencyRuntime.class)
@ConditionalOnProperty(prefix = "datawise.task-concurrency", name = "runtime-enabled", havingValue = "true", matchIfMissing = true)
public class MigrationTaskConcurrencyRuntimeConfiguration {

    private static final Logger log = LoggerFactory.getLogger(MigrationTaskConcurrencyRuntimeConfiguration.class);

    @Bean(destroyMethod = "close")
    @Conditional(OnTaskHandlerBeanDefinition.class)
    @ConditionalOnMissingBean(TaskConcurrencyRuntime.class)
    public TaskConcurrencyRuntime migrationTaskConcurrencyRuntime(
            TaskConcurrencyController controller,
            TaskHandler handler,
            TaskConcurrencyProperties properties
    ) {
        log.info(
                "Creating TaskConcurrencyRuntime for migration (handler={})",
                handler.getClass().getSimpleName()
        );
        return TaskConcurrencyRuntime.create(controller, handler, properties);
    }

    @Bean
    @ConditionalOnMissingBean(name = "taskConcurrencyRuntimeStarter")
    public MigrationTaskConcurrencyRuntimeStarter migrationTaskConcurrencyRuntimeStarter(
            ObjectProvider<TaskConcurrencyRuntime> runtimeProvider
    ) {
        return new MigrationTaskConcurrencyRuntimeStarter(runtimeProvider);
    }

    /** Starts the runtime after the full context is ready. */
    public static final class MigrationTaskConcurrencyRuntimeStarter {

        private static final Logger log = LoggerFactory.getLogger(MigrationTaskConcurrencyRuntimeStarter.class);

        private final ObjectProvider<TaskConcurrencyRuntime> runtimeProvider;

        public MigrationTaskConcurrencyRuntimeStarter(ObjectProvider<TaskConcurrencyRuntime> runtimeProvider) {
            this.runtimeProvider = runtimeProvider;
        }

        @EventListener(ApplicationReadyEvent.class)
        @Order(0)
        public void onReady() {
            TaskConcurrencyRuntime runtime = runtimeProvider.getIfAvailable();
            if (runtime == null) {
                log.warn("No TaskConcurrencyRuntime bean — migration jobs will use the legacy executor");
                return;
            }
            runtime.start();
            if (!runtime.isStarted()) {
                log.error("TaskConcurrencyRuntime failed to start — migration jobs may stay queued forever");
            }
        }
    }

    static final class OnTaskHandlerBeanDefinition implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            ConfigurableListableBeanFactory factory = context.getBeanFactory();
            if (factory == null) {
                return false;
            }
            String[] names = factory.getBeanNamesForType(TaskHandler.class, true, false);
            return names.length > 0;
        }
    }
}
