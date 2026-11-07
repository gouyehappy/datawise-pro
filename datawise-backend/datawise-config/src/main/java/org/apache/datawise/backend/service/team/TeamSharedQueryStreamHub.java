package org.apache.datawise.backend.service.team;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.domain.TeamSharedQueryPresenceEvent;
import org.apache.datawise.backend.domain.TeamSharedQueryUpdatedEvent;
import org.apache.datawise.backend.domain.TeamSharedQueryViewerDto;
import org.apache.datawise.backend.sse.InMemorySseEventBus;
import org.apache.datawise.backend.sse.JdbcPollingSseEventBus;
import org.apache.datawise.backend.sse.SseChannels;
import org.apache.datawise.backend.sse.SseEventBus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** 团队共享 Query 协同编辑 SSE 订阅与更新广播。 */
@Component
public class TeamSharedQueryStreamHub {

    private static final Logger log = LoggerFactory.getLogger(TeamSharedQueryStreamHub.class);
    private static final long SSE_TIMEOUT_MS = 3_600_000L;

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<StreamSubscriber>> subscribers =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AutoCloseable> busSubscriptions = new ConcurrentHashMap<>();

    private final SseEventBus eventBus;
    private final ObjectMapper objectMapper;
    private final String instanceId;

    public TeamSharedQueryStreamHub() {
        this(null, null, "local");
    }

    public TeamSharedQueryStreamHub(SseEventBus eventBus, ObjectMapper objectMapper, String instanceId) {
        this.eventBus = eventBus;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper().findAndRegisterModules();
        this.instanceId = instanceId == null || instanceId.isBlank() ? "local" : instanceId;
    }

    @Autowired
    public TeamSharedQueryStreamHub(
                                    ObjectProvider<SseEventBus> eventBusProvider,
                                    ObjectProvider<ObjectMapper> objectMapperProvider) {
        this(
                eventBusProvider.getIfAvailable(),
                objectMapperProvider.getIfAvailable(),
                resolveBusInstanceId(eventBusProvider.getIfAvailable()));
    }

    private static String resolveBusInstanceId(SseEventBus bus) {
        if (bus instanceof InMemorySseEventBus inMemory) {
            return inMemory.instanceId();
        }
        if (bus instanceof JdbcPollingSseEventBus jdbc) {
            return jdbc.instanceId();
        }
        return "local";
    }

    public SseEmitter createEmitter() {
        return new SseEmitter(SSE_TIMEOUT_MS);
    }

    public void subscribe(
                          String teamId,
                          String queryId,
                          SseEmitter emitter,
                          Long userId,
                          String userName) {
        if (teamId == null || teamId.isBlank() || queryId == null || queryId.isBlank() || emitter == null) {
            return;
        }
        String key = streamKey(teamId, queryId);
        StreamSubscriber subscriber = new StreamSubscriber(emitter, userId, userName);
        CopyOnWriteArrayList<StreamSubscriber> entries =
                subscribers.computeIfAbsent(key, ignored -> new CopyOnWriteArrayList<>());
        entries.add(subscriber);
        ensureBusWatch(teamId, queryId);
        Runnable cleanup = () -> unsubscribe(teamId, queryId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(ignored -> cleanup.run());
        publishPresence(teamId, queryId);
    }

    public void unsubscribe(String teamId, String queryId, SseEmitter emitter) {
        if (teamId == null || teamId.isBlank() || queryId == null || queryId.isBlank() || emitter == null) {
            return;
        }
        String key = streamKey(teamId, queryId);
        CopyOnWriteArrayList<StreamSubscriber> entries = subscribers.get(key);
        if (entries == null) {
            return;
        }
        boolean removed = entries.removeIf(subscriber -> subscriber.emitter() == emitter);
        if (entries.isEmpty()) {
            subscribers.remove(key, entries);
            releaseBusWatch(key);
        }
        if (removed) {
            publishPresence(teamId, queryId);
        }
    }

    public void publishUpdated(TeamSharedQueryUpdatedEvent event) {
        if (event == null || event.teamId() == null || event.queryId() == null) {
            return;
        }
        broadcast(event.teamId(), event.queryId(), "updated", event);
    }

    public void sendConnected(SseEmitter emitter, String teamId, String queryId, String updatedAt) {
        send(emitter, "connected", new TeamSharedQueryUpdatedEvent(
                teamId,
                queryId,
                updatedAt,
                null,
                null));
    }

    private void publishPresence(String teamId, String queryId) {
        TeamSharedQueryPresenceEvent event = new TeamSharedQueryPresenceEvent(
                teamId,
                queryId,
                collectViewers(teamId, queryId));
        broadcast(teamId, queryId, "presence", event);
    }

    private List<TeamSharedQueryViewerDto> collectViewers(String teamId, String queryId) {
        CopyOnWriteArrayList<StreamSubscriber> entries = subscribers.get(streamKey(teamId, queryId));
        if (entries == null || entries.isEmpty()) {
            return List.of();
        }
        LinkedHashMap<Long, TeamSharedQueryViewerDto> deduped = new LinkedHashMap<>();
        for (StreamSubscriber subscriber : entries) {
            if (subscriber.userId() == null) {
                continue;
            }
            deduped.putIfAbsent(
                    subscriber.userId(),
                    new TeamSharedQueryViewerDto(subscriber.userId(), subscriber.userName()));
        }
        ArrayList<TeamSharedQueryViewerDto> viewers = new ArrayList<>(deduped.values());
        viewers.sort(Comparator.comparing(
                viewer -> viewer.userName() == null ? "" : viewer.userName().toLowerCase()));
        return List.copyOf(viewers);
    }

    private void broadcast(String teamId, String queryId, String eventName, Object data) {
        publishToBus(teamId, queryId, eventName, data);
        fanOutLocal(teamId, queryId, eventName, data);
    }

    private void publishToBus(String teamId, String queryId, String eventName, Object data) {
        if (eventBus == null) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(data);
            eventBus.publish(SseChannels.teamQuery(teamId, queryId), eventName, json, instanceId);
        } catch (JsonProcessingException ex) {
            ExceptionLogging.recoverable(log, "Team shared query SSE bus serialize failed event=" + eventName, ex);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "Team shared query SSE bus publish failed event=" + eventName, ex);
        }
    }

    private void onBusEvent(String channel, String eventName, String payloadJson, String originInstanceId) {
        if (Objects.equals(instanceId, originInstanceId)) {
            return;
        }
        String[] parts = SseChannels.teamQueryParts(channel);
        if (parts == null) {
            return;
        }
        JsonNode node;
        try {
            node = objectMapper.readTree(payloadJson == null ? "null" : payloadJson);
        } catch (JsonProcessingException ex) {
            ExceptionLogging.recoverable(log, "Team shared query SSE bus deserialize failed event=" + eventName, ex);
            return;
        }
        fanOutLocal(parts[0], parts[1], eventName, node);
    }

    private void fanOutLocal(String teamId, String queryId, String eventName, Object data) {
        CopyOnWriteArrayList<StreamSubscriber> entries = subscribers.get(streamKey(teamId, queryId));
        if (entries == null || entries.isEmpty()) {
            return;
        }
        for (StreamSubscriber subscriber : List.copyOf(entries)) {
            send(subscriber.emitter(), eventName, data);
        }
    }

    private void send(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "Team shared query SSE send failed event=" + eventName, ex);
        } catch (IllegalStateException ex) {
            ExceptionLogging.recoverable(log, "Team shared query SSE send failed event=" + eventName, ex);
        }
    }

    private void ensureBusWatch(String teamId, String queryId) {
        if (eventBus == null) {
            return;
        }
        String key = streamKey(teamId, queryId);
        busSubscriptions.computeIfAbsent(key, ignored -> eventBus.subscribe(
                SseChannels.teamQuery(teamId, queryId),
                this::onBusEvent));
    }

    private void releaseBusWatch(String key) {
        AutoCloseable handle = busSubscriptions.remove(key);
        if (handle == null) {
            return;
        }
        try {
            handle.close();
        } catch (Exception ex) {
            ExceptionLogging.recoverable(log, "Team shared query SSE bus unsubscribe failed key=" + key, ex);
        }
    }

    static String streamKey(String teamId, String queryId) {
        return teamId.trim() + ":" + queryId.trim();
    }

    private record StreamSubscriber(
            SseEmitter emitter,
            Long userId,
            String userName) {
    }
}
