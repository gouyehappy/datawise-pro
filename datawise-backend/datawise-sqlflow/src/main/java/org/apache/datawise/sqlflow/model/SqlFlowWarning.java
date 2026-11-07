package org.apache.datawise.sqlflow.model;

public record SqlFlowWarning(String code, String message) {

    public SqlFlowWarning {
        code = code == null || code.isBlank() ? "WARNING" : code.trim();
        message = message == null ? "" : message.trim();
    }

    public static SqlFlowWarning of(String code, String message) {
        return new SqlFlowWarning(code, message);
    }
}
