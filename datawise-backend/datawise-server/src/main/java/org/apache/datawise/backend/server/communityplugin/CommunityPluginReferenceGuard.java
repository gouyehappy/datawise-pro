package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Uninstall is refused while saved connections still point at the plugin.
 */
public final class CommunityPluginReferenceGuard {

    private CommunityPluginReferenceGuard() {
    }

    public static void refuseIfReferenced(String pluginId, List<ConnectionEntity> connections) {
        if (pluginId == null || pluginId.isBlank() || connections == null || connections.isEmpty()) {
            return;
        }
        List<String> names = connections.stream()
                .filter(connection -> pluginId.equals(connection.getPluginId()))
                .map(connection -> {
                    String name = connection.getName();
                    return name == null || name.isBlank() ? connection.getId() : name;
                })
                .filter(name -> name != null && !name.isBlank())
                .limit(8)
                .toList();
        if (names.isEmpty()) {
            return;
        }
        throw new CommunityPluginException(
                "Cannot uninstall plugin '" + pluginId + "': referenced by connections: "
                        + names.stream().collect(Collectors.joining(", "))
        );
    }
}
