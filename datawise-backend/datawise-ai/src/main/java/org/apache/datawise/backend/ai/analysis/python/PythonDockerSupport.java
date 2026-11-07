package org.apache.datawise.backend.ai.analysis.python;

import java.util.ArrayList;
import java.util.List;

/** 构建 docker run 命令（网络隔离 + 只读挂载）。 */
public final class PythonDockerSupport {

    private PythonDockerSupport() {
    }

    public static List<String> buildDockerRunCommand(
            String dockerBinary,
            String image,
            String memoryLimit,
            String hostWorkDir,
            List<String> pythonCommand
    ) {
        List<String> command = new ArrayList<>();
        command.add(dockerBinary != null && !dockerBinary.isBlank() ? dockerBinary : "docker");
        command.add("run");
        command.add("--rm");
        command.add("--network");
        command.add("none");
        if (memoryLimit != null && !memoryLimit.isBlank()) {
            command.add("--memory");
            command.add(memoryLimit);
        }
        command.add("-v");
        command.add(hostWorkDir + ":/workspace:ro");
        command.add("-w");
        command.add("/workspace");
        command.add(image);
        command.addAll(pythonCommand);
        return command;
    }
}
