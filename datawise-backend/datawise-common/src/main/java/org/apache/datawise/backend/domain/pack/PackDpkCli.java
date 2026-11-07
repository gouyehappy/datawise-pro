package org.apache.datawise.backend.domain.pack;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * CLI for pack signing / keygen.
 * <pre>
 *   PackDpkCli keygen &lt;private.pem&gt; &lt;public.pem&gt;
 *   PackDpkCli build &lt;packDir&gt; &lt;out.dpk&gt; [--seal] [--site=id] [--secret=...] [--ed25519-private=path] [--allow-dev-secret]
 * </pre>
 */
public final class PackDpkCli {

    private static final String DEV_SIGNING_SECRET = "datawise-dev-pack-signing-secret-change-me";

    private PackDpkCli() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0) {
            usage();
            System.exit(2);
        }
        if ("keygen".equals(args[0])) {
            if (args.length < 3) {
                usage();
                System.exit(2);
            }
            KeyPair pair = PackEd25519.generate();
            PackEd25519.writeKeyPair(Path.of(args[1]), Path.of(args[2]), pair);
            System.out.println("Wrote Ed25519 key pair: " + args[1] + " / " + args[2]);
            return;
        }
        if (!"build".equals(args[0]) || args.length < 3) {
            usage();
            System.exit(2);
        }
        Path packDir = Path.of(args[1]).toAbsolutePath().normalize();
        Path out = Path.of(args[2]).toAbsolutePath().normalize();
        boolean seal = false;
        boolean allowDevSecret = false;
        String site = "";
        String envSecret = System.getenv("DATAWISE_PACK_SIGNING_SECRET");
        boolean secretFromEnv = envSecret != null && !envSecret.isBlank();
        String secret = secretFromEnv ? envSecret : DEV_SIGNING_SECRET;
        boolean secretFromFlag = false;
        String edPrivatePath = System.getenv().getOrDefault("DATAWISE_PACK_ED25519_PRIVATE", "");
        for (int i = 3; i < args.length; i++) {
            String a = args[i];
            if ("--seal".equals(a)) {
                seal = true;
            } else if ("--allow-dev-secret".equals(a)) {
                allowDevSecret = true;
            } else if (a.startsWith("--site=")) {
                site = a.substring("--site=".length());
            } else if (a.startsWith("--secret=")) {
                secret = a.substring("--secret=".length());
                secretFromFlag = true;
            } else if (a.startsWith("--ed25519-private=")) {
                edPrivatePath = a.substring("--ed25519-private=".length());
            }
        }
        boolean usingDevSecret = DEV_SIGNING_SECRET.equals(secret);
        boolean explicitlySetNonDefault =
                (secretFromFlag || secretFromEnv) && !usingDevSecret;
        if (usingDevSecret && !explicitlySetNonDefault && !allowDevSecret) {
            System.err.println(
                    "Refusing to sign with the public dev secret. Pass --secret=... or set "
                            + "DATAWISE_PACK_SIGNING_SECRET to a non-default value, "
                            + "or pass --allow-dev-secret for local/CI only.");
            System.exit(1);
        }
        ObjectMapper mapper = new ObjectMapper();
        Path manifestPath = packDir.resolve("manifest.json");
        if (!Files.isRegularFile(manifestPath)) {
            throw new IllegalArgumentException("manifest.json required in " + packDir);
        }
        PackManifest manifest = mapper.readValue(manifestPath.toFile(), PackManifest.class);
        PackDpkCodec.validateManifest(manifest);

        Map<String, byte[]> extras = new LinkedHashMap<>();
        try (Stream<Path> walk = Files.walk(packDir)) {
            walk.filter(Files::isRegularFile).forEach(path -> {
                Path rel = packDir.relativize(path);
                String name = rel.toString().replace('\\', '/');
                if ("manifest.json".equals(name) || name.startsWith("signatures/")) {
                    return;
                }
                try {
                    extras.put(name, Files.readAllBytes(path));
                } catch (Exception ex) {
                    throw new IllegalStateException("Read failed: " + path, ex);
                }
            });
        }

        PrivateKey edPrivate = null;
        if (edPrivatePath != null && !edPrivatePath.isBlank()) {
            edPrivate = PackEd25519.loadPrivateKey(Path.of(edPrivatePath));
        }
        byte[] dpk = PackDpkCodec.build(manifest, extras, secret, mapper, seal, site, edPrivate);
        if (out.getParent() != null) {
            Files.createDirectories(out.getParent());
        }
        Files.write(out, dpk);
        System.out.println("Wrote " + out + " (" + dpk.length + " bytes) packId=" + manifest.packId()
                + " sealed=" + seal + " ed25519=" + (edPrivate != null));
    }

    private static void usage() {
        System.err.println("Usage:");
        System.err.println("  PackDpkCli keygen <private.pem> <public.pem>");
        System.err.println(
                "  PackDpkCli build <packDir> <out.dpk> [--seal] [--site=id] [--secret=...] "
                        + "[--ed25519-private=path] [--allow-dev-secret]");
    }
}
