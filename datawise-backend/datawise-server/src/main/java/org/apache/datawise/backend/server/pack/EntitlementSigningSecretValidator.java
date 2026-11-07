package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.config.EntitlementProperties;
import org.springframework.stereotype.Component;

/**
 * Fail fast when entitlement enforcement is on but the signing secret is still the public
 * local/CI default.
 */
@Component
public class EntitlementSigningSecretValidator {

    public EntitlementSigningSecretValidator(EntitlementProperties properties) {
        if (properties == null) {
            return;
        }
        boolean enforced = !properties.isOpen();
        if (enforced && properties.isUsingDevSigningSecret()) {
            throw new IllegalStateException(
                    "datawise.entitlement.mode is enforced but signing-secret is still the public "
                            + "dev default; set datawise.entitlement.signing-secret to a private value"
            );
        }
    }
}
