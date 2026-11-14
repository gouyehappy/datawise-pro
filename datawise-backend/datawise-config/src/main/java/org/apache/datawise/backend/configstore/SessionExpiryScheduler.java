package org.apache.datawise.backend.configstore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodically drops expired auth sessions so logout / TTL is not only opportunistic.
 */
@Component
public class SessionExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(SessionExpiryScheduler.class);

    private final SessionStore sessionStore;

    public SessionExpiryScheduler(SessionStore sessionStore) {
        this.sessionStore = sessionStore;
    }

    @Scheduled(fixedDelayString = "${datawise.auth.session-purge-ms:60000}")
    public void purgeExpiredSessions() {
        try {
            sessionStore.purgeExpired();
        } catch (RuntimeException ex) {
            log.warn("Session purge failed: {}", ex.getMessage());
        }
    }
}
