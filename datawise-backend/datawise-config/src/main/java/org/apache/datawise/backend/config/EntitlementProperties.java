package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Extension Pack entitlement. Defaults to {@code open} so existing installs keep full access.
 */
@ConfigurationProperties(prefix = "datawise.entitlement")
public class EntitlementProperties {

    /**
     * {@code open} — all packs active (dev / transition).
     * {@code enforced} — only entitled packs (license / trial).
     */
    private String mode = "open";

    private int freeAiCallsDailyLimit = 3;

    /** Free trial migration row cap when pack.migration is locked (0 = no free trial). */
    private int freeMigrationRowsLimit = 1000;

    /** Trial length in days when starting a pack trial. */
    private int trialDays = 7;

    /**
     * One-shot site Pro suite trial length (§1.3).
     * Local default 7; cloud deployments may set 14 for the manual CTA.
     */
    private int siteProTrialDays = 7;

    /**
     * When true (cloud / multi-tenant), newly created tenants automatically receive a Pro suite trial.
     * Local desktop keeps {@code false}; admins claim via site Pro CTA instead.
     */
    private boolean autoClaimTenantProTrial = false;

    /**
     * Length of the automatic per-tenant Pro trial (§1.3 cloud = 14 days).
     */
    private int tenantProTrialDays = 14;

    /**
     * Well-known local/CI default. Never fall back to this when a blank secret is passed into codecs —
     * callers must supply an explicit secret (Spring binds this default via properties for local only).
     */
    public static final String DEV_SIGNING_SECRET = "datawise-dev-pack-signing-secret-change-me";

    /**
     * HMAC secret used to verify {@code DW1.} license keys.
     * Override in production; default is for local / CI only.
     */
    private String signingSecret = DEV_SIGNING_SECRET;

    /** Append trial / site watermark on exports when true. */
    private boolean watermarkEnabled = true;

    /** Override watermark footer; blank uses PackWatermark default trial text. */
    private String watermarkText = "";

    /**
     * Optional notarization URL. Blank disables heartbeat (default).
     * When set, server POSTs a lightweight site probe on a schedule.
     */
    private String heartbeatUrl = "";

    /** Minimum hours between notarization heartbeats. */
    private int heartbeatIntervalHours = 24;

    /**
     * When true, {@code .dpk} signature may be omitted (dev only).
     * Production must keep {@code false}.
     */
    private boolean allowUnsigned = false;

    /** Core version used for pack min/max compatibility checks. */
    private String coreVersion = "4.1.2";

    /**
     * Optional Ed25519 public key PEM path (classpath or filesystem).
     * When set, {@code signatures/pack.ed25519} is verified.
     */
    private String publicKeyPath = "";

    /** When true with a public key configured, HMAC-only packs are rejected. */
    private boolean requireEd25519 = false;

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public int getFreeAiCallsDailyLimit() {
        return freeAiCallsDailyLimit;
    }

    public void setFreeAiCallsDailyLimit(int freeAiCallsDailyLimit) {
        this.freeAiCallsDailyLimit = freeAiCallsDailyLimit;
    }

    public int getFreeMigrationRowsLimit() {
        return freeMigrationRowsLimit;
    }

    public void setFreeMigrationRowsLimit(int freeMigrationRowsLimit) {
        this.freeMigrationRowsLimit = freeMigrationRowsLimit;
    }

    public int getTrialDays() {
        return trialDays;
    }

    public void setTrialDays(int trialDays) {
        this.trialDays = trialDays;
    }

    public int getSiteProTrialDays() {
        return siteProTrialDays;
    }

    public void setSiteProTrialDays(int siteProTrialDays) {
        this.siteProTrialDays = siteProTrialDays;
    }

    public boolean isAutoClaimTenantProTrial() {
        return autoClaimTenantProTrial;
    }

    public void setAutoClaimTenantProTrial(boolean autoClaimTenantProTrial) {
        this.autoClaimTenantProTrial = autoClaimTenantProTrial;
    }

    public int getTenantProTrialDays() {
        return tenantProTrialDays;
    }

    public void setTenantProTrialDays(int tenantProTrialDays) {
        this.tenantProTrialDays = tenantProTrialDays;
    }

    public String getSigningSecret() {
        return signingSecret;
    }

    public void setSigningSecret(String signingSecret) {
        this.signingSecret = signingSecret;
    }

    /** True when the configured secret is still the public local/CI default. */
    public boolean isUsingDevSigningSecret() {
        return signingSecret == null
                || signingSecret.isBlank()
                || DEV_SIGNING_SECRET.equals(signingSecret);
    }

    public boolean isWatermarkEnabled() {
        return watermarkEnabled;
    }

    public void setWatermarkEnabled(boolean watermarkEnabled) {
        this.watermarkEnabled = watermarkEnabled;
    }

    public String getWatermarkText() {
        return watermarkText;
    }

    public void setWatermarkText(String watermarkText) {
        this.watermarkText = watermarkText;
    }

    public String getHeartbeatUrl() {
        return heartbeatUrl;
    }

    public void setHeartbeatUrl(String heartbeatUrl) {
        this.heartbeatUrl = heartbeatUrl;
    }

    public int getHeartbeatIntervalHours() {
        return heartbeatIntervalHours;
    }

    public void setHeartbeatIntervalHours(int heartbeatIntervalHours) {
        this.heartbeatIntervalHours = heartbeatIntervalHours;
    }

    public boolean isAllowUnsigned() {
        return allowUnsigned;
    }

    public void setAllowUnsigned(boolean allowUnsigned) {
        this.allowUnsigned = allowUnsigned;
    }

    public String getCoreVersion() {
        return coreVersion;
    }

    public void setCoreVersion(String coreVersion) {
        this.coreVersion = coreVersion;
    }

    public String getPublicKeyPath() {
        return publicKeyPath;
    }

    public void setPublicKeyPath(String publicKeyPath) {
        this.publicKeyPath = publicKeyPath;
    }

    public boolean isRequireEd25519() {
        return requireEd25519;
    }

    public void setRequireEd25519(boolean requireEd25519) {
        this.requireEd25519 = requireEd25519;
    }

    public boolean isOpen() {
        return mode == null || mode.isBlank() || "open".equalsIgnoreCase(mode.trim());
    }

    public boolean isHeartbeatConfigured() {
        return heartbeatUrl != null && !heartbeatUrl.isBlank();
    }
}
