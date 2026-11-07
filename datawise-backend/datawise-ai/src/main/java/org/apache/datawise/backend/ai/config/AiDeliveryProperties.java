package org.apache.datawise.backend.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI delivery mode (PRODUCT_EXTENSION_PACKS §6.5 / Wave 26–27).
 * <ul>
 *   <li>{@code offline} — call the LLM base URL from the user/profile (default; preserves current behaviour)</li>
 *   <li>{@code hybrid} — when {@code hybrid-base-url} is set, route OpenAI-compatible calls through that gateway</li>
 * </ul>
 * With a hybrid gateway + {@code opaque-prompts}, system templates are replaced by
 * {@link org.apache.datawise.backend.ai.support.AiHybridPromptProtocol} envelopes on the wire.
 */
@ConfigurationProperties(prefix = "datawise.ai")
public class AiDeliveryProperties {

    public static final String DELIVERY_HYBRID = "hybrid";
    public static final String DELIVERY_OFFLINE = "offline";

    /** hybrid | offline */
    private String delivery = DELIVERY_OFFLINE;

    /** Empty = hybrid falls back to profile base URL (dev / open mode). */
    private String hybridBaseUrl = "";

    /**
     * When true and a hybrid gateway is configured, strip full system Prompt templates
     * from OpenAI-compatible requests (default true).
     */
    private boolean opaquePrompts = true;

    /**
     * Dev/CI only: expose a local OpenAI-compatible stub that expands {@code dw-ai/1}
     * promptRef envelopes (Wave 28). Default off.
     */
    private GatewayStub gatewayStub = new GatewayStub();

    public String getDelivery() {
        return delivery;
    }

    public void setDelivery(String delivery) {
        this.delivery = delivery;
    }

    public String getHybridBaseUrl() {
        return hybridBaseUrl;
    }

    public void setHybridBaseUrl(String hybridBaseUrl) {
        this.hybridBaseUrl = hybridBaseUrl;
    }

    public boolean isOpaquePrompts() {
        return opaquePrompts;
    }

    public void setOpaquePrompts(boolean opaquePrompts) {
        this.opaquePrompts = opaquePrompts;
    }

    public GatewayStub getGatewayStub() {
        return gatewayStub;
    }

    public void setGatewayStub(GatewayStub gatewayStub) {
        this.gatewayStub = gatewayStub != null ? gatewayStub : new GatewayStub();
    }

    public boolean isGatewayStubEnabled() {
        return gatewayStub != null && gatewayStub.isEnabled();
    }

    public boolean isHybrid() {
        return delivery != null && DELIVERY_HYBRID.equalsIgnoreCase(delivery.trim());
    }

    public boolean isHybridGatewayConfigured() {
        return isHybrid() && hybridBaseUrl != null && !hybridBaseUrl.isBlank();
    }

    /** Opaque wire protocol when hybrid gateway is live and {@code opaque-prompts} is on. */
    public boolean shouldUseOpaquePrompts() {
        return isHybridGatewayConfigured() && opaquePrompts;
    }

    /** Prefer hybrid gateway URL when configured; otherwise the profile URL. */
    public String resolveBaseUrl(String profileBaseUrl) {
        if (isHybridGatewayConfigured()) {
            return hybridBaseUrl.trim();
        }
        return profileBaseUrl;
    }

    public static class GatewayStub {
        private boolean enabled = false;

        /**
         * When set, expand opaque prompts then forward to this OpenAI-compatible base
         * (e.g. {@code https://api.openai.com/v1}). Empty = local mock reply only.
         */
        private String upstreamBaseUrl = "";

        /** Optional Bearer token for upstream. */
        private String upstreamApiKey = "";

        private int upstreamTimeoutSeconds = 60;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getUpstreamBaseUrl() {
            return upstreamBaseUrl;
        }

        public void setUpstreamBaseUrl(String upstreamBaseUrl) {
            this.upstreamBaseUrl = upstreamBaseUrl;
        }

        public String getUpstreamApiKey() {
            return upstreamApiKey;
        }

        public void setUpstreamApiKey(String upstreamApiKey) {
            this.upstreamApiKey = upstreamApiKey;
        }

        public int getUpstreamTimeoutSeconds() {
            return upstreamTimeoutSeconds;
        }

        public void setUpstreamTimeoutSeconds(int upstreamTimeoutSeconds) {
            this.upstreamTimeoutSeconds = upstreamTimeoutSeconds;
        }

        public boolean isUpstreamConfigured() {
            return upstreamBaseUrl != null && !upstreamBaseUrl.isBlank();
        }
    }
}
