package org.apache.datawise.backend.ai.analysis.stream;

/**
 * Raised when an SSE consumer has gone away (timeout, disconnect, or explicit cancel) and the
 * worker noticed at a step boundary. It is expected control flow, not a failure: the stream is
 * already closed, so callers must not try to report an error on it.
 */
public class AiStreamCancelledException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AiStreamCancelledException(String message) {
        super(message);
    }
}
