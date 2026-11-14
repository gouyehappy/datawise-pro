package org.apache.datawise.backend.ai.analysis.python;

import java.util.ArrayList;
import java.util.List;

/**
 * 构建 docker run 命令：无网络、只读根文件系统、掉权、pids/cpu 限额、工作区只读挂载。
 */
public final class PythonDockerSupport {

    static final String DEFAULT_CPUS = "1.0";
    static final String DEFAULT_PIDS_LIMIT = "64";

    private PythonDockerSupport() {
    }

    public static List<String> buildDockerRunCommand(
            String dockerBinary,
            String image,
            String memoryLimit,
            String hostWorkDir,
            List<String> pythonCommand
    ) {
        return buildDockerRunCommand(
                dockerBinary,
                image,
                memoryLimit,
                DEFAULT_CPUS,
                DEFAULT_PIDS_LIMIT,
                hostWorkDir,
                pythonCommand);
    }

    public static List<String> buildDockerRunCommand(
            String dockerBinary,
            String image,
            String memoryLimit,
            String cpus,
            String pidsLimit,
            String hostWorkDir,
            List<String> pythonCommand
    ) {
        List<String> command = new ArrayList<>();
        command.add(dockerBinary != null && !dockerBinary.isBlank() ? dockerBinary : "docker");
        command.add("run");
        command.add("--rm");
        command.add("--network");
        command.add("none");
        command.add("--read-only");
        command.add("--cap-drop");
        command.add("ALL");
        command.add("--security-opt");
        command.add("no-new-privileges");
        command.add("--pids-limit");
        command.add(pidsLimit != null && !pidsLimit.isBlank() ? pidsLimit : DEFAULT_PIDS_LIMIT);
        command.add("--cpus");
        command.add(cpus != null && !cpus.isBlank() ? cpus : DEFAULT_CPUS);
        if (memoryLimit != null && !memoryLimit.isBlank()) {
            command.add("--memory");
            command.add(memoryLimit);
        }
        // Writable temp for pip / interpreter scratch; noexec reduces binary drop risk.
        command.add("--tmpfs");
        command.add("/tmp:rw,noexec,nosuid,size=64m");
        command.add("-v");
        command.add(hostWorkDir + ":/workspace:ro");
        command.add("-w");
        command.add("/workspace");
        command.add(image);
        command.addAll(pythonCommand);
        return command;
    }
}
