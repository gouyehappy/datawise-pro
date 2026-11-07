package org.apache.datawise.backend.domain;

import java.util.List;

public record ElasticsearchIndexEntryDto(String name, List<String> aliases) {
}
