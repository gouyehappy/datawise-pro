package org.apache.datawise.backend.common;

/** No valid session or API token for the current request. */
public class UnauthorizedException extends RuntimeException {

    public static final String CODE = "UNAUTHORIZED";

    public UnauthorizedException() {
        super(CODE);
    }
}
