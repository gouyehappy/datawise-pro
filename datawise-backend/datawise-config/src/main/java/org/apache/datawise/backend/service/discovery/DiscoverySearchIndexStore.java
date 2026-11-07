package org.apache.datawise.backend.service.discovery;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory discovery index keyed like {@link org.apache.datawise.backend.configstore.SchemaCacheStore}
 * ({@code sessionId:connectionId}). Rebuilt on schema cache save; cleared on cache clear.
 */
@Service
public class DiscoverySearchIndexStore {

    private final ConcurrentHashMap<String, ConnectionIndex> indexes = new ConcurrentHashMap<>();

    public void rebuild(String connectionId, ConnectionEntity connection, List<TreeNode> roots) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        String key = cacheKey(connectionId);
        if (roots == null || roots.isEmpty() || connection == null) {
            indexes.remove(key);
            return;
        }
        List<DiscoveryIndexedRelation> relations = DiscoverySchemaIndexBuilder.build(connection, roots);
        indexes.put(key, ConnectionIndex.from(relations));
    }

    public void rebuild(String connectionId, List<DiscoveryIndexedRelation> relations) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        String key = cacheKey(connectionId);
        if (relations == null || relations.isEmpty()) {
            indexes.remove(key);
            return;
        }
        indexes.put(key, ConnectionIndex.from(relations));
    }

    public void clear(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        indexes.remove(cacheKey(connectionId));
    }

    public void clearSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        String prefix = sessionId.trim() + ":";
        indexes.keySet().removeIf(key -> key.startsWith(prefix));
    }

    public Optional<ConnectionIndex> find(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(indexes.get(cacheKey(connectionId)));
    }

    static String cacheKey(String connectionId) {
        String sessionId = UserContext.getSessionId();
        String scope = sessionId != null && !sessionId.isBlank() ? sessionId.trim() : "anonymous";
        return scope + ":" + connectionId;
    }

    public record ConnectionIndex(
            List<DiscoveryIndexedRelation> relations,
            Map<String, Set<Integer>> wordToRelationIndexes) {

        static ConnectionIndex from(List<DiscoveryIndexedRelation> relations) {
            List<DiscoveryIndexedRelation> copy = List.copyOf(relations);
            Map<String, Set<Integer>> inverted = new HashMap<>();
            for (int i = 0; i < copy.size(); i++) {
                DiscoveryIndexedRelation relation = copy.get(i);
                for (String word : DiscoverySchemaIndexBuilder.extractWords(relation.searchText())) {
                    inverted.computeIfAbsent(word, ignored -> new HashSet<>()).add(i);
                }
            }
            Map<String, Set<Integer>> frozen = new HashMap<>();
            for (Map.Entry<String, Set<Integer>> entry : inverted.entrySet()) {
                frozen.put(entry.getKey(), Set.copyOf(entry.getValue()));
            }
            return new ConnectionIndex(copy, Map.copyOf(frozen));
        }

        /**
         * Candidate relation indexes for query tokens (AND). Empty tokens → all indexes.
         * Uses inverted words with equals / prefix / contains; falls back to full scan when needed.
         */
        public List<DiscoveryIndexedRelation> candidates(List<String> tokens) {
            if (relations.isEmpty()) {
                return List.of();
            }
            if (tokens == null || tokens.isEmpty()) {
                return relations;
            }
            Set<Integer> matched = null;
            for (String token : tokens) {
                Set<Integer> forToken = lookupToken(token);
                if (forToken.isEmpty()) {
                    return List.of();
                }
                if (matched == null) {
                    matched = new LinkedHashSet<>(forToken);
                } else {
                    matched.retainAll(forToken);
                }
                if (matched.isEmpty()) {
                    return List.of();
                }
            }
            if (matched == null || matched.isEmpty()) {
                return List.of();
            }
            List<DiscoveryIndexedRelation> out = new ArrayList<>(matched.size());
            for (Integer index : matched) {
                out.add(relations.get(index));
            }
            return out;
        }

        private Set<Integer> lookupToken(String token) {
            if (token == null || token.isBlank()) {
                return Set.of();
            }
            String normalized = token.toLowerCase(Locale.ROOT);
            Set<Integer> exact = wordToRelationIndexes.get(normalized);
            if (exact != null && !exact.isEmpty()) {
                // Still merge prefix/contains hits for scoring completeness is unnecessary —
                // exact word match already covers contains for whole words. Also add prefix/contains.
            }
            Set<Integer> out = new LinkedHashSet<>();
            if (exact != null) {
                out.addAll(exact);
            }
            for (Map.Entry<String, Set<Integer>> entry : wordToRelationIndexes.entrySet()) {
                String word = entry.getKey();
                if (word.equals(normalized)) {
                    continue;
                }
                if (word.startsWith(normalized) || word.contains(normalized)) {
                    out.addAll(entry.getValue());
                }
            }
            if (!out.isEmpty()) {
                return out;
            }
            // Fallback: substring match against full searchText (comments / mixed tokens)
            for (int i = 0; i < relations.size(); i++) {
                if (relations.get(i).searchText().contains(normalized)) {
                    out.add(i);
                }
            }
            return out.isEmpty() ? Set.of() : out;
        }
    }
}
