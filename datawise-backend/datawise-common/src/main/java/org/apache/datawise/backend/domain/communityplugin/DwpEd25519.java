package org.apache.datawise.backend.domain.communityplugin;

import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Objects;

/**
 * Ed25519 helpers for {@code .dwp} signing. Public keys are stored as X.509 SPKI Base64.
 */
public final class DwpEd25519 {

    public static final String ALG = "Ed25519";

    private DwpEd25519() {
    }

    public static KeyPair generateKeyPair() {
        try {
            return KeyPairGenerator.getInstance(ALG).generateKeyPair();
        } catch (Exception e) {
            throw new CommunityPluginException("Ed25519 is unavailable: " + e.getMessage(), e);
        }
    }

    public static String encodePublicKey(PublicKey publicKey) {
        return Base64.getEncoder().encodeToString(Objects.requireNonNull(publicKey, "publicKey").getEncoded());
    }

    public static String encodePrivateKey(PrivateKey privateKey) {
        return Base64.getEncoder().encodeToString(Objects.requireNonNull(privateKey, "privateKey").getEncoded());
    }

    public static PublicKey decodePublicKey(String publicKeyBase64) {
        try {
            byte[] encoded = Base64.getDecoder().decode(Objects.requireNonNull(publicKeyBase64, "publicKeyBase64"));
            return KeyFactory.getInstance(ALG).generatePublic(new X509EncodedKeySpec(encoded));
        } catch (Exception e) {
            throw new CommunityPluginException("Invalid Ed25519 public key", e);
        }
    }

    public static PrivateKey decodePrivateKey(String privateKeyBase64) {
        try {
            byte[] encoded = Base64.getDecoder().decode(Objects.requireNonNull(privateKeyBase64, "privateKeyBase64"));
            return KeyFactory.getInstance(ALG).generatePrivate(new PKCS8EncodedKeySpec(encoded));
        } catch (Exception e) {
            throw new CommunityPluginException("Invalid Ed25519 private key", e);
        }
    }

    public static byte[] sign(byte[] payload, PrivateKey privateKey) {
        try {
            Signature signature = Signature.getInstance(ALG);
            signature.initSign(privateKey);
            signature.update(payload);
            return signature.sign();
        } catch (Exception e) {
            throw new CommunityPluginException("Failed to sign plugin package: " + e.getMessage(), e);
        }
    }

    public static boolean verify(byte[] payload, byte[] signatureBytes, PublicKey publicKey) {
        try {
            Signature signature = Signature.getInstance(ALG);
            signature.initVerify(publicKey);
            signature.update(payload);
            return signature.verify(signatureBytes);
        } catch (Exception e) {
            throw new CommunityPluginException("Failed to verify plugin signature: " + e.getMessage(), e);
        }
    }
}
