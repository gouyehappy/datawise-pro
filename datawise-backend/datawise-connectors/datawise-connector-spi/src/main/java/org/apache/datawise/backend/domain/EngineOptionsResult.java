package org.apache.datawise.backend.domain;

import java.util.List;

/** Storage-engine picklist for create-table / table options (MySQL-family live; others may be empty). */
public record EngineOptionsResult(
        boolean supported,
        List<EngineOption> engines) {

    public record EngineOption(
            String name,
            String support,
            String comment,
            boolean transactions,
            boolean xa,
            boolean savepoints) {
    }
}
