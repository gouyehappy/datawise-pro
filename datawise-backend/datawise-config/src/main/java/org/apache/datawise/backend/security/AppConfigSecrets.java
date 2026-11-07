package org.apache.datawise.backend.security;

import org.apache.datawise.backend.configstore.app.AppConfigSections;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * app.xml 中 AI LLM apiKey 字段加解密
 */
public final class AppConfigSecrets {

    private static final String AI_SECTION = "ai";
    private static final String LLM_PROFILES = "llmProfiles";
    private static final String EMBEDDING_PROFILES = "embeddingProfiles";
    private static final String EMBEDDING = "embedding";
    private static final String LEGACY_LLM = "llm";
    private static final String API_KEY = "apiKey";
    /** Client-only hint: a non-blank key is stored server-side (GET never returns plaintext). */
    private static final String API_KEY_CONFIGURED = "apiKeyConfigured";
    private static final String RAG_SECTION = "rag";
    private static final String PGVECTOR = "pgvector";
    private static final String PASSWORD = "password";

    private AppConfigSecrets() {
    }

    /**
     * Deep-copies config and blanks secret fields so GET responses never expose plaintext keys/passwords.
     * Clients should leave blank values unchanged on PUT to preserve stored secrets —
     * {@link #preserveBlankSecrets} enforces that on write.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> maskForClient(Map<String, Object> config) {
        if (config == null) {
            return null;
        }
        Map<String, Object> copy = AppConfigSections.deepCopy(config);
        Object aiRaw = copy.get(AI_SECTION);
        if (!(aiRaw instanceof Map<?, ?>)) {
            return copy;
        }
        Map<String, Object> ai = (Map<String, Object>) aiRaw;
        blankProfiles((List<Map<String, Object>>) ai.get(LLM_PROFILES));
        blankProfiles((List<Map<String, Object>>) ai.get(EMBEDDING_PROFILES));
        Object embedding = ai.get(EMBEDDING);
        if (embedding instanceof Map<?, ?> embeddingMap) {
            blankApiKey((Map<String, Object>) embeddingMap);
        }
        Object legacy = ai.get(LEGACY_LLM);
        if (legacy instanceof Map<?, ?> legacyMap) {
            blankApiKey((Map<String, Object>) legacyMap);
        }
        blankRagPgPassword((Map<String, Object>) ai.get(RAG_SECTION));
        return copy;
    }

    /**
     * When the client sends a blank secret (typical after {@link #maskForClient}), keep the previously
     * stored value so a save-without-retyping does not wipe API keys / passwords.
     */
    @SuppressWarnings("unchecked")
    public static void preserveBlankSecrets(Map<String, Object> incoming, Map<String, Object> existing) {
        if (incoming == null || existing == null) {
            return;
        }
        Object inAiRaw = incoming.get(AI_SECTION);
        Object exAiRaw = existing.get(AI_SECTION);
        if (!(inAiRaw instanceof Map<?, ?>) || !(exAiRaw instanceof Map<?, ?>)) {
            return;
        }
        Map<String, Object> inAi = (Map<String, Object>) inAiRaw;
        Map<String, Object> exAi = (Map<String, Object>) exAiRaw;
        preserveProfiles(
                (List<Map<String, Object>>) inAi.get(LLM_PROFILES),
                (List<Map<String, Object>>) exAi.get(LLM_PROFILES));
        preserveProfiles(
                (List<Map<String, Object>>) inAi.get(EMBEDDING_PROFILES),
                (List<Map<String, Object>>) exAi.get(EMBEDDING_PROFILES));
        preserveMapSecret(inAi, exAi, EMBEDDING, API_KEY);
        preserveMapSecret(inAi, exAi, LEGACY_LLM, API_KEY);
        preserveRagPgPassword(inAi, exAi);
    }

    private static void preserveProfiles(List<Map<String, Object>> incoming, List<Map<String, Object>> existing) {
        if (incoming == null || existing == null) {
            return;
        }
        for (Map<String, Object> inProfile : incoming) {
            if (inProfile == null) {
                continue;
            }
            Object id = inProfile.get("id");
            Map<String, Object> match = null;
            if (id instanceof String idStr && !idStr.isBlank()) {
                for (Map<String, Object> exProfile : existing) {
                    if (exProfile != null && idStr.equals(exProfile.get("id"))) {
                        match = exProfile;
                        break;
                    }
                }
            }
            if (match != null) {
                preserveSecretField(inProfile, match, API_KEY);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static void preserveMapSecret(
            Map<String, Object> inAi,
            Map<String, Object> exAi,
            String section,
            String field) {
        Object inRaw = inAi.get(section);
        Object exRaw = exAi.get(section);
        if (inRaw instanceof Map<?, ?> inMap && exRaw instanceof Map<?, ?> exMap) {
            preserveSecretField((Map<String, Object>) inMap, (Map<String, Object>) exMap, field);
        }
    }

    @SuppressWarnings("unchecked")
    private static void preserveRagPgPassword(Map<String, Object> inAi, Map<String, Object> exAi) {
        Object inRag = inAi.get(RAG_SECTION);
        Object exRag = exAi.get(RAG_SECTION);
        if (!(inRag instanceof Map<?, ?>) || !(exRag instanceof Map<?, ?>)) {
            return;
        }
        preserveMapSecret((Map<String, Object>) inRag, (Map<String, Object>) exRag, PGVECTOR, PASSWORD);
    }

    private static void preserveSecretField(Map<String, Object> incoming, Map<String, Object> existing, String field) {
        if (incoming == null || existing == null) {
            return;
        }
        Object inVal = incoming.get(field);
        Object exVal = existing.get(field);
        boolean blankIncoming = inVal == null || (inVal instanceof String s && s.isBlank());
        boolean hasExisting = exVal instanceof String es && !es.isBlank();
        if (blankIncoming && hasExisting) {
            incoming.put(field, exVal);
        }
    }

    private static void blankProfiles(List<Map<String, Object>> profiles) {
        if (profiles == null) {
            return;
        }
        for (Map<String, Object> profile : profiles) {
            blankApiKey(profile);
        }
    }

    private static void blankApiKey(Map<String, Object> profile) {
        if (profile == null) {
            return;
        }
        Object raw = profile.get(API_KEY);
        boolean configured = raw instanceof String key && !key.isBlank();
        if (profile.containsKey(API_KEY)) {
            profile.put(API_KEY, "");
        }
        if (configured) {
            profile.put(API_KEY_CONFIGURED, true);
        } else {
            profile.remove(API_KEY_CONFIGURED);
        }
    }

    @SuppressWarnings("unchecked")
    private static void blankRagPgPassword(Map<String, Object> rag) {
        if (rag == null) {
            return;
        }
        Object pgRaw = rag.get(PGVECTOR);
        if (pgRaw instanceof Map<?, ?> pgMap) {
            Map<String, Object> pg = (Map<String, Object>) pgMap;
            if (pg.containsKey(PASSWORD)) {
                pg.put(PASSWORD, "");
            }
        }
    }

    @SuppressWarnings("unchecked")
    public static void decryptAiSection(Map<String, Object> config, SecretValueCodec codec) {
        if (config == null) {
            return;
        }
        Object aiRaw = config.get(AI_SECTION);
        if (!(aiRaw instanceof Map<?, ?>)) {
            return;
        }
        decryptAiPreferences((Map<String, Object>) aiRaw, codec);
    }

    public static void encryptAiSection(Map<String, Object> config, SecretValueCodec codec) {
        if (config == null) {
            return;
        }
        Object aiRaw = config.get(AI_SECTION);
        if (!(aiRaw instanceof Map<?, ?>)) {
            return;
        }
        encryptAiPreferences((Map<String, Object>) aiRaw, codec);
    }

    /** Encrypt secrets in a bare AI preferences map (standalone file). */
    @SuppressWarnings("unchecked")
    public static void encryptAiPreferences(Map<String, Object> ai, SecretValueCodec codec) {
        if (ai == null) {
            return;
        }
        stripClientOnlyHints(ai);
        encryptProfiles((List<Map<String, Object>>) ai.get(LLM_PROFILES), codec);
        encryptProfiles((List<Map<String, Object>>) ai.get(EMBEDDING_PROFILES), codec);
        Object embedding = ai.get(EMBEDDING);
        if (embedding instanceof Map<?, ?> embeddingMap) {
            encryptApiKey((Map<String, Object>) embeddingMap, codec);
        }
        Object legacy = ai.get(LEGACY_LLM);
        if (legacy instanceof Map<?, ?> legacyMap) {
            encryptApiKey((Map<String, Object>) legacyMap, codec);
        }
        encryptRagPgPassword((Map<String, Object>) ai.get(RAG_SECTION), codec);
    }

    @SuppressWarnings("unchecked")
    private static void stripClientOnlyHints(Map<String, Object> ai) {
        stripConfiguredFlag((List<Map<String, Object>>) ai.get(LLM_PROFILES));
        stripConfiguredFlag((List<Map<String, Object>>) ai.get(EMBEDDING_PROFILES));
        Object embedding = ai.get(EMBEDDING);
        if (embedding instanceof Map<?, ?> embeddingMap) {
            ((Map<String, Object>) embeddingMap).remove(API_KEY_CONFIGURED);
        }
        Object legacy = ai.get(LEGACY_LLM);
        if (legacy instanceof Map<?, ?> legacyMap) {
            ((Map<String, Object>) legacyMap).remove(API_KEY_CONFIGURED);
        }
    }

    private static void stripConfiguredFlag(List<Map<String, Object>> profiles) {
        if (profiles == null) {
            return;
        }
        for (Map<String, Object> profile : profiles) {
            if (profile != null) {
                profile.remove(API_KEY_CONFIGURED);
            }
        }
    }

    /** Decrypt secrets in a bare AI preferences map. */
    @SuppressWarnings("unchecked")
    public static void decryptAiPreferences(Map<String, Object> ai, SecretValueCodec codec) {
        if (ai == null) {
            return;
        }
        decryptProfiles((List<Map<String, Object>>) ai.get(LLM_PROFILES), codec);
        decryptProfiles((List<Map<String, Object>>) ai.get(EMBEDDING_PROFILES), codec);
        Object embedding = ai.get(EMBEDDING);
        if (embedding instanceof Map<?, ?> embeddingMap) {
            decryptApiKey((Map<String, Object>) embeddingMap, codec);
        }
        Object legacy = ai.get(LEGACY_LLM);
        if (legacy instanceof Map<?, ?> legacyMap) {
            decryptApiKey((Map<String, Object>) legacyMap, codec);
        }
        decryptRagPgPassword((Map<String, Object>) ai.get(RAG_SECTION), codec);
    }

    /** Mask API keys in a bare AI preferences map for client responses. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> maskAiPreferencesForClient(Map<String, Object> ai) {
        if (ai == null || ai.isEmpty()) {
            return ai == null ? Map.of() : ai;
        }
        Map<String, Object> wrap = new LinkedHashMap<>();
        wrap.put(AI_SECTION, deepCopyMap(ai));
        Map<String, Object> masked = maskForClient(wrap);
        Object out = masked.get(AI_SECTION);
        return out instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    /** Preserve stored secrets when client sends masked placeholders. */
    @SuppressWarnings("unchecked")
    public static void preserveAiPreferencesSecrets(
            Map<String, Object> incomingAi,
            Map<String, Object> existingAi
    ) {
        if (incomingAi == null || existingAi == null || existingAi.isEmpty()) {
            return;
        }
        Map<String, Object> incomingWrap = new LinkedHashMap<>();
        incomingWrap.put(AI_SECTION, incomingAi);
        Map<String, Object> existingWrap = new LinkedHashMap<>();
        existingWrap.put(AI_SECTION, existingAi);
        preserveBlankSecrets(incomingWrap, existingWrap);
    }

    private static Map<String, Object> deepCopyMap(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : source.entrySet()) {
            Object v = e.getValue();
            if (v instanceof Map<?, ?> nested) {
                Map<String, Object> nestedCopy = new LinkedHashMap<>();
                for (Map.Entry<?, ?> ne : nested.entrySet()) {
                    if (ne.getKey() instanceof String nk) {
                        nestedCopy.put(nk, ne.getValue());
                    }
                }
                copy.put(e.getKey(), nestedCopy);
            } else if (v instanceof List<?> list) {
                List<Object> listCopy = new ArrayList<>(list.size());
                for (Object item : list) {
                    if (item instanceof Map<?, ?> im) {
                        Map<String, Object> itemCopy = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> ie : im.entrySet()) {
                            if (ie.getKey() instanceof String ik) {
                                itemCopy.put(ik, ie.getValue());
                            }
                        }
                        listCopy.add(itemCopy);
                    } else {
                        listCopy.add(item);
                    }
                }
                copy.put(e.getKey(), listCopy);
            } else {
                copy.put(e.getKey(), v);
            }
        }
        return copy;
    }

    private static void decryptProfiles(List<Map<String, Object>> profiles, SecretValueCodec codec) {
        if (profiles == null) {
            return;
        }
        for (Map<String, Object> profile : profiles) {
            decryptApiKey(profile, codec);
        }
    }

    private static void encryptProfiles(List<Map<String, Object>> profiles, SecretValueCodec codec) {
        if (profiles == null) {
            return;
        }
        for (Map<String, Object> profile : profiles) {
            encryptApiKey(profile, codec);
        }
    }

    private static void decryptApiKey(Map<String, Object> profile, SecretValueCodec codec) {
        if (profile == null || !(profile.get(API_KEY) instanceof String apiKey)) {
            return;
        }
        profile.put(API_KEY, codec.decryptForUse(apiKey));
    }

    private static void encryptApiKey(Map<String, Object> profile, SecretValueCodec codec) {
        if (profile == null || !(profile.get(API_KEY) instanceof String apiKey)) {
            return;
        }
        profile.put(API_KEY, codec.encryptForStorage(apiKey));
    }

    /**
     * 统计仍为明文的 apiKey 数量（非空且未加密）
     */
    @SuppressWarnings("unchecked")
    public static int countPlaintextApiKeys(Map<String, Object> config, SecretValueCodec codec) {
        if (config == null) {
            return 0;
        }
        Object aiRaw = config.get(AI_SECTION);
        if (!(aiRaw instanceof Map<?, ?> ai)) {
            return 0;
        }
        int count = countPlaintextInProfiles((List<Map<String, Object>>) ai.get(LLM_PROFILES), codec);
        count += countPlaintextInProfiles((List<Map<String, Object>>) ai.get(EMBEDDING_PROFILES), codec);
        Object embedding = ai.get(EMBEDDING);
        if (embedding instanceof Map<?, ?> embeddingMap) {
            count += isPlaintextApiKey((Map<String, Object>) embeddingMap, codec) ? 1 : 0;
        }
        Object legacy = ai.get(LEGACY_LLM);
        if (legacy instanceof Map<?, ?> legacyMap) {
            count += isPlaintextApiKey((Map<String, Object>) legacyMap, codec) ? 1 : 0;
        }
        count += countPlaintextRagPgPassword((Map<String, Object>) ai.get(RAG_SECTION), codec);
        return count;
    }

    @SuppressWarnings("unchecked")
    private static void decryptRagPgPassword(Map<String, Object> rag, SecretValueCodec codec) {
        if (rag == null) {
            return;
        }
        Object pgRaw = rag.get(PGVECTOR);
        if (pgRaw instanceof Map<?, ?> pgMap) {
            decryptPassword((Map<String, Object>) pgMap, codec);
        }
    }

    @SuppressWarnings("unchecked")
    private static void encryptRagPgPassword(Map<String, Object> rag, SecretValueCodec codec) {
        if (rag == null) {
            return;
        }
        Object pgRaw = rag.get(PGVECTOR);
        if (pgRaw instanceof Map<?, ?> pgMap) {
            encryptPassword((Map<String, Object>) pgMap, codec);
        }
    }

    private static int countPlaintextRagPgPassword(Map<String, Object> rag, SecretValueCodec codec) {
        if (rag == null) {
            return 0;
        }
        Object pgRaw = rag.get(PGVECTOR);
        if (pgRaw instanceof Map<?, ?> pgMap) {
            return isPlaintextPassword((Map<String, Object>) pgMap, codec) ? 1 : 0;
        }
        return 0;
    }

    private static void decryptPassword(Map<String, Object> profile, SecretValueCodec codec) {
        if (profile == null || !(profile.get(PASSWORD) instanceof String password)) {
            return;
        }
        profile.put(PASSWORD, codec.decryptForUse(password));
    }

    private static void encryptPassword(Map<String, Object> profile, SecretValueCodec codec) {
        if (profile == null || !(profile.get(PASSWORD) instanceof String password)) {
            return;
        }
        profile.put(PASSWORD, codec.encryptForStorage(password));
    }

    private static boolean isPlaintextPassword(Map<String, Object> profile, SecretValueCodec codec) {
        if (profile == null || !(profile.get(PASSWORD) instanceof String password)) {
            return false;
        }
        return !password.isBlank() && !codec.isEncrypted(password);
    }

    private static int countPlaintextInProfiles(List<Map<String, Object>> profiles, SecretValueCodec codec) {
        if (profiles == null) {
            return 0;
        }
        int count = 0;
        for (Map<String, Object> profile : profiles) {
            if (isPlaintextApiKey(profile, codec)) {
                count += 1;
            }
        }
        return count;
    }

    private static boolean isPlaintextApiKey(Map<String, Object> profile, SecretValueCodec codec) {
        if (profile == null || !(profile.get(API_KEY) instanceof String apiKey)) {
            return false;
        }
        return !apiKey.isBlank() && !codec.isEncrypted(apiKey);
    }
}
