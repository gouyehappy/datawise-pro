package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.ExplorerCatalogPersistence;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.apache.datawise.backend.service.project.ProjectService;
import org.springframework.stereotype.Service;

import java.util.List;

/** Explorer 分组 CRUD 与树重建。 */
@Service
public class ExplorerGroupService {

    private final ConnectionStore connectionStore;
    private final SessionEphemeralCatalogStore ephemeralCatalogStore;
    private final ExplorerTreeBuilder treeBuilder;
    private final ConnectionExecutionContext connectionContext;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final ExplorerCatalogPersistence catalogPersistence;
    private final UserResourcePolicy resourcePolicy;
    private final ProjectService projectService;

    public ExplorerGroupService(
            ConnectionStore connectionStore,
            SessionEphemeralCatalogStore ephemeralCatalogStore,
            ExplorerTreeBuilder treeBuilder,
            ConnectionExecutionContext connectionContext,
            ConnectionVisibilityService connectionVisibilityService,
            ExplorerCatalogPersistence catalogPersistence,
            UserResourcePolicy resourcePolicy,
            ProjectService projectService
    ) {
        this.connectionStore = connectionStore;
        this.ephemeralCatalogStore = ephemeralCatalogStore;
        this.treeBuilder = treeBuilder;
        this.connectionContext = connectionContext;
        this.connectionVisibilityService = connectionVisibilityService;
        this.catalogPersistence = catalogPersistence;
        this.resourcePolicy = resourcePolicy;
        this.projectService = projectService;
    }

    public GroupResult createGroup(String label, String parentId) {
        Long userId = connectionContext.requireUserId();
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId(IdGenerator.shortId("group-"));
        group.setUserId(userId);
        group.setLabel(label);
        if (parentId != null && !parentId.isBlank()) {
            ConnectionGroupEntity parent = connectionVisibilityService.resolveGroupEntity(parentId)
                    .orElseThrow(() -> new IllegalArgumentException("EXPLORER_GROUP_NOT_FOUND"));
            group.setParentId(parent.getId());
            group.setSortOrder(childGroups(parentId).size());
            group.setProjectId(resolveProjectIdForNewGroup(parent));
        } else {
            group.setSortOrder(rootGroups().size());
            group.setProjectId(ProjectIds.normalizeOrDefault(projectService.resolveActiveProjectId()));
        }
        group.setExpanded(false);
        catalogPersistence.saveGroup(group);
        return new GroupResult(group.getId(), buildGroupTree());
    }

    private String resolveProjectIdForNewGroup(ConnectionGroupEntity parent) {
        if (parent.getProjectId() != null && !parent.getProjectId().isBlank()) {
            return ProjectIds.normalizeOrDefault(parent.getProjectId());
        }
        return ProjectIds.normalizeOrDefault(projectService.resolveActiveProjectId());
    }

    public List<TreeNode> updateGroup(String groupId, String label) {
        ConnectionGroupEntity group = connectionVisibilityService.resolveGroupEntity(groupId)
                .orElseThrow(() -> new IllegalArgumentException("EXPLORER_GROUP_NOT_FOUND"));
        group.setLabel(label);
        catalogPersistence.saveGroup(group);
        return buildGroupTree();
    }

    public void deleteGroupCascade(String groupId) {
        catalogPersistence.deleteGroupCascade(groupId);
    }

    public String defaultGroupId() {
        String existing = connectionVisibilityService.defaultGroupIdForCurrentUser();
        if (existing != null) {
            return existing;
        }
        if (resourcePolicy.isGuestSession()) {
            return ephemeralCatalogStore.ensureDefaultGroupId(
                    resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG)
            );
        }
        return createGroup("\u9ed8\u8ba4\u7ec4", null).groupId();
    }

    public List<TreeNode> buildGroupTree() {
        ConnectionVisibilityService.VisibleCatalog catalog = connectionVisibilityService.visibleCatalogForCurrentUser();
        return treeBuilder.buildGroups(catalog.groups());
    }

    private List<ConnectionGroupEntity> rootGroups() {
        if (resourcePolicy.isGuestSession()) {
            return ephemeralCatalogStore.getCatalog(
                    resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG)
            ).groups().stream()
                    .filter(group -> group.getParentId() == null)
                    .toList();
        }
        return connectionStore.findRootGroups();
    }

    private List<ConnectionGroupEntity> childGroups(String parentId) {
        if (resourcePolicy.isGuestSession()) {
            return ephemeralCatalogStore.getCatalog(
                    resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG)
            ).groups().stream()
                    .filter(group -> parentId.equals(group.getParentId()))
                    .toList();
        }
        return connectionStore.findChildGroups(parentId);
    }
}
