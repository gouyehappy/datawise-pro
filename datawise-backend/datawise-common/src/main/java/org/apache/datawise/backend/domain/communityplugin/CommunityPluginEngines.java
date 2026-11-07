package org.apache.datawise.backend.domain.communityplugin;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CommunityPluginEngines(
        @JsonAlias("dbx") String datawise,
        @JsonAlias("host_api") String hostApi) {
}
