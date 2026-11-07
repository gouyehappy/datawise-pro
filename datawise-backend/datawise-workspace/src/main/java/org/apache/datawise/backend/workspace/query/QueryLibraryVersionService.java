package org.apache.datawise.backend.workspace.query;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.UserQueryLibraryVersionStore;
import org.apache.datawise.backend.domain.QueryLibraryVersionDto;
import org.apache.datawise.backend.domain.SaveQueryLibraryVersionRequest;
import org.apache.datawise.backend.model.QueryLibraryVersionEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class QueryLibraryVersionService {

    private final UserQueryLibraryVersionStore versionStore;
    private final UserResourcePolicy resourcePolicy;

    public QueryLibraryVersionService(
            UserQueryLibraryVersionStore versionStore,
            UserResourcePolicy resourcePolicy
    ) {
        this.versionStore = versionStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<QueryLibraryVersionDto> listVersions(String teamId, String queryId) {
        long userId = resourcePolicy.readUserIdFor(UserResource.WORKSPACE_USER_DATA);
        return versionStore.listForQuery(userId, teamId, queryId).stream()
                .map(this::toDto)
                .toList();
    }

    public QueryLibraryVersionDto saveVersion(SaveQueryLibraryVersionRequest request) {
        if (request.teamId() == null || request.teamId().isBlank()) {
            throw new IllegalArgumentException("teamId is required");
        }
        if (request.queryId() == null || request.queryId().isBlank()) {
            throw new IllegalArgumentException("queryId is required");
        }
        if (request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        long userId = resourcePolicy.requireRegisteredUserIdFor(UserResource.WORKSPACE_USER_DATA);
        List<QueryLibraryVersionEntry> existing = versionStore.listForQuery(userId, request.teamId(), request.queryId());
        int nextVersion = existing.isEmpty() ? 1 : existing.get(0).getVersion() + 1;

        QueryLibraryVersionEntry entry = new QueryLibraryVersionEntry();
        entry.setId(IdGenerator.shortId("qlv-"));
        entry.setTeamId(request.teamId().trim());
        entry.setQueryId(request.queryId().trim());
        entry.setVersion(nextVersion);
        entry.setTitle(trimOrNull(request.title()));
        entry.setSql(request.sql().trim());
        entry.setChangeNote(trimOrNull(request.changeNote()));
        entry.setSavedAt(Instant.now());
        entry.setSavedByUserId(userId);

        versionStore.append(userId, entry);
        return toDto(entry);
    }

    private QueryLibraryVersionDto toDto(QueryLibraryVersionEntry entry) {
        return new QueryLibraryVersionDto(
                entry.getQueryId(),
                entry.getTeamId(),
                entry.getVersion(),
                entry.getTitle(),
                entry.getSql(),
                entry.getChangeNote(),
                entry.getSavedAt(),
                entry.getSavedByUserId()
        );
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
