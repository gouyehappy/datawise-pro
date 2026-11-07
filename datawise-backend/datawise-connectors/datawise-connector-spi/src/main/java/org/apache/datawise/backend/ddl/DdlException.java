package org.apache.datawise.backend.ddl;

/** DDL 操作失败，携带标准 errorCode。 */
public class DdlException extends IllegalArgumentException {

    private final DdlErrorCode errorCode;

    public DdlException(DdlErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public DdlException(DdlErrorCode errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public DdlErrorCode errorCode() {
        return errorCode;
    }
}
