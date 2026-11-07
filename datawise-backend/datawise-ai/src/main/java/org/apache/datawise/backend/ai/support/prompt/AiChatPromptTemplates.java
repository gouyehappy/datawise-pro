package org.apache.datawise.backend.ai.support.prompt;

import java.util.ArrayList;
import java.util.List;

public final class AiChatPromptTemplates {

    private AiChatPromptTemplates() {
    }

    public static String renderSystemPrompt(String scopeHint) {
        List<String> lines = new ArrayList<>(List.of(
                "You are a database assistant for DataWise.",
                "Answer in the same language as the user when possible.",
                "When generating SQL, prefer safe read-only queries unless the user asks otherwise."
        ));
        if (scopeHint != null && !scopeHint.isBlank()) {
            lines.add(scopeHint);
        }
        return String.join("\n", lines);
    }
}
