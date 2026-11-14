package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.config.EntitlementProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Fail-fast when entitlement pack unsigned install is enabled outside trusted local profiles.
 * Community-plugin allow-unsigned is a separate knob ({@code datawise.community-plugin.allow-unsigned}).
 */
@Component
@Order(0)
public class EntitlementUnsignedStartupGuard implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(EntitlementUnsignedStartupGuard.class);

    private final EntitlementProperties entitlementProperties;
    private final String activeProfiles;

    public EntitlementUnsignedStartupGuard(
            EntitlementProperties entitlementProperties,
            @Value("${spring.profiles.active:}") String activeProfiles
    ) {
        this.entitlementProperties = entitlementProperties;
        this.activeProfiles = activeProfiles != null ? activeProfiles : "";
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!entitlementProperties.isAllowUnsigned()) {
            return;
        }
        if (isTrustedLocalProfile()) {
            log.warn(
                    "datawise.entitlement.allow-unsigned=true (dev/test only). "
                            + "Unsigned .dpk still requires signatures/payload.sha256 integrity."
            );
            return;
        }
        throw new IllegalStateException(
                "datawise.entitlement.allow-unsigned=true is forbidden outside dev/test profiles. "
                        + "This is NOT datawise.community-plugin.allow-unsigned."
        );
    }

    private boolean isTrustedLocalProfile() {
        String normalized = activeProfiles.toLowerCase();
        return normalized.contains("dev")
                || normalized.contains("test")
                || normalized.contains("local");
    }
}
