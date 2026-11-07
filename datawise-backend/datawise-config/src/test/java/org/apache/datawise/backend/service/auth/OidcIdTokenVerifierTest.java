package org.apache.datawise.backend.service.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.Executors;

import com.sun.net.httpserver.HttpServer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OidcIdTokenVerifierTest {

    @Test
    void verifiesRs256IdTokenAndRejectsTamperedPayload() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair keyPair = generator.generateKeyPair();
        RSAPublicKey publicKey = (RSAPublicKey) keyPair.getPublic();

        String jwks = """
                {"keys":[{"kty":"RSA","kid":"k1","alg":"RS256","use":"sig","n":"%s","e":"%s"}]}
                """.formatted(
                Base64.getUrlEncoder().withoutPadding().encodeToString(toUnsigned(publicKey.getModulus())),
                Base64.getUrlEncoder().withoutPadding().encodeToString(toUnsigned(publicKey.getPublicExponent()))).trim();

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/jwks", exchange -> {
            byte[] body = jwks.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.setExecutor(Executors.newSingleThreadExecutor());
        server.start();
        try {
            String jwksUri = "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks";
            String issuer = "https://idp.example";
            String clientId = "datawise";
            long exp = Instant.now().plusSeconds(300).getEpochSecond();
            String header = b64Url("{\"alg\":\"RS256\",\"kid\":\"k1\",\"typ\":\"JWT\"}");
            String payload = b64Url(
                    "{\"iss\":\"" + issuer + "\",\"aud\":\"" + clientId
                            + "\",\"exp\":" + exp + ",\"email\":\"a@example.com\",\"sub\":\"u1\"}");
            String signingInput = header + "." + payload;
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(keyPair.getPrivate());
            signer.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign());
            String jwt = signingInput + "." + signature;

            OidcIdTokenVerifier verifier = new OidcIdTokenVerifier(new ObjectMapper(), HttpClient.newHttpClient());
            var claims = verifier.verify(jwt, issuer, clientId, jwksUri);
            assertEquals("a@example.com", claims.get("email").asText());

            String tampered = header + "." + b64Url(
                    "{\"iss\":\"" + issuer + "\",\"aud\":\"" + clientId
                            + "\",\"exp\":" + exp + ",\"email\":\"evil@example.com\",\"sub\":\"u1\"}")
                    + "." + signature;
            IllegalArgumentException ex = assertThrows(
                    IllegalArgumentException.class,
                    () -> verifier.verify(tampered, issuer, clientId, jwksUri));
            assertTrue(ex.getMessage().contains("OIDC_ID_TOKEN_SIGNATURE_INVALID"));
        } finally {
            server.stop(0);
        }
    }

    private static byte[] toUnsigned(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) {
            byte[] trimmed = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, trimmed, 0, trimmed.length);
            return trimmed;
        }
        return bytes;
    }

    private static String b64Url(String json) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}
