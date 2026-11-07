package org.apache.datawise.backend.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** 数据库运维/元数据类 Service 的 JDBC 失败，携带稳定 errorCode 供前端识别。 */
public class DatabaseServiceException extends IllegalArgumentException {

    private final String errorCode;
    private final Map<String, Object> details;

    public DatabaseServiceException(String message, String errorCode) {
        this(message, errorCode, null);
    }

    public DatabaseServiceException(String message, String errorCode, Throwable cause) {
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
