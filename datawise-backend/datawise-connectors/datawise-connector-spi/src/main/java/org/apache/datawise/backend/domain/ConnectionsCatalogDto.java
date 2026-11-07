package org.apache.datawise.backend.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ConnectionsCatalogDto(
        int version,
        List<ConnectionGroupDto> groups,
        List<ConnectionEntryDto> connections) {

    public static ConnectionsCatalogDto empty() {
        return new ConnectionsCatalogDto(1, List.of(), List.of());
    }
}
