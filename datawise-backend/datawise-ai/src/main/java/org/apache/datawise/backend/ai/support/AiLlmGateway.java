package org.apache.datawise.backend.ai.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.ai.config.AiDeliveryProperties;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.retry.NonTransientAiException;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

@Component
public class AiLlmGateway {

    private static final Logger log = LoggerFactory.getLogger(AiLlmGateway.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    /** Hard cap on buffered LLM HTTP bodies (complete + stream error paths). */
    static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

    private final AiLlmCallPolicy callPolicy;
    private final AiDeliveryProperties deliveryProperties;

    public AiLlmGateway(AiLlmCallPolicy callPolicy, AiDeliveryProperties deliveryProperties) {
        this.callPolicy = callPolicy;
        this.deliveryProperties = deliveryProperties;
    }

    public String complete(AiLlmProfileDto profile, String systemPrompt, String userPrompt) {
        return complete(profile, systemPrompt, userPrompt, "llm");
    }

    /**
     * Listener for OpenAI-compatible stream chunks (assistant content and/or
     * model reasoning). Either callback may be null.
     */
    public interface StreamListener {
        void onContent(String chunk);

        default void onThinking(String chunk) {
        }
    }

    /**
     * OpenAI-compatible SSE chat completions. Invokes {@code onDelta} for each
     * content chunk and returns the full assistant text. Falls back to
     * non-stream {@link #complete} when the provider rejects {@code stream:true}.
     */
    public String stream(
            AiLlmProfileDto profile,
            String systemPrompt,
            String userPrompt,
            String phase,
            Consumer<String> onDelta
    ) {
        return stream(profile, systemPrompt, userPrompt, phase, new StreamListener() {
            @Override
            public void onContent(String chunk) {
                if (onDelta != null) {
                    onDelta.accept(chunk);
                }
            }
        });
    }

    /**
     * Streaming chat with separate content and thinking callbacks.
     * Returns accumulated assistant {@code content} (not thinking). Thinking-only
     * streams succeed with an empty content string when reasoning was received.
     */
    public String stream(
            AiLlmProfileDto profile,
            String systemPrompt,
            String userPrompt,
            String phase,
            StreamListener listener
    ) {
        StreamListener safe = listener != null ? listener : new StreamListener() {
            @Override
            public void onContent(String chunk) {
            }
        };
        if (isMock(profile)) {
            AiCallLogger.logRoute(log, phase + "-mock", "mock provider");
            String reply = mockComplete(userPrompt);
            if (reply != null && !reply.isEmpty()) {
                safe.onContent(reply);
            }
            return reply;
        }
        validateOpenAiProfile(profile);
        long started = System.currentTimeMillis();
        AiCallLogger.logLlmStart(
                log,
                phase + "-stream",
                profile,
                systemPrompt != null ? systemPrompt.length() : 0,
                userPrompt != null ? userPrompt.length() : 0
        );
        try {
            String reply = callPolicy.execute(
                    phase + "-stream",
                    circuitKey(profile),
                    () -> streamOpenAi(profile, systemPrompt, userPrompt, phase, safe)
            );
            AiCallLogger.logLlmSuccess(log, phase + "-stream", System.currentTimeMillis() - started, reply.length());
            return reply;
        } catch (NonTransientAiException ex) {
            AiCallLogger.logLlmFailure(log, phase + "-stream", System.currentTimeMillis() - started, ex);
            throw new IllegalArgumentException(AiOpenAiErrorMapper.toChatMessage(profile, ex.getMessage()), ex);
        } catch (RuntimeException ex) {
            AiCallLogger.logLlmFailure(log, phase + "-stream", System.currentTimeMillis() - started, ex);
            throw ex;
        }
    }

    public String complete(AiLlmProfileDto profile, String systemPrompt, String userPrompt, String phase) {
        if (isMock(profile)) {
            AiCallLogger.logRoute(log, phase + "-mock", "mock provider");
            return mockComplete(userPrompt);
        }
        validateOpenAiProfile(profile);

        long started = System.currentTimeMillis();
        AiCallLogger.logLlmStart(
                log,
                phase,
                profile,
                systemPrompt != null ? systemPrompt.length() : 0,
                userPrompt != null ? userPrompt.length() : 0
        );
        try {
            String reply = callPolicy.execute(
                    phase,
                    circuitKey(profile),
                    () -> callOpenAi(profile, systemPrompt, userPrompt, phase)
            );
            AiCallLogger.logLlmSuccess(log, phase, System.currentTimeMillis() - started, reply.length());
            return reply;
        } catch (NonTransientAiException ex) {
            AiCallLogger.logLlmFailure(log, phase, System.currentTimeMillis() - started, ex);
            throw new IllegalArgumentException(AiOpenAiErrorMapper.toChatMessage(profile, ex.getMessage()), ex);
        } catch (RuntimeException ex) {
            AiCallLogger.logLlmFailure(log, phase, System.currentTimeMillis() - started, ex);
            throw ex;
        }
    }

    private String callOpenAi(AiLlmProfileDto profile, String systemPrompt, String userPrompt, String phase) {
        String rawBase = deliveryProperties.resolveBaseUrl(profile.baseUrl());
        String baseUrl = AiLlmUrlNormalizer.normalizeBaseUrl(rawBase);
        String wireSystem = AiHybridPromptProtocol.resolveWireSystemPrompt(
                deliveryProperties, phase, systemPrompt
        );
        if (deliveryProperties.isHybridGatewayConfigured()) {
            if (deliveryProperties.shouldUseOpaquePrompts()) {
                AiCallLogger.logRoute(
                        log,
                        "llm-hybrid-opaque",
                        "gateway=" + baseUrl + " promptRef=" + AiHybridPromptProtocol.promptRefFor(phase)
                );
            } else {
                AiCallLogger.logRoute(log, "llm-hybrid", "gateway=" + baseUrl);
            }
        }
        int timeoutSeconds = callPolicy.timeoutSeconds();

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(timeoutSeconds));
        requestFactory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));

        AtomicReference<String> rawBody = new AtomicReference<>();
        OpenAiApi openAiApi = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(profile.apiKey())
                .completionsPath(profile.resolvedCompletionsPath())
                .restClientBuilder(RestClient.builder()
                        .requestFactory(requestFactory)
                        .requestInterceptor((request, body, execution) -> {
                            ClientHttpResponse response = execution.execute(request, body);
                            byte[] bytes = readCapped(response.getBody(), MAX_RESPONSE_BYTES);
                            rawBody.set(new String(bytes, StandardCharsets.UTF_8));
                            return new ReplayClientHttpResponse(response, bytes);
                        }))
                .build();

        try {
            return completeOnce(
                    openAiApi,
                    AiOpenAiReasoningSupport.standardOptions(profile),
                    wireSystem,
                    userPrompt,
                    phase,
                    rawBody
            );
        } catch (RuntimeException ex) {
            if (!AiOpenAiReasoningSupport.looksLikeReasoningParamRejected(ex)) {
                throw ex;
            }
            log.info(
                    "AI LLM retrying with reasoning-compatible options phase={} model={}",
                    phase,
                    profile.model()
            );
            rawBody.set(null);
            return completeOnce(
                    openAiApi,
                    AiOpenAiReasoningSupport.reasoningOptions(profile),
                    wireSystem,
                    userPrompt,
                    phase,
                    rawBody
            );
        }
    }

    private String streamOpenAi(
            AiLlmProfileDto profile,
            String systemPrompt,
            String userPrompt,
            String phase,
            StreamListener listener
    ) {
        String rawBase = deliveryProperties.resolveBaseUrl(profile.baseUrl());
        String baseUrl = AiLlmUrlNormalizer.normalizeBaseUrl(rawBase);
        String wireSystem = AiHybridPromptProtocol.resolveWireSystemPrompt(
                deliveryProperties, phase, systemPrompt
        );
        String url = baseUrl + profile.resolvedCompletionsPath();
        ObjectNode body = JSON.createObjectNode();
        body.put("model", profile.model());
        body.put("stream", true);
        if (profile.temperature() != null) {
            body.put("temperature", profile.temperature());
        }
        if (profile.maxTokens() != null && profile.maxTokens() > 0) {
            body.put("max_tokens", profile.maxTokens());
        }
        ArrayNode messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", wireSystem == null ? "" : wireSystem);
        messages.addObject().put("role", "user").put("content", userPrompt == null ? "" : userPrompt);

        int timeoutSeconds = Math.max(callPolicy.timeoutSeconds(), 30);
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(Math.min(timeoutSeconds, 30)))
                .build();
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Authorization", "Bearer " + profile.apiKey())
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                    .build();
        } catch (IOException ex) {
            throw new IllegalArgumentException("Failed to encode stream request", ex);
        }

        HttpResponse<InputStream> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException | InterruptedException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalArgumentException("LLM stream request failed: " + ex.getMessage(), ex);
        }

        int status = response.statusCode();
        if (status == 400 || status == 404 || status == 422) {
            // Providers that reject stream=true still work via the non-stream path.
            try {
                response.body().close();
            } catch (IOException ignored) {
                // ignore
            }
            String fallback = complete(profile, systemPrompt, userPrompt, phase);
            if (fallback != null && !fallback.isEmpty()) {
                listener.onContent(fallback);
            }
            return fallback;
        }
        if (status < 200 || status >= 300) {
            String errBody;
            try (InputStream err = response.body()) {
                errBody = new String(readCapped(err, MAX_RESPONSE_BYTES), StandardCharsets.UTF_8);
            } catch (IOException ex) {
                errBody = "";
            }
            String clipped = errBody.length() > 400 ? errBody.substring(0, 400) : errBody;
            throw new IllegalArgumentException("LLM stream HTTP " + status + ": " + clipped);
        }

        StringBuilder full = new StringBuilder();
        StringBuilder thinkingFull = new StringBuilder();
        // AI-15: strip a leading markdown fence from early deltas so SSE clients do not see ```sql.
        boolean leadingFencePending = true;
        StringBuilder leadingFenceBuf = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith(":")) {
                    continue;
                }
                if (!trimmed.startsWith("data:")) {
                    continue;
                }
                String data = trimmed.substring(5).trim();
                if ("[DONE]".equals(data)) {
                    break;
                }
                JsonNode payload;
                try {
                    payload = JSON.readTree(data);
                } catch (IOException ex) {
                    continue;
                }
                JsonNode deltaObj = payload.path("choices").path(0).path("delta");
                String content = textualField(deltaObj, "content");
                String thinking = firstTextualField(
                        deltaObj,
                        "reasoning_content",
                        "reasoningContent",
                        "reasoning",
                        "thinking"
                );
                if (content == null && thinking == null) {
                    continue;
                }
                if (content != null) {
                    full.append(content);
                    String emit = content;
                    if (leadingFencePending) {
                        leadingFenceBuf.append(content);
                        String stripped = stripLeadingCodeFenceDelta(leadingFenceBuf.toString());
                        if (stripped == null) {
                            continue;
                        }
                        leadingFencePending = false;
                        leadingFenceBuf.setLength(0);
                        emit = stripped;
                    }
                    if (!emit.isEmpty()) {
                        listener.onContent(emit);
                    }
                }
                if (thinking != null) {
                    thinkingFull.append(thinking);
                    listener.onThinking(thinking);
                }
            }
        } catch (IOException ex) {
            throw new IllegalArgumentException("LLM stream read failed: " + ex.getMessage(), ex);
        }

        String text = stripCodeFence(full.toString());
        if ((text == null || text.isBlank()) && thinkingFull.isEmpty()) {
            throw new IllegalArgumentException("LLM stream ended without content");
        }
        return text == null ? "" : text;
    }

    private static String textualField(JsonNode parent, String field) {
        if (parent == null || parent.isMissingNode() || parent.isNull()) {
            return null;
        }
        JsonNode node = parent.path(field);
        if (!node.isTextual()) {
            return null;
        }
        String value = node.asText();
        return value == null || value.isEmpty() ? null : value;
    }

    private static String firstTextualField(JsonNode parent, String... fields) {
        for (String field : fields) {
            String value = textualField(parent, field);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String completeOnce(
            OpenAiApi openAiApi,
            OpenAiChatOptions options,
            String wireSystem,
            String userPrompt,
            String phase,
            AtomicReference<String> rawBody
    ) {
        // Disable Spring AI's nested RetryTemplate (defaults up to ~10 attempts); retries live in AiLlmCallPolicy.
        ChatModel chatModel = OpenAiChatModel.builder()
                .openAiApi(openAiApi)
                .defaultOptions(options)
                .retryTemplate(RetryTemplate.builder().maxAttempts(1).build())
                .build();

        ChatResponse response = chatModel.call(new Prompt(
                List.of(new SystemMessage(wireSystem), new UserMessage(userPrompt))
        ));
        AiChatCompletionTextExtractor.Extracted extracted =
                AiChatCompletionTextExtractor.extract(response, rawBody.get());
        if (extracted.hasRefusal()) {
            throw new IllegalArgumentException("LLM refused: " + extracted.refusal());
        }
        if (!extracted.hasText()) {
            throw new IllegalArgumentException("LLM returned empty reply");
        }
        if (extracted.usedReasoningFallback()) {
            log.info(
                    "AI LLM recovered reply from reasoning content phase={} chars={}",
                    phase,
                    extracted.text().length()
            );
        }
        return stripCodeFence(extracted.text());
    }

    private static final class ReplayClientHttpResponse implements ClientHttpResponse {
        private final ClientHttpResponse delegate;
        private final byte[] body;

        private ReplayClientHttpResponse(ClientHttpResponse delegate, byte[] body) {
            this.delegate = delegate;
            this.body = body;
        }

        @Override
        public HttpStatusCode getStatusCode() throws IOException {
            return delegate.getStatusCode();
        }

        @Override
        public String getStatusText() throws IOException {
            return delegate.getStatusText();
        }

        @Override
        public HttpHeaders getHeaders() {
            return delegate.getHeaders();
        }

        @Override
        public InputStream getBody() {
            return new ByteArrayInputStream(body);
        }

        @Override
        public void close() {
            delegate.close();
        }
    }

    public String mockComplete(String userPrompt) {
        if (userPrompt != null && userPrompt.toLowerCase(Locale.ROOT).contains("ok")) {
            return "OK";
        }
        return "OK";
    }

    public boolean isMock(AiLlmProfileDto profile) {
        return profile != null
                && profile.provider() != null
                && "mock".equalsIgnoreCase(profile.provider());
    }

    private void validateOpenAiProfile(AiLlmProfileDto profile) {
        if (profile.apiKey() == null || profile.apiKey().isBlank()) {
            throw new IllegalArgumentException("API Key is required");
        }
        if (profile.baseUrl() == null || profile.baseUrl().isBlank()) {
            throw new IllegalArgumentException("Base URL is required");
        }
        if (profile.model() == null || profile.model().isBlank()) {
            throw new IllegalArgumentException("Model is required");
        }
    }

    /** Isolate LLM circuit breakers per tenant + profile endpoint identity. */
    static String circuitKey(AiLlmProfileDto profile) {
        String profileId = nullToEmpty(profile != null ? profile.provider() : null)
                + "|"
                + nullToEmpty(profile != null ? profile.baseUrl() : null)
                + "|"
                + nullToEmpty(profile != null ? profile.model() : null);
        return AiLlmCallPolicy.circuitKeyForCurrentTenant(profileId);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * Read at most {@code maxBytes}; throw if the stream would exceed the cap (AI-11).
     */
    static byte[] readCapped(InputStream stream, int maxBytes) throws IOException {
        if (stream == null) {
            return new byte[0];
        }
        int cap = Math.max(1, maxBytes);
        byte[] bytes = stream.readNBytes(cap + 1);
        if (bytes.length > cap) {
            throw new IllegalArgumentException("LLM response exceeds " + cap + " bytes");
        }
        return bytes;
    }

    /**
     * Strip a single leading/trailing markdown code fence only (does not touch fences in the body).
     */
    public static String stripCodeFence(String text) {
        if (text == null) {
            return null;
        }
        String trimmed = text.trim();
        if (trimmed.startsWith("```")) {
            int newline = trimmed.indexOf('\n');
            if (newline >= 0) {
                trimmed = trimmed.substring(newline + 1);
            } else {
                trimmed = trimmed.substring(3);
            }
        }
        if (trimmed.endsWith("```")) {
            trimmed = trimmed.substring(0, trimmed.length() - 3);
        }
        return trimmed.trim();
    }

    /**
     * Incremental helper for streaming: strip a leading {@code ```} fence line once enough
     * bytes have arrived. Returns {@code null} when more deltas are needed to decide.
     */
    static String stripLeadingCodeFenceDelta(String buffered) {
        if (buffered == null) {
            return null;
        }
        int i = 0;
        while (i < buffered.length() && Character.isWhitespace(buffered.charAt(i))) {
            i++;
        }
        if (i >= buffered.length()) {
            return null;
        }
        if (!buffered.startsWith("```", i)) {
            return buffered;
        }
        int newline = buffered.indexOf('\n', i);
        if (newline < 0) {
            // Incomplete fence opener — wait a little, then give up and emit raw.
            return buffered.length() - i > 64 ? buffered : null;
        }
        return buffered.substring(newline + 1);
    }
}
