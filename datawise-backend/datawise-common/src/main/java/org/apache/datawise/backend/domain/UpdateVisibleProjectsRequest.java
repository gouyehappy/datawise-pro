package org.apache.datawise.backend.domain;

import java.util.List;

public record UpdateVisibleProjectsRequest(List<String> projectIds) {
}
