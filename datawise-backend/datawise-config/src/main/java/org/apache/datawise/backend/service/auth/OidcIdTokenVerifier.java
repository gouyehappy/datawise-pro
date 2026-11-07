package org.apache.datawise.backend.service.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verifies OIDC {@code id_token} signatures (RS256 / JWKS) and basic claims.
 * Does not trust unsigned payloads.
 */
final class OidcIdTokenVerifier {

    private static final Duration JWKS_CACHE_TTL = Duration.ofMinutes(10);
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(2);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ConcurrentHashMap<String, CachedJwks> jwksCache = new ConcurrentHashMap<>();

    OidcIdTokenVerifier(ObjectMapper objectMapper, HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    JsonNode verify(String jwt, String issuer, String clientId, String jwksUri) {
        if (jwt == null || jwt.isBlank()) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_MISSING");
        }
        if (jwksUri == null || jwksUri.isBlank()) {
            throw new IllegalArgumentException("OIDC_JWKS_MISSING");
        }
        String[] parts = jwt.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_INVALID");
        }
        JsonNode header;
        JsonNode payload;
        try {
            header = objectMapper.readTree(Base64.getUrlDecoder().decode(padBase64(parts[0])));
            payload = objectMapper.readTree(Base64.getUrlDecoder().decode(padBase64(parts[1])));
        } catch (Exception ex) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_INVALID");
        }
        String alg = text(header, "alg");
        if (alg == null || !"RS256".equalsIgnoreCase(alg)) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_ALG_UNSUPPORTED");
        }
        String kid = text(header, "kid");
        PublicKey key = resolveKey(jwksUri, kid);
        byte[] signature;
        try {
            signature = Base64.getUrlDecoder().decode(padBase64(parts[2]));
        } catch (Exception ex) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_INVALID");
        }
        String signingInput = parts[0] + "." + parts[1];
        try {
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(key);
            verifier.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            if (!verifier.verify(signature)) {
                throw new IllegalArgumentException("OIDC_ID_TOKEN_SIGNATURE_INVALID");
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_SIGNATURE_INVALID");
        }
        validateClaims(payload, issuer, clientId);
        return payload;
    }

    private void validateClaims(JsonNode payload, String issuer, String clientId) {
        String iss = text(payload, "iss");
        if (issuer != null && !issuer.isBlank()) {
            String normalizedIssuer = issuer.endsWith("/") ? issuer.substring(0, issuer.length() - 1) : issuer;
            String normalizedIss = iss != null && iss.endsWith("/") ? iss.substring(0, iss.length() - 1) : iss;
            if (normalizedIss == null || !normalizedIssuer.equals(normalizedIss)) {
                throw new IllegalArgumentException("OIDC_ID_TOKEN_ISS_MISMATCH");
            }
        }
        if (clientId != null && !clientId.isBlank() && !audienceContains(payload.get("aud"), clientId)) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_AUD_MISMATCH");
        }
        if (!payload.has("exp") || payload.get("exp").isNull()) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_EXPIRED");
        }
        long exp = payload.get("exp").asLong();
        Instant expiresAt = Instant.ofEpochSecond(exp);
        if (Instant.now().isAfter(expiresAt.plus(CLOCK_SKEW))) {
            throw new IllegalArgumentException("OIDC_ID_TOKEN_EXPIRED");
        }
    }

    private static boolean audienceContains(JsonNode aud, String clientId) {
        if (aud == null || aud.isNull()) {
            return false;
        }
        if (aud.isTextual()) {
            return clientId.equals(aud.asText());
        }
        if (aud.isArray()) {
            for (JsonNode item : aud) {
                if (clientId.equals(item.asText())) {
                    return true;
                }
            }
        }
        return false;
    }

    private PublicKey resolveKey(String jwksUri, String kid) {
        JsonNode jwks = loadJwks(jwksUri);
        JsonNode keys = jwks.get("keys");
        if (keys == null || !keys.isArray() || keys.isEmpty()) {
            throw new IllegalArgumentException("OIDC_JWKS_EMPTY");
        }
        JsonNode match = null;
        for (JsonNode key : keys) {
            if (!"RSA".equalsIgnoreCase(text(key, "kty"))) {
                continue;
            }
            String keyKid = text(key, "kid");
            if (kid == null || kid.isBlank() || kid.equals(keyKid)) {
                match = key;
                if (kid != null && kid.equals(keyKid)) {
                    break;
                }
            }
        }
        if (match == null) {
            // kid miss — refresh once in case of rotation
            jwksCache.remove(jwksUri);
            jwks = loadJwks(jwksUri);
            keys = jwks.get("keys");
            for (JsonNode key : keys) {
                if (kid != null && kid.equals(text(key, "kid"))) {
                    match = key;
                    break;
                }
            }
        }
        if (match == null) {
            throw new IllegalArgumentException("OIDC_JWKS_KEY_NOT_FOUND");
        }
        return toRsaPublicKey(match);
    }

    private JsonNode loadJwks(String jwksUri) {
        CachedJwks cached = jwksCache.get(jwksUri);
        if (cached != null && Instant.now().isBefore(cached.expiresAt())) {
            return cached.document();
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(jwksUri))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("OIDC_JWKS_FETCH_FAILED");
            }
            JsonNode document = objectMapper.readTree(response.body());
            jwksCache.put(jwksUri, new CachedJwks(document, Instant.now().plus(JWKS_CACHE_TTL)));
            return document;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("OIDC_JWKS_FETCH_FAILED");
        }
    }

    private static RSAPublicKey toRsaPublicKey(JsonNode jwk) {
        try {
            byte[] n = Base64.getUrlDecoder().decode(padBase64(text(jwk, "n")));
            byte[] e = Base64.getUrlDecoder().decode(padBase64(text(jwk, "e")));
            RSAPublicKeySpec spec = new RSAPublicKeySpec(new BigInteger(1, n), new BigInteger(1, e));
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
        } catch (Exception ex) {
            throw new IllegalArgumentException("OIDC_JWKS_KEY_INVALID");
        }
    }

    private static String padBase64(String value) {
        if (value == null) {
            return "";
        }
        int rem = value.length() % 4;
        if (rem == 0) {
            return value;
        }
        return value + "====".substring(rem);
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        String value = node.get(field).asText(null);
        return value != null && !value.isBlank() ? value.trim() : null;
    }

    private record CachedJwks(JsonNode document, Instant expiresAt) {
    }
}
