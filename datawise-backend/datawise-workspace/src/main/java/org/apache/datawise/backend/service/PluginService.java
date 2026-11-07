package org.apache.datawise.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.PluginItemDto;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import java.util.List;

@Service
public class PluginService {

    private List<PluginItemDto> catalog;

    private final ObjectMapper objectMapper;

    public PluginService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void loadCatalog() throws Exception {
        this.catalog = objectMapper.readValue(
                new ClassPathResource("seed/plugins.json").getInputStream(),
                new TypeReference<List<PluginItemDto>>() {
                }
        );
    }

    public List<PluginItemDto> listPlugins() {
        return catalog;
    }
}
