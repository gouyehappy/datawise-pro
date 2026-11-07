package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.config.AiDeliveryProperties;
import org.apache.datawise.backend.ai.support.AiHybridGatewayRequestRewriter;
import org.apache.datawise.backend.ai.support.AiHybridGatewayUpstreamClient;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Dev/CI OpenAI-compatible stub that expands Hybrid opaque system envelopes.
 * When {@code datawise.ai.gateway-stub.upstream-base-url} is set, expands then forwards
 * upstream (Wave 30); otherwise returns a deterministic local mock.
 */
@RestController
@RequestMapping("/api/ai/gateway/v1")
@ConditionalOnProperty(prefix = "datawise.ai.gateway-stub", name = "enabled", havingValue = "true")
public class AiHybridGatewayStubController {

    private final AiDeliveryProperties deliveryProperties;
    private final AiHybridGatewayUpstreamClient upstreamClient;

    public AiHybridGatewayStubController(
            AiDeliveryProperties deliveryProperties,
            AiHybridGatewayUpstreamClient upstreamClient
    ) {
        this.deliveryProperties = deliveryProperties;
        this.upstreamClient = upstreamClient;
    }

    @PostMapping(value = "/chat/completions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> chatCompletions(@RequestBody Map<String, Object> body) {
        AiHybridGatewayRequestRewriter.RewriteResult rewritten = AiHybridGatewayRequestRewriter.rewrite(body);

        if (upstreamClient.isConfigured()) {
            Map<String, Object> upstream = upstreamClient.chatCompletions(rewritten.body());
            Map<String, Object> annotated = new LinkedHashMap<>(upstream);
            annotated.put("dwGatewayStub", true);
            annotated.put("dwOpaqueExpanded", rewritten.opaqueExpanded());
            annotated.put("dwUpstreamForwarded", true);
            if (rewritten.promptRef() != null) {
                annotated.put("dwPromptRef", rewritten.promptRef());
            }
            return annotated;
        }

        return localMock(rewritten, body);
    }

    private Map<String, Object> localMock(
            AiHybridGatewayRequestRewriter.RewriteResult rewritten,
            Map<String, Object> original
    ) {
        int userChars = 0;
        int systemChars = 0;
        Object messages = rewritten.body().get("messages");
        if (messages instanceof List<?> list) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> map)) {
                    continue;
                }
                String role = stringOf(map.get("role"));
                String content = stringOf(map.get("content"));
                if ("system".equalsIgnoreCase(role)) {
                    systemChars = content.length();
                } else if ("user".equalsIgnoreCase(role) && userChars == 0) {
                    userChars = content.length();
                }
            }
        }

        String reply = "OK [gateway-stub]"
                + (rewritten.promptRef() != null ? " promptRef=" + rewritten.promptRef() : "")
                + (systemChars > 0 ? " systemChars=" + systemChars : "")
                + (userChars > 0 ? " userChars=" + userChars : "");

        Map<String, Object> choiceMessage = new LinkedHashMap<>();
        choiceMessage.put("role", "assistant");
        choiceMessage.put("content", reply);

        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("index", 0);
        choice.put("message", choiceMessage);
        choice.put("finish_reason", "stop");

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", "chatcmpl-dw-stub-" + UUID.randomUUID());
        response.put("object", "chat.completion");
        response.put(
                "model",
                stringOf(original != null ? original.get("model") : null).isBlank()
                        ? "datawise-gateway-stub"
                        : stringOf(original.get("model"))
        );
        response.put("choices", List.of(choice));
        response.put("dwGatewayStub", true);
        response.put("dwOpaqueExpanded", rewritten.opaqueExpanded());
        response.put("dwUpstreamForwarded", false);
        response.put("dwDelivery", deliveryProperties.getDelivery());
        return response;
    }

    private static String stringOf(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
