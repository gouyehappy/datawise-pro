package org.apache.datawise.backend.domain.pack;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Ed25519 pack signatures (Wave 9). Public key is distributable; private key stays in CI / HSM.
 */
public final class PackEd25519 {

    public static final String SIG_ENTRY = "signatures/pack.ed25519";
    public static final String ALG = "Ed25519";

    private PackEd25519() {
    }

    public static KeyPair generate() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance(ALG);
            return gen.generateKeyPair();
        } catch (Exception ex) {
            throw new IllegalStateException("Ed25519 unavailable", ex);
        }
    }

    public static void writeKeyPair(Path privatePkcs8, Path publicX509, KeyPair pair) throws Exception {
        Files.createDirectories(privatePkcs8.getParent() != null ? privatePkcs8.getParent() : Path.of("."));
        Files.createDirectories(publicX509.getParent() != null ? publicX509.getParent() : Path.of("."));
        Files.writeString(privatePkcs8, encodePem("PRIVATE KEY", pair.getPrivate().getEncoded()));
        Files.writeString(publicX509, encodePem("PUBLIC KEY", pair.getPublic().getEncoded()));
    }

    public static PrivateKey loadPrivateKey(Path pemPath) throws Exception {
        byte[] der = decodePem(Files.readString(pemPath));
        return KeyFactory.getInstance(ALG).generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    public static PublicKey loadPublicKey(Path pemPath) throws Exception {
        byte[] der = decodePem(Files.readString(pemPath));
        return KeyFactory.getInstance(ALG).generatePublic(new X509EncodedKeySpec(der));
    }

    public static PublicKey loadPublicKeyBytes(byte[] pemOrDer) throws Exception {
        String text = new String(pemOrDer, StandardCharsets.UTF_8);
        byte[] der = text.contains("BEGIN") ? decodePem(text) : pemOrDer;
        return KeyFactory.getInstance(ALG).generatePublic(new X509EncodedKeySpec(der));
    }

    public static byte[] sign(byte[] message, PrivateKey privateKey) {
        try {
            Signature sig = Signature.getInstance(ALG);
            sig.initSign(privateKey);
            sig.update(message);
            return sig.sign();
        } catch (Exception ex) {
            throw new PackEntitlementException(
                    DatawiseErrorCodes.PACK_INTEGRITY_FAILED,
                    "Ed25519 sign failed: " + ex.getMessage(),
                    500);
        }
    }

    public static boolean verify(byte[] message, byte[] signature, PublicKey publicKey) {
        try {
            Signature sig = Signature.getInstance(ALG);
            sig.initVerify(publicKey);
            sig.update(message);
            return sig.verify(signature);
        } catch (Exception ex) {
            return false;
        }
    }

    private static String encodePem(String type, byte[] der) {
        String b64 = Base64.getMimeEncoder(64, new byte[]{'\n'}).encodeToString(der);
        return "-----BEGIN " + type + "-----\n" + b64 + "\n-----END " + type + "-----\n";
    }

    private static byte[] decodePem(String pem) {
        String normalized = pem.replace("\r", "");
        StringBuilder body = new StringBuilder();
        for (String line : normalized.split("\n")) {
            if (line.startsWith("-----")) {
                continue;
            }
            body.append(line.trim());
        }
        return Base64.getDecoder().decode(body.toString());
    }
}
