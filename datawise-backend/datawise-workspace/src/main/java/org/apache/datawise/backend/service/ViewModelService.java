package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.ReadViewModelResult;
import org.apache.datawise.backend.domain.RenameViewModelRequest;
import org.apache.datawise.backend.domain.SaveViewModelRequest;
import org.apache.datawise.backend.domain.SaveViewModelResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.ViewModelFileDto;
import org.apache.datawise.backend.service.viewmodel.ViewModelCatalogService;
import org.apache.datawise.backend.service.viewmodel.ViewModelFileService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;

@Service
public class ViewModelService {

    private final ViewModelFileService fileService;
    private final ViewModelCatalogService catalogService;

    public ViewModelService(ViewModelFileService fileService, ViewModelCatalogService catalogService) {
        this.fileService = fileService;
        this.catalogService = catalogService;
    }

    public SaveViewModelResult save(SaveViewModelRequest request) throws IOException {
        return fileService.save(request);
    }

    public SaveViewModelResult saveDraft(SaveViewModelRequest request) throws IOException {
        return fileService.saveDraft(request);
    }

    public SaveViewModelResult rename(RenameViewModelRequest request) throws IOException {
        return fileService.rename(request);
    }

    public void delete(String connectionId, String instanceName, String name) throws IOException {
        fileService.delete(connectionId, instanceName, name);
    }

    public ReadViewModelResult read(String connectionId, String instanceName, String name) throws IOException {
        return fileService.read(connectionId, instanceName, name);
    }

    public List<TreeNode> listViewModelNodes(String connectionId, String instanceName) throws IOException {
        return catalogService.listViewModelNodes(connectionId, instanceName);
    }

    public List<ViewModelFileDto> listViewModels(String connectionId, String instanceName) throws IOException {
        return catalogService.listViewModels(connectionId, instanceName);
    }
}
