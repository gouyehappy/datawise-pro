package org.apache.datawise.backend.database.explorer;

/** Unified result for explorer child loads with HTTP caching semantics. */
public record ExplorerChildLoadOutcome(
        ExplorerTreeLoadResult result,
        boolean notModified,
        boolean shortCircuited
) {

    public String etag() {
        return result != null ? result.etag() : null;
    }
}
