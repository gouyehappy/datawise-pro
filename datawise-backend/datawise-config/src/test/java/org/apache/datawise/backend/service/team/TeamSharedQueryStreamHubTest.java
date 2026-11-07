package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.domain.TeamSharedQueryUpdatedEvent;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;

class TeamSharedQueryStreamHubTest {

    @Test
    void publishUpdated_notifiesSubscribers() {
        TeamSharedQueryStreamHub hub = new TeamSharedQueryStreamHub();
        CountingEmitter emitter = new CountingEmitter();
        hub.subscribe("team-1", "query-1", emitter, 2L, "alice");

        hub.publishUpdated(new TeamSharedQueryUpdatedEvent(
                "team-1",
                "query-1",
                "2026-07-07T10:00:00Z",
                2L,
                "alice"));

        assertEquals(2, emitter.sendCount.get());
    }

    @Test
    void publishUpdated_runsWithoutSubscribers() {
        TeamSharedQueryStreamHub hub = new TeamSharedQueryStreamHub();
        assertDoesNotThrow(() -> hub.publishUpdated(new TeamSharedQueryUpdatedEvent(
                "team-1",
                "query-1",
                "2026-07-07T10:00:00Z",
                2L,
                "alice")));
    }

    @Test
    void subscribe_publishesPresenceToAllSubscribers() {
        TeamSharedQueryStreamHub hub = new TeamSharedQueryStreamHub();
        CountingEmitter alice = new CountingEmitter();
        CountingEmitter bob = new CountingEmitter();
        hub.subscribe("team-1", "query-1", alice, 1L, "alice");

        hub.subscribe("team-1", "query-1", bob, 2L, "bob");

        assertEquals(2, alice.sendCount.get());
        assertEquals(1, bob.sendCount.get());
    }

    private static final class CountingEmitter extends SseEmitter {

        private final AtomicInteger sendCount = new AtomicInteger();

        CountingEmitter() {
            super(60_000L);
        }

        @Override
        public void send(SseEventBuilder builder) {
            sendCount.incrementAndGet();
        }
    }
}
