package org.apache.datawise.backend.ai.rag;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 轻量查询重写：提取检索用词（Phase 2 不用 LLM）
 */
@Component
public class AiQueryRewriter {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-z0-9_\\p{IsHan}]{2,}");

    public String rewrite(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return "";
        }
        return prompt.trim().replaceAll("\\s+", " ");
    }

    public List<String> tokens(String prompt) {
        String normalized = rewrite(prompt).toLowerCase(Locale.ROOT);
        Matcher matcher = TOKEN_PATTERN.matcher(normalized);
        return matcher.results().map(match -> match.group()).distinct().toList();
    }
}
