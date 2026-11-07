package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CommunityPluginMarketplaceMergeTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void prefixesRemoteCatalogIdsToAvoidBuiltinCollision() {
        ObjectNode fixture = mapper.createObjectNode();
        ArrayNode fixtureCatalogs = fixture.putArray("catalogs");
        ObjectNode builtin = fixtureCatalogs.addObject();
        builtin.put("id", "datawise-examples");
        builtin.put("name", "Builtin");
        builtin.putArray("entries");

        ObjectNode remote = mapper.createObjectNode();
        ArrayNode remoteCatalogs = remote.putArray("catalogs");
        ObjectNode thirdParty = remoteCatalogs.addObject();
        thirdParty.put("id", "datawise-examples");
        thirdParty.put("name", "Remote");
        thirdParty.putArray("entries").addObject().put("id", "com.example.plugin");

        ArrayNode out = mapper.createArrayNode();
        CommunityPluginMarketplace.appendCatalogs(mapper, out, fixture, "builtin", null);
        CommunityPluginMarketplace.appendCatalogs(mapper, out, remote, "repository", "acme");

        assertEquals(2, out.size());
        assertEquals("datawise-examples", out.get(0).path("id").asText());
        assertEquals("builtin", out.get(0).path("source").asText());
        assertEquals("repo:acme:datawise-examples", out.get(1).path("id").asText());
        assertEquals("repository", out.get(1).path("source").asText());
        assertEquals("acme", out.get(1).path("repositoryId").asText());
    }
}
