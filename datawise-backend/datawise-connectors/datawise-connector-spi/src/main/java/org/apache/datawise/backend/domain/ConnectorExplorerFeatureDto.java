package org.apache.datawise.backend.domain;

/**
 * Explorer UI feature declared by a connector plugin (tree child + connection menu open action).
 * <p>
 * Optional flags default to {@code true} when null. {@code treeNodeIdSuffix} overrides the default
 * tree node id {@code {connectionId}:{dbType}:feature:{id}} when non-blank
 * (e.g. SSH {@code :ssh-terminal}).
 */
public record ConnectorExplorerFeatureDto(
        String id,
        String nodeType,
        String openKind,
        String menuId,
        String icon,
        String labelKey,
        int order,
        Boolean showInTree,
        Boolean showInMenu,
        String treeNodeIdSuffix) {

    public ConnectorExplorerFeatureDto(
                                       String id,
                                       String nodeType,
                                       String openKind,
                                       String menuId,
                                       String icon,
                                       String labelKey,
                                       int order) {
        this(id, nodeType, openKind, menuId, icon, labelKey, order, null, null, null);
    }

    public boolean includeInTree() {
        return showInTree == null || showInTree;
    }

    public boolean includeInMenu() {
        return showInMenu == null || showInMenu;
    }
}
