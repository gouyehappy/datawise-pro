package org.apache.datawise.backend.sse;

@FunctionalInterface
public interface SseEventListener {

    /**
     * @param originInstanceId instance that published the event (may equal the local instance)
     */
    void onEvent(String channel, String eventName, String payloadJson, String originInstanceId);
}
