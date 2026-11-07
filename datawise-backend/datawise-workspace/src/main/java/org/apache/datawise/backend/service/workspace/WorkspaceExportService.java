package org.apache.datawise.backend.service.workspace;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.WorkspaceStore;
import org.apache.datawise.backend.domain.CreateExportTaskRequest;
import org.apache.datawise.backend.domain.ExportTaskDto;
import org.apache.datawise.backend.model.ExportTaskEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class WorkspaceExportService {

    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault());

    private final WorkspaceStore workspaceStore;
    private final UserAccountService userAccountService;
    private final UserResourcePolicy resourcePolicy;

    public WorkspaceExportService(
            WorkspaceStore workspaceStore,
            UserAccountService userAccountService,
            UserResourcePolicy resourcePolicy
    ) {
        this.workspaceStore = workspaceStore;
        this.userAccountService = userAccountService;
        this.resourcePolicy = resourcePolicy;
    }

    public List<ExportTaskDto> listExportTasks() {
        Long userId = userAccountService.requireUserId();
        return workspaceStore.findExportTasksByUserId(userId).stream()
                .map(this::toExportTaskDto)
                .toList();
    }

    public ExportTaskDto createExportTask(CreateExportTaskRequest request) {
        resourcePolicy.requireWrite(UserResource.WORKSPACE_USER_DATA);
        Long userId = userAccountService.requireUserId();
        String fileName = request.fileName();
        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("fileName is required");
        }
        ExportTaskEntity entity = new ExportTaskEntity();
        entity.setId(IdGenerator.shortId("e-"));
        entity.setUserId(userId);
        entity.setFileName(fileName);
        entity.setStatus("running");
        entity.setCreatedAt(Instant.now());
        if (request.fileSize() != null) {
            entity.setFileSize(request.fileSize());
        }
        workspaceStore.saveExportTask(entity);

        if (Boolean.TRUE.equals(request.clientCompleted())) {
            entity.setStatus("done");
            entity.setCompletedAt(Instant.now());
            workspaceStore.saveExportTask(entity);
        } else {
            // Client drives real export I/O; server only tracks task metadata — never fake progress with sleep.
            entity.setStatus("done");
            entity.setCompletedAt(Instant.now());
            workspaceStore.saveExportTask(entity);
        }

        return toExportTaskDto(entity);
    }

    private ExportTaskDto toExportTaskDto(ExportTaskEntity entity) {
        return new ExportTaskDto(
                entity.getId(),
                entity.getFileName(),
                TIME_FMT.format(entity.getCreatedAt()),
                entity.getStatus()
        );
    }
}
