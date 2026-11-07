package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * CLI: {@code java ... DwpPackageTool <plugin-root> <output.dwp>
 * [--key-id ID] [--private-key-file PATH | --private-key-base64 B64]}.
 * Prefer {@code --private-key-file} or env {@code DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64}
 * so the key is not visible in process argv.
 */
public final class DwpPackageTool {

    private DwpPackageTool() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length >= 1 && "--generate-key".equals(args[0])) {
            generateKey(args.length >= 2 ? args[1] : "publisher-dev");
            return;
        }
        Parsed parsed = parseArgs(args);
        if (parsed.root == null || parsed.output == null) {
            printUsage();
            System.exit(2);
        }
        ObjectMapper mapper = new ObjectMapper();
        Path manifestPath = parsed.root.resolve("manifest.json");
        CommunityPluginManifest manifest = mapper.readValue(manifestPath.toFile(), CommunityPluginManifest.class);
        Map<String, byte[]> payload = collectPayload(parsed.root);
        byte[] dwp;
        String keyId = firstNonBlank(parsed.keyId, System.getenv("DATAWISE_PLUGIN_SIGN_KEY_ID"));
        String privateKeyBase64 = resolvePrivateKeyBase64(parsed);
        if (keyId != null && privateKeyBase64 != null) {
            dwp = DwpCodec.buildSigned(
                    manifest,
                    payload,
                    mapper,
                    keyId,
                    DwpEd25519.decodePrivateKey(privateKeyBase64));
            System.out.println("Signed with keyId=" + keyId);
        } else {
            dwp = DwpCodec.buildUnsigned(manifest, payload, mapper);
        }
        Files.createDirectories(parsed.output.getParent());
        Files.write(parsed.output, dwp);
        System.out.println("Wrote " + parsed.output + " (" + dwp.length + " bytes)");
    }

    private static void generateKey(String keyId) throws Exception {
        KeyPair keyPair = DwpEd25519.generateKeyPair();
        Map<String, String> out = new LinkedHashMap<>();
        out.put("id", keyId);
        out.put("label", keyId);
        out.put("publicKeyBase64", DwpEd25519.encodePublicKey(keyPair.getPublic()));
        out.put("privateKeyBase64", DwpEd25519.encodePrivateKey(keyPair.getPrivate()));
        System.out.println(new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(out));
    }

    private static Map<String, byte[]> collectPayload(Path root) throws Exception {
        Map<String, byte[]> payload = new LinkedHashMap<>();
        try (Stream<Path> walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile).forEach(file -> {
                String name = root.relativize(file).toString().replace('\\', '/');
                if ("manifest.json".equals(name) || name.startsWith("sidecar/") || name.startsWith("dist/")
                        || name.startsWith(".") || name.endsWith(".mjs") || name.endsWith(".md")) {
                    return;
                }
                try {
                    payload.put(name, Files.readAllBytes(file));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
        }
        return payload;
    }

    private static String resolvePrivateKeyBase64(Parsed parsed) throws Exception {
        if (parsed.privateKeyFile != null) {
            String fromFile = Files.readString(parsed.privateKeyFile).trim();
            return fromFile.isEmpty() ? null : fromFile;
        }
        String fromArg = firstNonBlank(parsed.privateKeyBase64, null);
        if (fromArg != null) {
            return fromArg;
        }
        return firstNonBlank(System.getenv("DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64"), null);
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary.trim();
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback.trim();
        }
        return null;
    }

    private static Parsed parseArgs(String[] args) {
        Parsed parsed = new Parsed();
        List<String> positional = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if ("--key-id".equals(arg) && i + 1 < args.length) {
                parsed.keyId = args[++i];
            } else if ("--private-key-file".equals(arg) && i + 1 < args.length) {
                parsed.privateKeyFile = Path.of(args[++i]).toAbsolutePath().normalize();
            } else if ("--private-key-base64".equals(arg) && i + 1 < args.length) {
                parsed.privateKeyBase64 = args[++i];
            } else if (!arg.startsWith("--")) {
                positional.add(arg);
            }
        }
        if (!positional.isEmpty()) {
            parsed.root = Path.of(positional.get(0)).toAbsolutePath().normalize();
        }
        if (positional.size() >= 2) {
            parsed.output = Path.of(positional.get(1)).toAbsolutePath().normalize();
        }
        return parsed;
    }

    private static void printUsage() {
        System.err.println("""
                Usage:
                  DwpPackageTool <plugin-root> <output.dwp> [--key-id ID] [--private-key-file PATH]
                  DwpPackageTool <plugin-root> <output.dwp> [--key-id ID] [--private-key-base64 B64]
                  DwpPackageTool --generate-key [key-id]

                Prefer --private-key-file or env DATAWISE_PLUGIN_SIGN_PRIVATE_KEY_B64 / DATAWISE_PLUGIN_SIGN_KEY_ID.
                """);
    }

    private static final class Parsed {

        Path root;
        Path output;
        String keyId;
        String privateKeyBase64;
        Path privateKeyFile;
    }
}
