package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Admin-facing view of how connection / app secrets are protected (G5 slice).
 */
public record SecretsStatusDto(
        String masterKeySource,
        boolean masterKeyFromEnvironment,
        List<String> supportedSecretRefSchemes,
        String secretRefHint) {
}
