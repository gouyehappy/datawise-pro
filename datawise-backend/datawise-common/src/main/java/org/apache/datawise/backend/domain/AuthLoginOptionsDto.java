package org.apache.datawise.backend.domain;

/** Public login-page options (no secrets). */
public record AuthLoginOptionsDto(
        boolean localLoginEnabled,
        boolean oidcEnabled,
        String oidcProviderLabel,
        boolean registrationEnabled,
        boolean tenantCreateEnabled,
        String tenancyMode) {

    public AuthLoginOptionsDto(boolean localLoginEnabled, boolean oidcEnabled, String oidcProviderLabel) {
        this(localLoginEnabled, oidcEnabled, oidcProviderLabel, false, false, "single");
    }
}
