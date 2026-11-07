package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.domain.pack.LicenseDocument;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/**
 * License key format: {@code DW1.<base64url(json)>.<base64url(hmac-sha256)>}.
 */
public final class LicenseCodec {

    public static final String PREFIX = "DW1.";

    private LicenseCodec() {
    }

    public static String issue(LicenseDocument document, String signingSecret, ObjectMapper mapper) {
        Objects.requireNonNull(document, "document");
        try {
            byte[] payload = mapper.writeValueAsBytes(document);
            String body = Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
            String sig = Base64.getUrlEncoder().withoutPadding().encodeToString(hmac(payload, signingSecret));
            return PREFIX + body + "." + sig;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to issue license: " + ex.getMessage(), ex);
        }
    }

    public static LicenseDocument verify(String licenseKey, String signingSecret, ObjectMapper mapper) {
        if (licenseKey == null || licenseKey.isBlank()) {
            throw PackEntitlementException.licenseMismatch("licenseKey is required");
        }
        String trimmed = licenseKey.trim();
        if (!trimmed.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
            throw PackEntitlementException.licenseMismatch("Unsupported license format");
        }
        String rest = trimmed.substring(PREFIX.length());
        int dot = rest.lastIndexOf('.');
        if (dot <= 0 || dot >= rest.length() - 1) {
            throw PackEntitlementException.licenseMismatch("Malformed license key");
        }
        String body = rest.substring(0, dot);
        String sig = rest.substring(dot + 1);
        try {
            byte[] payload = Base64.getUrlDecoder().decode(body);
            byte[] expected = hmac(payload, signingSecret);
            byte[] actual = Base64.getUrlDecoder().decode(sig);
            if (!constantTimeEquals(expected, actual)) {
                throw PackEntitlementException.licenseMismatch("License signature invalid");
            }
            LicenseDocument document = mapper.readValue(payload, LicenseDocument.class);
            validateDocument(document);
            return document;
        } catch (PackEntitlementException ex) {
            throw ex;
        } catch (Exception ex) {
            throw PackEntitlementException.licenseMismatch("License parse failed");
        }
    }

    static void validateDocument(LicenseDocument document) {
        if (document == null || document.packs() == null || document.packs().isEmpty()) {
            throw PackEntitlementException.licenseMismatch("License packs are required");
        }
        if (document.expiresAt() != null && !document.expiresAt().isBlank()) {
            Instant expires = Instant.parse(document.expiresAt());
            if (expires.isBefore(Instant.now())) {
                throw PackEntitlementException.licenseExpired();
            }
        }
        for (String packId : document.packs()) {
            if (packId == null || packId.isBlank()) {
                throw PackEntitlementException.licenseMismatch("Blank pack id in license");
            }
            if (!org.apache.datawise.backend.domain.pack.PackIds.ALL.contains(packId.trim())) {
                throw PackEntitlementException.licenseMismatch("Unknown pack in license: " + packId);
            }
        }
    }

    public static List<String> normalizePackIds(List<String> packs) {
        if (packs == null || packs.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String pack : packs) {
            if (pack == null || pack.isBlank()) {
                continue;
            }
            String id = pack.trim();
            if (org.apache.datawise.backend.domain.pack.PackIds.ALL.contains(id)) {
                out.add(id);
            }
        }
        return List.copyOf(out);
    }

    private static byte[] hmac(byte[] payload, String secret) throws Exception {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("signing secret is required");
        }
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(payload);
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a == null || b == null || a.length != b.length) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }
}
