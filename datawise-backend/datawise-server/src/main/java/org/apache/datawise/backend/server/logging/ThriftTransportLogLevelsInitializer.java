package org.apache.datawise.backend.server.logging;

import org.apache.datawise.backend.jdbc.support.ThriftTransportLogLevels;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Applies Thrift/Hive transport log suppression after Spring Boot logging is ready. */
@Component
public class ThriftTransportLogLevelsInitializer {

    @EventListener(ApplicationReadyEvent.class)
    void applyOnReady() {
        ThriftTransportLogLevels.applyQuietly();
    }
}
