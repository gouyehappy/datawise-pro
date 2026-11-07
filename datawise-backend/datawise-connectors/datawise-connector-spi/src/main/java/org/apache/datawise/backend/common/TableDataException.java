package org.apache.datawise.backend.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** 表数据浏览与行级 DML 失败，与 SQL 控制台 {@link SqlExecutionException} 语义区分。 */
public class TableDataException extends IllegalArgumentException {

    public static final String FETCH_FAILED = "TABLE_DATA_FETCH_FAILED";
    public static final String MUTATION_FAILED = "TABLE_DATA_MUTATION_FAILED";

    private final String errorCode;
    private final Map<String, Object> details;

    public TableDataException(String message, String errorCode) {
        this(message, errorCode, null);
    }

    public TableDataException(String message, String errorCode, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.details = Collections.emptyMap();
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Map<String, Object> details() {
        return details;
    }

    public Map<String, Object> toResponseData() {
        Map<String, Object> data = new LinkedHashMap<>();
        if (errorCode != null && !errorCode.isBlank()) {
            data.put("errorCode", errorCode);
        }
        data.putAll(details);
        return data.isEmpty() ? null : data;
    }
}
