package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.domain.PythonExecutionResult;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/** 运行外部进程并收集 stdout/stderr。 */
public final class PythonProcessRunner {

    private static final int STREAM_DRAIN_TIMEOUT_SECONDS = 5;
    private static final int PROCESS_DESTROY_TIMEOUT_SECONDS = 5;

    private PythonProcessRunner() {
    }

    public static PythonExecutionResult run(List<String> command, int timeoutSeconds) {
        return run(command, Map.of(), null, timeoutSeconds);
    }

    public static PythonExecutionResult run(
            List<String> command,
            Map<String, String> environment,
            Path workingDirectory,
            int timeoutSeconds
    ) {
        Process process = null;
        CompletableFuture<String> outputFuture = null;
        try {
            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectErrorStream(true);
            if (workingDirectory != null) {
                builder.directory(workingDirectory.toFile());
            }
            if (environment != null && !environment.isEmpty()) {
                builder.environment().clear();
                builder.environment().putAll(environment);
            }
            process = builder.start();
            Process runningProcess = process;
            outputFuture = CompletableFuture.supplyAsync(() -> readStream(runningProcess.getInputStream()));

            boolean finished = process.waitFor(Math.max(5, timeoutSeconds), TimeUnit.SECONDS);
            if (!finished) {
                destroyProcess(process, outputFuture);
                return PythonExecutionResult.failure("Process timed out", "");
            }

            String combinedOutput = awaitOutput(outputFuture);
            if (process.exitValue() != 0) {
                return PythonExecutionResult.failure("Process exited with code " + process.exitValue(), combinedOutput);
            }
            return PythonExecutionResult.success(combinedOutput.trim());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            destroyProcess(process, outputFuture);
            return PythonExecutionResult.failure(ex.getMessage(), "");
        } catch (IOException ex) {
            destroyProcess(process, outputFuture);
            return PythonExecutionResult.failure(ex.getMessage(), "");
        }
    }

    private static String readStream(InputStream inputStream) {
        try (InputStream in = inputStream) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new CompletionException(ex);
        }
    }

    private static String awaitOutput(CompletableFuture<String> outputFuture)
            throws InterruptedException, IOException {
        try {
            return outputFuture.get(STREAM_DRAIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (ExecutionException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof IOException ioEx) {
                throw ioEx;
            }
            if (cause instanceof RuntimeException runtimeEx) {
                throw runtimeEx;
            }
            throw new IOException(cause != null ? cause.getMessage() : ex.getMessage(), cause);
        } catch (java.util.concurrent.TimeoutException ex) {
            throw new IOException("Timed out while reading process output", ex);
        }
    }

    private static void destroyProcess(Process process, CompletableFuture<String> outputFuture) {
        if (outputFuture != null && !outputFuture.isDone()) {
            outputFuture.cancel(true);
        }
        if (process == null) {
            return;
        }
        process.destroyForcibly();
        try {
            process.waitFor(PROCESS_DESTROY_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
