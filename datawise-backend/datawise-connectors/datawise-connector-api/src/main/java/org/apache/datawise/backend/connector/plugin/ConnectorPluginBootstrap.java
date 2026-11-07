package org.apache.datawise.backend.connector.plugin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Loads {@code config/plugins} after the web server can answer health checks.
 * <p>
 * Bean creation registers classpath connectors only; this listener fills in plugin JARs
 * so Tomcat / {@code /api/health} is not blocked by full plugin+driver scanning.
 */
@Component
public class ConnectorPluginBootstrap {

    private static final Logger log = LoggerFactory.getLogger(ConnectorPluginBootstrap.class);

    private final ConnectorPluginRuntime pluginRuntime;
    private final ApplicationEventPublisher eventPublisher;
    private final boolean deferPluginLoad;
    private final AtomicBoolean started = new AtomicBoolean(false);

    public ConnectorPluginBootstrap(
                                    ConnectorPluginRuntime pluginRuntime,
                                    ApplicationEventPublisher eventPublisher,
                                    @Value("${datawise.connectors.defer-plugin-load:true}") boolean deferPluginLoad) {
        this.pluginRuntime = pluginRuntime;
        this.eventPublisher = eventPublisher;
        this.deferPluginLoad = deferPluginLoad;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(100)
    public void onApplicationReady() {
        if (!started.compareAndSet(false, true)) {
            return;
        }
        if (!deferPluginLoad) {
            // Sync path already loaded plugins in ConnectorRegistryConfiguration.
            pluginRuntime.markReadyIfIdle();
            eventPublisher.publishEvent(ConnectorPluginsBootstrappedEvent.INSTANCE);
            return;
        }
        ExecutorService executor = Executors.newSingleThreadExecutor(daemonFactory());
        executor.execute(() -> {
            try {
                log.info("Deferred connector plugin load starting");
                pluginRuntime.bootstrapLoad();
                eventPublisher.publishEvent(ConnectorPluginsBootstrappedEvent.INSTANCE);
            } catch (Exception ex) {
                log.error("Deferred connector plugin load failed", ex);
                pluginRuntime.markFailed(ex);
                eventPublisher.publishEvent(ConnectorPluginsBootstrappedEvent.INSTANCE);
            } finally {
                executor.shutdown();
            }
        });
    }

    private static ThreadFactory daemonFactory() {
        return runnable -> {
            Thread thread = new Thread(runnable, "connector-plugin-bootstrap");
            thread.setDaemon(true);
            return thread;
        };
    }
}
