package org.apache.datawise.backend.sse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Process-local SSE bus (desktop / single-node default). */
public final class InMemorySseEventBus implements SseEventBus {

    private static final Logger log = LoggerFactory.getLogger(InMemorySseEventBus.class);

    private final String instanceId;
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEventListener>> listeners =
            new ConcurrentHashMap<>();

    public InMemorySseEventBus() {
        this(UUID.randomUUID().toString());
    }

    public InMemorySseEventBus(String instanceId) {
        this.instanceId = Objects.requireNonNull(instanceId, "instanceId");
    }

    public String instanceId() {
        return instanceId;
    }

    @Override
    public void publish(String channel, String eventName, String payloadJson) {
        publish(channel, eventName, payloadJson, instanceId);
    }

    @Override
    public void publish(String channel, String eventName, String payloadJson, String originInstanceId) {
        if (channel == null || channel.isBlank() || eventName == null || eventName.isBlank()) {
            return;
        }
        String payload = payloadJson == null ? "null" : payloadJson;
        String origin = originInstanceId == null || originInstanceId.isBlank() ? instanceId : originInstanceId;
        CopyOnWriteArrayList<SseEventListener> channelListeners = listeners.get(channel);
        if (channelListeners == null || channelListeners.isEmpty()) {
            return;
        }
        for (SseEventListener listener : List.copyOf(channelListeners)) {
            try {
                listener.onEvent(channel, eventName, payload, origin);
            } catch (RuntimeException ex) {
                log.warn("SSE bus listener failed channel={} event={}", channel, eventName, ex);
            }
        }
    }

    @Override
    public AutoCloseable subscribe(String channel, SseEventListener listener) {
        Objects.requireNonNull(listener, "listener");
        if (channel == null || channel.isBlank()) {
            return () -> {
            };
        }
        CopyOnWriteArrayList<SseEventListener> channelListeners =
                listeners.computeIfAbsent(channel, ignored -> new CopyOnWriteArrayList<>());
        channelListeners.add(listener);
        return () -> {
            channelListeners.remove(listener);
            if (channelListeners.isEmpty()) {
                listeners.remove(channel, channelListeners);
            }
        };
    }

    @Override
    public void close() {
        listeners.clear();
    }
}
