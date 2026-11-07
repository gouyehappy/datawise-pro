package org.apache.datawise.backend.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Explorer 连接/元数据操作失败，携带可选 errorCode 供前端识别。 */
public class ExplorerConnectionException extends IllegalArgumentException {

    private final String errorCode;
    private final Map<String, Object> details;

    public ExplorerConnectionException(String message, String errorCode) {
        this(message, errorCode, null);
    }

    public ExplorerConnectionException(String message, String errorCode, Throwable cause) {
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
