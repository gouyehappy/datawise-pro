package org.apache.datawise.backend.ai.rag.embedding;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/**
 * 确定性 hash embedding（384 维），无需外部 embedding API。
 * 开发/离线默认实现；生产可配置 {@code datawise.ai.rag.embedding.provider=openai}。
 */
public class HashAiEmbeddingService implements AiEmbeddingService {

    private static final int DIMENSIONS = 384;

    @Override
    public String provider() {
        return "hash";
    }

    @Override
    public int dimensions() {
        return DIMENSIONS;
    }

    @Override
    public float[] embed(String text) {
        float[] vector = new float[DIMENSIONS];
        if (text == null || text.isBlank()) {
            return vector;
        }
        String normalized = text.trim().toLowerCase(Locale.ROOT);
        for (String token : normalized.split("\\s+")) {
            if (token.isBlank()) {
                continue;
            }
            int bucket = Math.floorMod(token.hashCode(), DIMENSIONS);
            vector[bucket] += 1F;
            vector[Math.floorMod(digestBucket(token, 1), DIMENSIONS)] += 0.5F;
            vector[Math.floorMod(digestBucket(token, 2), DIMENSIONS)] += 0.25F;
        }
        normalize(vector);
        return vector;
    }

    private static int digestBucket(String token, int salt) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update((token + "#" + salt).getBytes(StandardCharsets.UTF_8));
            byte[] hash = digest.digest();
            return ((hash[0] & 0xff) << 24) | ((hash[1] & 0xff) << 16) | ((hash[2] & 0xff) << 8) | (hash[3] & 0xff);
        } catch (NoSuchAlgorithmException ex) {
            return token.hashCode() ^ salt;
        }
    }

    private static void normalize(float[] vector) {
        double sum = 0D;
        for (float value : vector) {
            sum += value * value;
        }
        if (sum <= 0D) {
            return;
        }
        float norm = (float) Math.sqrt(sum);
        for (int i = 0; i < vector.length; i++) {
            vector[i] /= norm;
        }
    }
}
