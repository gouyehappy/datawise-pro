package org.apache.datawise.backend.ai.domain;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 一次 evidence 召回结果
 */
public record AiEvidenceBundle(
        String rewrittenQuery,
        List<AiEvidenceSnippet> snippets,
        List<String> hintedTables,
        List<String> retrievalModes
) {
    public static AiEvidenceBundle empty(String query) {
        return new AiEvidenceBundle(query, List.of(), List.of(), List.of("keyword"));
    }

    public List<String> relatedTableHints() {
        Set<String> tables = new LinkedHashSet<>();
        if (hintedTables != null) {
            tables.addAll(hintedTables);
        }
        return List.copyOf(tables);
    }

    public static Builder builder(String rewrittenQuery) {
        return new Builder(rewrittenQuery);
    }

    public static final class Builder {
        private final String rewrittenQuery;
        private final List<AiEvidenceSnippet> snippets = new ArrayList<>();
        private final Set<String> hintedTables = new LinkedHashSet<>();
        private final Set<String> retrievalModes = new LinkedHashSet<>();

        private Builder(String rewrittenQuery) {
            this.rewrittenQuery = rewrittenQuery;
        }

        public Builder addSnippet(AiEvidenceSnippet snippet) {
            if (snippet != null) {
                snippets.add(snippet);
            }
            return this;
        }

        public Builder addSnippets(List<AiEvidenceSnippet> items) {
            if (items != null) {
                snippets.addAll(items);
            }
            return this;
        }

        public Builder hintTable(String table) {
            if (table != null && !table.isBlank()) {
                hintedTables.add(table.trim());
            }
            return this;
        }

        public Builder mode(String mode) {
            if (mode != null && !mode.isBlank()) {
                retrievalModes.add(mode);
            }
            return this;
        }

        public AiEvidenceBundle build() {
            if (retrievalModes.isEmpty()) {
                retrievalModes.add("keyword");
            }
            return new AiEvidenceBundle(
                    rewrittenQuery,
                    List.copyOf(snippets),
                    List.copyOf(hintedTables),
                    List.copyOf(retrievalModes)
            );
        }
    }
}
