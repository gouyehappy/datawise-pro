package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.DiscoverySearchPageDto;
import org.apache.datawise.backend.service.discovery.DiscoverySearchService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/discovery")
public class DiscoveryController {

    private final DiscoverySearchService discoverySearchService;

    public DiscoveryController(DiscoverySearchService discoverySearchService) {
        this.discoverySearchService = discoverySearchService;
    }

    @GetMapping("/search")
    public ApiResponse<DiscoverySearchPageDto> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset,
            @RequestParam(required = false) List<String> kind,
            @RequestParam(required = false) List<String> connectionId,
            @RequestParam(required = false) List<String> owner,
            @RequestParam(required = false) List<String> tag
    ) {
        return ApiResponse.ok(discoverySearchService.search(
                q, limit, offset, kind, connectionId, owner, tag
        ));
    }
}
