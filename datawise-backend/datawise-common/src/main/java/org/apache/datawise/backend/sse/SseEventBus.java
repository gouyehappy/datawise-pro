package org.apache.datawise.backend.sse;

/**
 * Optional shared pub/sub for SSE fan-out across process instances.
 * <p>
 * Desktop / single-node default is {@link InMemorySseEventBus}. Multi-instance
 * deployments may switch to {@link JdbcPollingSseEventBus} via
 * {@code datawise.sse.bus-type=jdbc}.
 */
public interface SseEventBus extends AutoCloseable {

    /**
     * Publish an event to {@code channel}. Implementations stamp a default
     * process instance id when the 3-arg form is used.
     */
    void publish(String channel, String eventName, String payloadJson);

    /**
     * Publish with an explicit origin instance id (hubs use this so self-echo
     * can be skipped when multiple hubs share one bus in tests).
     */
    default void publish(String channel, String eventName, String payloadJson, String originInstanceId) {
        publish(channel, eventName, payloadJson);
    }

    /**
     * Subscribe to events on an exact channel. Returned handle removes the listener.
     */
    AutoCloseable subscribe(String channel, SseEventListener listener);

    @Override
    default void close() {
    }
}
