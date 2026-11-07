package org.apache.datawise.backend.service.ssh;

import org.apache.datawise.backend.model.SshCommandItem;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses SSH quick-command DSL into structured {@link SshCommandItem}s.
 * <p>
 * Keep in sync with frontend {@code ssh-my-commands.service.ts}:
 * <ul>
 *   <li>{@code @run}/{@code @paste} — sectional mode for following commands</li>
 *   <li>{@code ## ...} — ignored comment</li>
 *   <li>{@code # title [:: description] [!run|!paste]} — optional label / description / override</li>
 *   <li>other non-empty lines — command body</li>
 * </ul>
 */
final class SshCommandDslParser {

    private static final Pattern MODE_LINE = Pattern.compile("^@(run|paste)\\s*$", Pattern.CASE_INSENSITIVE);
    /** Single {@code #} only — {@code ##} comments are handled separately. */
    private static final Pattern LABEL_LINE = Pattern.compile(
            "^#(?!#)\\s*(.*?)(?:\\s*::\\s*(.*?))?(?:\\s+!(run|paste))?\\s*$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern CLOSING_BLOCK_TAG =
            Pattern.compile("</(?:p|div|pre|span|br|li|h[1-6]|ul|ol)\\s*>", Pattern.CASE_INSENSITIVE);

    private SshCommandDslParser() {
    }

    static List<SshCommandItem> parse(String text) {
        return parse(text, "paste");
    }

    static List<SshCommandItem> parse(String text, String defaultMode) {
        String currentMode = normalizeMode(defaultMode, "paste");
        List<SshCommandItem> entries = new ArrayList<>();
        String pendingTitle = null;
        String pendingDescription = null;
        String pendingEntryMode = null;

        String plain = toPlainDsl(text);
        if (plain.isBlank()) {
            return entries;
        }

        for (String rawLine : plain.split("\n", -1)) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                continue;
            }
            if (line.startsWith("##")) {
                continue;
            }

            Matcher modeMatch = MODE_LINE.matcher(line);
            if (modeMatch.matches()) {
                currentMode = normalizeMode(modeMatch.group(1), currentMode);
                continue;
            }

            Matcher labelMatch = LABEL_LINE.matcher(line);
            if (labelMatch.matches()) {
                pendingTitle = nullToEmpty(labelMatch.group(1)).trim();
                pendingDescription = nullToEmpty(labelMatch.group(2)).trim();
                String override = labelMatch.group(3);
                pendingEntryMode = override != null ? normalizeMode(override, null) : null;
                if (pendingTitle.isEmpty() && pendingDescription.isEmpty() && pendingEntryMode == null) {
                    pendingTitle = null;
                    pendingDescription = null;
                }
                continue;
            }

            String mode = pendingEntryMode != null ? pendingEntryMode : currentMode;
            entries.add(new SshCommandItem(
                    pendingTitle != null ? pendingTitle : "",
                    line,
                    mode,
                    pendingDescription != null ? pendingDescription : ""
            ));
            pendingTitle = null;
            pendingDescription = null;
            pendingEntryMode = null;
        }
        return entries;
    }

    static String serialize(List<SshCommandItem> commands) {
        if (commands == null || commands.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        String lastMode = null;
        for (SshCommandItem item : commands) {
            if (item == null || item.getCommand() == null || item.getCommand().isBlank()) {
                continue;
            }
            String mode = normalizeMode(item.getMode(), "paste");
            if (!mode.equals(lastMode)) {
                if (!out.isEmpty()) {
                    out.append('\n');
                }
                out.append('@').append(mode).append('\n');
                lastMode = mode;
            } else if (!out.isEmpty()) {
                out.append('\n');
            }
            String title = item.getTitle() != null ? item.getTitle().trim() : "";
            String description = item.getDescription() != null ? item.getDescription().trim() : "";
            if (!title.isEmpty() || !description.isEmpty()) {
                out.append('#');
                if (!title.isEmpty()) {
                    out.append(' ').append(title);
                }
                if (!description.isEmpty()) {
                    out.append(" :: ").append(description);
                }
                out.append('\n');
            }
            out.append(item.getCommand().trim()).append('\n');
        }
        return out.toString();
    }

    /** Executable payload for terminal paste/run — command lines only. */
    static String toExecutableText(List<SshCommandItem> commands) {
        if (commands == null || commands.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        for (SshCommandItem item : commands) {
            if (item == null || item.getCommand() == null) {
                continue;
            }
            String command = item.getCommand().trim();
            if (command.isEmpty()) {
                continue;
            }
            out.append(command).append('\n');
        }
        return out.toString();
    }

    static boolean hasCommands(List<SshCommandItem> commands) {
        if (commands == null || commands.isEmpty()) {
            return false;
        }
        for (SshCommandItem item : commands) {
            if (item != null && item.getCommand() != null && !item.getCommand().isBlank()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Normalize stored payload (plain DSL or legacy HTML) to editable command text.
     * Mirrors frontend {@code toPlainCommandText}.
     */
    static String toPlainDsl(String stored) {
        if (stored == null || stored.isBlank()) {
            return "";
        }
        String normalized = stored.replace("\r\n", "\n");
        if (!looksLikeStoredHtml(normalized)) {
            return normalized;
        }
        String withBreaks = normalized
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(?:p|div|pre|li|h[1-6]|tr)>", "\n")
                .replaceAll("(?i)</(?:td|th)>", "\t")
                .replaceAll("(?i)<[^>]+>", "");
        return withBreaks
                .replace('\u00a0', ' ')
                .replaceAll("\n{3,}", "\n\n")
                .trim();
    }

    static boolean looksLikeStoredHtml(String value) {
        if (value == null) {
            return false;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return false;
        }
        if (trimmed.length() > 1 && trimmed.charAt(0) == '<') {
            char second = trimmed.charAt(1);
            if (Character.isLetter(second) || second == '!' || second == '/' || second == '?') {
                return true;
            }
        }
        return CLOSING_BLOCK_TAG.matcher(trimmed).find();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String normalizeMode(String mode, String fallback) {
        if (mode == null || mode.isBlank()) {
            return fallback;
        }
        String normalized = mode.trim().toLowerCase(Locale.ROOT);
        if ("run".equals(normalized) || "paste".equals(normalized)) {
            return normalized;
        }
        return fallback != null ? fallback : "paste";
    }
}
