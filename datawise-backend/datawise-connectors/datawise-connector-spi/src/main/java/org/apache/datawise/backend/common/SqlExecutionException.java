package org.apache.datawise.backend.common;

/**
 * SQL 执行失败，携带可选的错误行号（相对已 trim 的 SQL 文本，1-based）
 */
public class SqlExecutionException extends RuntimeException {

    private final Integer errorLine;

    public SqlExecutionException(String message, Throwable cause, Integer errorLine) {
        super(message, cause);
        this.errorLine = errorLine;
    }

    public Integer getErrorLine() {
        return errorLine;
    }
}
