package org.apache.datawise.backend.ai.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.Executor;

/**
 * Routes Spring MVC {@code Callable}/{@code DeferredResult} work onto the bounded AI executor
 * so {@code /api/ai/sql/generate} frees Tomcat threads under load (B5).
 */
@Configuration
@ConditionalOnBean(name = AiStreamExecutorConfiguration.AI_STREAM_EXECUTOR)
public class AiMvcAsyncConfiguration implements WebMvcConfigurer {

    private final AsyncTaskExecutor aiAsyncTaskExecutor;

    public AiMvcAsyncConfiguration(
            @Qualifier(AiStreamExecutorConfiguration.AI_STREAM_EXECUTOR) Executor aiStreamExecutor
    ) {
        this.aiAsyncTaskExecutor = new TaskExecutorAdapter(aiStreamExecutor);
    }

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setTaskExecutor(aiAsyncTaskExecutor);
        configurer.setDefaultTimeout(180_000L);
    }
}
