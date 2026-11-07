package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** 准备 Python 分析临时工作区（脚本 + SQL 结果 JSON）。 */
public final class PythonExecutionWorkspace {

    private static final Logger log = LoggerFactory.getLogger(PythonExecutionWorkspace.class);

    private final Path directory;

    private PythonExecutionWorkspace(Path directory) {
        this.directory = directory;
    }

    public Path directory() {
        return directory;
    }

    public Path scriptPath() {
        return directory.resolve("analysis.py");
    }

    public Path requirementsPath() {
        return directory.resolve("requirements.txt");
    }

    public Path depsDirectory() {
        return directory.resolve(".python-deps");
    }

    public void writeRequirements(List<String> packages) throws IOException {
        String content = PythonDependencySupport.requirementsContent(packages);
        if (content.isBlank()) {
            Files.deleteIfExists(requirementsPath());
            return;
        }
        Files.writeString(requirementsPath(), content, StandardCharsets.UTF_8);
    }

    public static PythonExecutionWorkspace prepare(
            ObjectMapper objectMapper,
            String code,
            ExecuteSqlResult sqlResult,
            boolean wrapSandbox
    ) throws IOException {
        Path workDir = Files.createTempDirectory("datawise-python-");
        objectMapper.writeValue(workDir.resolve("sql_result.json").toFile(), toPayload(sqlResult));
        String scriptBody = wrapSandbox ? PythonSandboxSupport.wrapUserCode(code) : code;
        Files.writeString(workDir.resolve("analysis.py"), scriptBody, StandardCharsets.UTF_8);
        return new PythonExecutionWorkspace(workDir);
    }

    public void cleanup() {
        deleteRecursively(directory);
    }

    private static Map<String, Object> toPayload(ExecuteSqlResult sqlResult) {
        if (sqlResult == null) {
            return Map.of("sql", "", "rowCount", 0, "durationMs", 0L, "columns", List.of(), "rows", List.of());
        }
        return Map.of(
                "sql", sqlResult.sql() != null ? sqlResult.sql() : "",
                "rowCount", sqlResult.rowCount(),
                "durationMs", sqlResult.durationMs(),
                "columns", sqlResult.columns() != null ? sqlResult.columns() : List.of(),
                "rows", sqlResult.rows() != null ? sqlResult.rows() : List.of()
        );
    }

    private static void deleteRecursively(Path root) {
        if (root == null) {
            return;
        }
        try {
            if (Files.isDirectory(root)) {
                try (var stream = Files.list(root)) {
                    for (Path child : stream.toList()) {
                        deleteRecursively(child);
                    }
                }
            }
            Files.deleteIfExists(root);
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "Failed to delete Python workspace " + root, ex);
        }
    }
}
