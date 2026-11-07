package org.apache.datawise.sqlparser.exceptions;

/**
 * Signals cooperative termination of visitor traversal. Caught and converted to
 * {@code shouldStopVisitor} by {@link org.apache.datawise.sqlparser.VisitorContext}.
 */
public final class StopVisitException extends RuntimeException {

    public StopVisitException() {
    }

    public StopVisitException(String message) {
        super(message);
    }
}
