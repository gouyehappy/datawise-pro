package org.apache.datawise.backend.domain;

import java.util.List;

/** Dialect data-type picklist for column editors / create-table UI. */
public record DataTypeOptionsResult(
        boolean supported,
        List<DataTypeOption> dataTypes) {

    public record DataTypeOption(String name, String category, String description) {
    }
}
