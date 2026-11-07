package org.apache.datawise.backend.database.connection;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 应用启动后预加载 {@code config/drivers/} 目录下已存在的 JDBC 驱动。
 */
@Component
public class JdbcDriverPreloadRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(JdbcDriverPreloadRunner.class);

    private final JdbcDriverPreloadService preloadService;
    private final boolean enabled;

    public JdbcDriverPreloadRunner(
            JdbcDriverPreloadService preloadService,
            @Value("${datawise.jdbc.preload-drivers-on-startup:true}") boolean enabled
    ) {
        this.preloadService = preloadService;
        this.enabled = enabled;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            log.debug("JDBC driver preload disabled (datawise.jdbc.preload-drivers-on-startup=false)");
            return;
        }
        JdbcDriverPreloadService.PreloadReport report = preloadService.preloadExistingDrivers();
        if (report.preloaded() > 0 || report.failed() > 0) {
            log.info(
                    "JDBC driver preload finished in {}ms: {} loaded, {} skipped (jar not on disk), {} failed",
                    report.durationMs(),
                    report.preloaded(),
                    report.skipped(),
                    report.failed()
            );
        } else {
            log.debug(
                    "JDBC driver preload finished in {}ms: no cached driver jars to load",
                    report.durationMs()
            );
        }
    }
}
