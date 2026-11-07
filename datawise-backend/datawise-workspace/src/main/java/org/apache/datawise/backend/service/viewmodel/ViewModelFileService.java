package org.apache.datawise.backend.service.viewmodel;



import org.apache.datawise.backend.common.support.PathSegmentSanitizer;

import org.apache.datawise.backend.connector.api.support.SqlSelectDetector;

import org.apache.datawise.backend.domain.ReadViewModelResult;

import org.apache.datawise.backend.domain.RenameViewModelRequest;

import org.apache.datawise.backend.domain.SaveViewModelRequest;

import org.apache.datawise.backend.domain.SaveViewModelResult;

import org.apache.datawise.backend.service.UserResource;

import org.apache.datawise.backend.service.UserResourcePolicy;

import org.slf4j.Logger;

import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Service;



import java.io.IOException;

import java.nio.charset.StandardCharsets;

import java.nio.file.Files;

import java.nio.file.Path;



@Service

public class ViewModelFileService {



    private static final Logger log = LoggerFactory.getLogger(ViewModelFileService.class);

    static final String DRAFT_SUFFIX = ".draft";



    private final ViewModelWorkspaceSupport workspaceSupport;

    private final UserResourcePolicy resourcePolicy;



    public ViewModelFileService(

            ViewModelWorkspaceSupport workspaceSupport,

            UserResourcePolicy resourcePolicy

    ) {

        this.workspaceSupport = workspaceSupport;

        this.resourcePolicy = resourcePolicy;

    }



    public SaveViewModelResult save(SaveViewModelRequest request) throws IOException {

        requireRegisteredUser();

        String instanceKey = requireInstanceKey(request.connectionId(), request);

        String sql = request.sql() != null ? request.sql().trim() : "";

        requireSelectSql(sql);



        String fileName = requireFileName(request.name());

        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(request.connectionId(), instanceKey);

        Files.createDirectories(viewModelsDir);



        Path target = resolveOfficialPath(viewModelsDir, fileName);

        Files.writeString(target, sql, StandardCharsets.UTF_8);

        deleteDraftIfExists(viewModelsDir, fileName);



        String displayName = PathSegmentSanitizer.viewModelDisplayName(fileName);

        log.info("ViewModelFileService.save connectionId={} instance={} name={} path={}",

                request.connectionId(),

                instanceKey,

                displayName,

                workspaceSupport.relativize(target));

        return new SaveViewModelResult(

                workspaceSupport.relativize(target),

                displayName,

                fileName,

                workspaceSupport.relativize(viewModelsDir),

                false

        );

    }



    public SaveViewModelResult saveDraft(SaveViewModelRequest request) throws IOException {

        requireRegisteredUser();

        String instanceKey = requireInstanceKey(request.connectionId(), request);

        String sql = request.sql() != null ? request.sql() : "";



        String fileName = requireFileName(request.name());

        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(request.connectionId(), instanceKey);

        Files.createDirectories(viewModelsDir);



        Path draft = resolveDraftPath(viewModelsDir, fileName);

        Files.writeString(draft, sql, StandardCharsets.UTF_8);



        String displayName = PathSegmentSanitizer.viewModelDisplayName(fileName);

        log.info("ViewModelFileService.saveDraft connectionId={} instance={} name={} path={}",

                request.connectionId(),

                instanceKey,

                displayName,

                workspaceSupport.relativize(draft));

        return new SaveViewModelResult(

                workspaceSupport.relativize(draft),

                displayName,

                fileName,

                workspaceSupport.relativize(viewModelsDir),

                true

        );

    }



    public SaveViewModelResult rename(RenameViewModelRequest request) throws IOException {

        requireRegisteredUser();

        if (request.connectionId() == null || request.connectionId().isBlank()) {

            throw new IllegalArgumentException("connectionId is required");

        }

        if (request.instanceName() == null || request.instanceName().isBlank()) {

            throw new IllegalArgumentException("instanceName is required");

        }



        String instanceKey = request.instanceName().trim();

        String oldFileName = PathSegmentSanitizer.sanitizeViewModelFileName(

                request.oldName(),

                ViewModelWorkspaceSupport.DEFAULT_FILE

        );

        String newFileName = PathSegmentSanitizer.requireViewModelFileName(request.newName());



        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(request.connectionId(), instanceKey);

        Path source = resolveOfficialPath(viewModelsDir, oldFileName);

        Path target = resolveOfficialPath(viewModelsDir, newFileName);

        Path sourceDraft = resolveDraftPath(viewModelsDir, oldFileName);

        Path targetDraft = resolveDraftPath(viewModelsDir, newFileName);

        if (!source.startsWith(viewModelsDir) || !target.startsWith(viewModelsDir)) {

            throw new IllegalArgumentException("Invalid view model name");

        }



        if (oldFileName.equalsIgnoreCase(newFileName)) {

            boolean draft = Files.isRegularFile(sourceDraft);

            String relative = Files.exists(source)

                    ? workspaceSupport.relativize(source)

                    : (draft ? workspaceSupport.relativize(sourceDraft) : "");

            return new SaveViewModelResult(

                    relative,

                    PathSegmentSanitizer.viewModelDisplayName(newFileName),

                    newFileName,

                    workspaceSupport.relativize(viewModelsDir),

                    draft && !Files.isRegularFile(source)

            );

        }



        if (!Files.isRegularFile(source) && !Files.isRegularFile(sourceDraft)) {

            throw new IllegalArgumentException("View model not found: " + oldFileName);

        }

        if (Files.exists(target) || Files.exists(targetDraft)) {

            throw new IllegalArgumentException("View model already exists: " + newFileName);

        }



        if (Files.isRegularFile(source)) {

            Files.move(source, target);

        }

        if (Files.isRegularFile(sourceDraft)) {

            Files.move(sourceDraft, targetDraft);

        }



        boolean draftOnly = !Files.isRegularFile(target) && Files.isRegularFile(targetDraft);

        String relative = draftOnly

                ? workspaceSupport.relativize(targetDraft)

                : workspaceSupport.relativize(target);

        log.info("ViewModelFileService.rename connectionId={} instance={} {} -> {}",

                request.connectionId(),

                instanceKey,

                oldFileName,

                newFileName);

        return new SaveViewModelResult(

                relative,

                PathSegmentSanitizer.viewModelDisplayName(newFileName),

                newFileName,

                workspaceSupport.relativize(viewModelsDir),

                draftOnly

        );

    }



    public void delete(String connectionId, String instanceName, String name) throws IOException {

        requireRegisteredUser();

        if (connectionId == null || connectionId.isBlank()) {

            throw new IllegalArgumentException("connectionId is required");

        }

        if (instanceName == null || instanceName.isBlank()) {

            throw new IllegalArgumentException("instanceName is required");

        }



        String instanceKey = instanceName.trim();

        String fileName = PathSegmentSanitizer.sanitizeViewModelFileName(name, ViewModelWorkspaceSupport.DEFAULT_FILE);

        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(connectionId, instanceKey);

        Path target = resolveOfficialPath(viewModelsDir, fileName);

        Path draft = resolveDraftPath(viewModelsDir, fileName);

        if (!target.startsWith(viewModelsDir) || !draft.startsWith(viewModelsDir)) {

            throw new IllegalArgumentException("Invalid view model name");

        }

        if (!Files.isRegularFile(target) && !Files.isRegularFile(draft)) {

            throw new IllegalArgumentException("View model not found: " + fileName);

        }



        if (Files.isRegularFile(target)) {

            Files.delete(target);

        }

        if (Files.isRegularFile(draft)) {

            Files.delete(draft);

        }

        log.info("ViewModelFileService.delete connectionId={} instance={} name={}",

                connectionId,

                instanceKey,

                fileName);

    }



    public ReadViewModelResult read(String connectionId, String instanceName, String name) throws IOException {

        if (connectionId == null || connectionId.isBlank()) {

            throw new IllegalArgumentException("connectionId is required");

        }

        if (instanceName == null || instanceName.isBlank()) {

            throw new IllegalArgumentException("instanceName is required");

        }



        String fileName = PathSegmentSanitizer.sanitizeViewModelFileName(name, ViewModelWorkspaceSupport.DEFAULT_FILE);

        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(connectionId, instanceName);

        Path official = resolveOfficialPath(viewModelsDir, fileName);

        Path draft = resolveDraftPath(viewModelsDir, fileName);

        if (!official.startsWith(viewModelsDir) || !draft.startsWith(viewModelsDir)) {

            throw new IllegalArgumentException("Invalid view model name");

        }



        String displayName = PathSegmentSanitizer.viewModelDisplayName(fileName);

        if (Files.isRegularFile(official)) {

            return new ReadViewModelResult(

                    Files.readString(official, StandardCharsets.UTF_8),

                    displayName,

                    fileName,

                    workspaceSupport.relativize(official),

                    false

            );

        }

        if (Files.isRegularFile(draft)) {

            return new ReadViewModelResult(

                    Files.readString(draft, StandardCharsets.UTF_8),

                    displayName,

                    fileName,

                    workspaceSupport.relativize(draft),

                    true

            );

        }

        return new ReadViewModelResult("", displayName, fileName, "", false);

    }



    static void requireSelectSql(String sql) {

        if (sql == null || sql.isBlank()) {

            throw new IllegalArgumentException("SQL is required");

        }

        if (!SqlSelectDetector.isPagedSelect(sql)) {

            throw new IllegalArgumentException("View model SQL must be a SELECT query");

        }

    }



    static boolean isOfficialViewModelFile(String fileName) {

        if (fileName == null || fileName.isBlank()) {

            return false;

        }

        String lower = fileName.toLowerCase();

        return lower.endsWith(".view.sql") && !lower.endsWith(".view.sql" + DRAFT_SUFFIX);

    }



    static Path resolveOfficialPath(Path viewModelsDir, String fileName) {

        Path target = viewModelsDir.resolve(fileName).normalize();

        if (!target.startsWith(viewModelsDir)) {

            throw new IllegalArgumentException("Invalid view model name");

        }

        return target;

    }



    static Path resolveDraftPath(Path viewModelsDir, String fileName) {

        Path target = viewModelsDir.resolve(fileName + DRAFT_SUFFIX).normalize();

        if (!target.startsWith(viewModelsDir)) {

            throw new IllegalArgumentException("Invalid view model name");

        }

        return target;

    }



    private String requireFileName(String rawName) {

        return PathSegmentSanitizer.requireViewModelFileName(

                rawName != null ? rawName : ViewModelWorkspaceSupport.DEFAULT_FILE

        );

    }



    private String requireInstanceKey(String connectionId, SaveViewModelRequest request) {

        if (connectionId == null || connectionId.isBlank()) {

            throw new IllegalArgumentException("connectionId is required");

        }

        String instanceKey = resolveInstanceKey(request);

        if (instanceKey.isBlank()) {

            throw new IllegalArgumentException("instanceId or instanceName is required");

        }

        return instanceKey;

    }



    private void deleteDraftIfExists(Path viewModelsDir, String fileName) throws IOException {

        Path draft = resolveDraftPath(viewModelsDir, fileName);

        if (Files.isRegularFile(draft)) {

            Files.delete(draft);

        }

    }



    private String resolveInstanceKey(SaveViewModelRequest request) {

        if (request.instanceName() != null && !request.instanceName().isBlank()) {

            return request.instanceName().trim();

        }

        if (request.instanceId() != null && !request.instanceId().isBlank()) {

            return request.instanceId().trim();

        }

        return "";

    }



    private void requireRegisteredUser() {

        if (resourcePolicy != null) {

            resourcePolicy.requireWrite(UserResource.WORKSPACE_SCRIPTS);

        }

    }

}


