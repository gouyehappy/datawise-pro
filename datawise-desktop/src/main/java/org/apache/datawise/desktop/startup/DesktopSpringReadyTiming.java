package org.apache.datawise.desktop.startup;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * Records {@code spring-ready} when the same-JVM Spring context is up.
 */
@Component
public class DesktopSpringReadyTiming implements ApplicationListener<ApplicationReadyEvent> {
    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        DesktopStartupTiming.markSpringReady();
    }
}
