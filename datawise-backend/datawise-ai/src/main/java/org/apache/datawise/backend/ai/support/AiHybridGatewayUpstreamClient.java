package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiDeliveryProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

/**
 * Forwards rewritten chat/completions payloads to an upstream OpenAI-compatible brain.
 */
@Component
@ConditionalOnProperty(prefix = "datawise.ai.gateway-stub", name = "enabled", havingValue = "true")
public class AiHybridGatewayUpstreamClient {

    private final AiDeliveryProperties deliveryProperties;

    public AiHybridGatewayUpstreamClient(AiDeliveryProperties deliveryProperties) {
        this.deliveryProperties = deliveryProperties;
    }

    public boolean isConfigured() {
        return deliveryProperties.getGatewayStub().isUpstreamConfigured();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> chatCompletions(Map<String, Object> body) {
        AiDeliveryProperties.GatewayStub stub = deliveryProperties.getGatewayStub();
        String base = normalizeUpstreamBase(stub.getUpstreamBaseUrl());

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeout = Math.max(5, stub.getUpstreamTimeoutSeconds());
        requestFactory.setConnectTimeout(Duration.ofSeconds(timeout));
        requestFactory.setReadTimeout(Duration.ofSeconds(timeout));

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(base)
                .requestFactory(requestFactory);
        String apiKey = stub.getUpstreamApiKey();
        if (apiKey != null && !apiKey.isBlank()) {
            builder = builder.defaultHeader("Authorization", "Bearer " + apiKey.trim());
        }

        Map<String, Object> response = builder.build()
                .post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class);
        if (response == null) {
            throw new IllegalStateException("Upstream gateway returned empty body");
        }
        return response;
    }

    /** Keep {@code /v1}; strip trailing slash and accidental {@code /chat/completions}. */
    static String normalizeUpstreamBase(String baseUrl) {
        if (baseUrl == null) {
            return "";
        }
        String trimmed = baseUrl.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        if (trimmed.endsWith("/chat/completions")) {
            trimmed = trimmed.substring(0, trimmed.length() - "/chat/completions".length());
            while (trimmed.endsWith("/")) {
                trimmed = trimmed.substring(0, trimmed.length() - 1);
            }
        }
        return trimmed;
    }
}
