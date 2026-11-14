package org.apache.datawise.backend.common.truncation;

/**
 * Char-based truncation helper paired with {@link TruncationMeta}.
 */
public final class TextTruncation {

    /** MCP propose preview SQL display cap (execution payload keeps full SQL). */
    public static final int MCP_PREVIEW_SQL_MAX_CHARS = 2000;

    private TextTruncation() {
    }

    public record TruncatedText(String text, TruncationMeta meta) {
    }

    public static TruncatedText truncateChars(String text, int limit, String reason) {
        if (text == null) {
            return new TruncatedText(null, TruncationMeta.of(false, 0L, limit, "chars", reason));
        }
        int len = text.length();
        if (limit <= 0) {
            return new TruncatedText(null, TruncationMeta.of(len > 0, (long) len, limit, "chars", reason));
        }
        if (len <= limit) {
            return new TruncatedText(text, TruncationMeta.of(false, (long) len, limit, "chars", reason));
        }
        return new TruncatedText(
                text.substring(0, limit),
                TruncationMeta.of(true, (long) len, limit, "chars", reason)
        );
    }

    /** Preview display: append ellipsis when truncated; meta.limit stays at {@code limit}. */
    public static TruncatedText truncateCharsForPreview(String text, int limit, String reason) {
        TruncatedText cut = truncateChars(text, limit, reason);
        if (cut.meta().truncated() && cut.text() != null) {
            return new TruncatedText(cut.text() + "…", cut.meta());
        }
        return cut;
    }
}
