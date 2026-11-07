package org.apache.datawise.backend.ai;

/**
 * AI 域可预期失败，携带稳定 error code 供 SSE / API 映射。
 */
public class AiException extends RuntimeException {

    private final String code;

    public AiException(String code, String message) {
        super(message);
        this.code = code;
    }

    public AiException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
