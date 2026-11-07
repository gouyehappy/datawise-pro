package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * {@code signature.json} envelope. Signs the exact {@code checksums.json} bytes in the package.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginSignatureEnvelope(
        String alg,
        String keyId,
        String signatureBase64) {
}
