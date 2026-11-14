package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.PluginItemDto;
import org.apache.datawise.backend.service.PluginService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/plugins")
@RequiresFeature(UserFeaturePermission.NAV_PLUGIN)
public class PluginController {

    private final PluginService pluginService;

    public PluginController(PluginService pluginService) {
        this.pluginService = pluginService;
    }

    @GetMapping
    public ApiResponse<List<PluginItemDto>> listPlugins() {
        return ApiResponse.ok(pluginService.listPlugins());
    }
}
