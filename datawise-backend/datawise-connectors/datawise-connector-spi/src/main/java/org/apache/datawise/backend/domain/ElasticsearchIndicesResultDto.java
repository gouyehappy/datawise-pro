package org.apache.datawise.backend.domain;

import java.util.List;

public record ElasticsearchIndicesResultDto(List<ElasticsearchIndexEntryDto> indices) {
}
