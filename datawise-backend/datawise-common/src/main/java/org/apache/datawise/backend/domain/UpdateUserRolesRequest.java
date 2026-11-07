package org.apache.datawise.backend.domain;

import java.util.List;

public record UpdateUserRolesRequest(List<String> roleIds) {
}
