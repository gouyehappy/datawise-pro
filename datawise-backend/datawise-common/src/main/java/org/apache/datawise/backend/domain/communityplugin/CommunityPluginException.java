package org.apache.datawise.backend.domain.communityplugin;

/**
 * Domain error for community plugin install / runtime failures.
 */
public class CommunityPluginException extends RuntimeException {

    /** JSON-RPC error code carried from the sidecar, if any (e.g. -32601 method not found). */
    private final Integer rpcErrorCode;

    public CommunityPluginException(String message) {
        super(message);
        this.rpcErrorCode = null;
    }

    public CommunityPluginException(String message, Throwable cause) {
        super(message, cause);
        this.rpcErrorCode = null;
    }

    public CommunityPluginException(String message, Integer rpcErrorCode) {
        super(message);
        this.rpcErrorCode = rpcErrorCode;
    }

    public CommunityPluginException(String message, Integer rpcErrorCode, Throwable cause) {
        super(message, cause);
        this.rpcErrorCode = rpcErrorCode;
    }

    public Integer getRpcErrorCode() {
        return rpcErrorCode;
    }
}
