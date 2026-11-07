package org.apache.datawise.backend.jenkins;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.domain.JenkinsBuildDto;
import org.apache.datawise.backend.domain.JenkinsBuildLogDto;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.JenkinsJobDetailDto;
import org.apache.datawise.backend.domain.JenkinsJobDto;
import org.apache.datawise.backend.domain.JenkinsJobParameterDto;
import org.apache.datawise.backend.domain.JenkinsJobsResultDto;
import org.apache.datawise.backend.domain.JenkinsMutationResultDto;
import org.apache.datawise.backend.domain.JenkinsNodeDto;
import org.apache.datawise.backend.domain.JenkinsNodesResultDto;
import org.apache.datawise.backend.domain.JenkinsQueueItemDto;
import org.apache.datawise.backend.domain.JenkinsQueueResultDto;
import org.apache.datawise.backend.domain.JenkinsViewDto;
import org.apache.datawise.backend.domain.JenkinsViewsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class JenkinsConnectionSupport {

    private JenkinsConnectionSupport() {
    }

    public static JenkinsInfoDto info(ConnectionEntity entity) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        JenkinsRestClient.InfoResponse response = client.info();
        JsonNode root = response.root();
        return new JenkinsInfoDto(
                JenkinsRestClient.text(root, "nodeName"),
                JenkinsRestClient.text(root, "nodeDescription"),
                JenkinsRestClient.text(root, "mode"),
                response.version(),
                JenkinsRestClient.intValue(root, "numExecutors"),
                JenkinsRestClient.bool(root, "useCrumbs"),
                JenkinsRestClient.text(root, "url")
        );
    }

    public static JenkinsViewsResultDto listViews(ConnectionEntity entity) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        JsonNode root = client.listViews();
        List<JenkinsViewDto> views = new ArrayList<>();
        for (JsonNode view : JenkinsRestClient.array(root, "views")) {
            String name = JenkinsRestClient.text(view, "name");
            if (name == null || name.isBlank()) {
                continue;
            }
            views.add(new JenkinsViewDto(name, JenkinsRestClient.text(view, "url")));
        }
        return new JenkinsViewsResultDto(List.copyOf(views), views.size());
    }

    public static JenkinsJobsResultDto listJobs(
            ConnectionEntity entity,
            String nameFilter,
            int limit,
            String view,
            String folder,
            boolean browse
    ) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        String filter = nameFilter != null ? nameFilter.trim().toLowerCase(Locale.ROOT) : "";
        boolean searching = !filter.isEmpty();
        List<JenkinsJobDto> jobs = new ArrayList<>();

        if (browse && !searching) {
            JsonNode root = resolveBrowseRoot(client, view, folder);
            collectDirectChildren(root, jobs);
        } else {
            JsonNode root = isRootJobsView(view)
                    ? client.listJobsTree()
                    : client.listJobsInView(view.trim());
            collectJobs(root, jobs);
            if (searching) {
                jobs = jobs.stream()
                        .filter(job -> {
                            String name = job.fullName() != null ? job.fullName() : job.name();
                            return name != null && name.toLowerCase(Locale.ROOT).contains(filter);
                        })
                        .toList();
            }
            if (!searching && folder != null && !folder.isBlank()) {
                String prefix = folder.trim().replace('\\', '/') + "/";
                jobs = jobs.stream()
                        .filter(job -> {
                            String name = job.fullName() != null ? job.fullName() : job.name();
                            return name != null && name.startsWith(prefix);
                        })
                        .toList();
            }
        }

        int capped = limit > 0 ? Math.min(limit, jobs.size()) : jobs.size();
        List<JenkinsJobDto> page = jobs.subList(0, capped);
        return new JenkinsJobsResultDto(List.copyOf(page), jobs.size());
    }

    private static JsonNode resolveBrowseRoot(JenkinsRestClient client, String view, String folder)
            throws Exception {
        String folderPath = folder != null ? folder.trim().replace('\\', '/') : "";
        while (folderPath.startsWith("/")) {
            folderPath = folderPath.substring(1);
        }
        if (!folderPath.isEmpty()) {
            return client.listJobChildren(folderPath);
        }
        if (isRootJobsView(view)) {
            return client.listJobChildren(null);
        }
        return client.listJobChildrenInView(view.trim());
    }

    /** Prefer the root job tree for Jenkins AllView ("all" / localized "所有"). */
    private static boolean isRootJobsView(String view) {
        if (view == null || view.isBlank()) {
            return true;
        }
        String normalized = view.trim().toLowerCase(Locale.ROOT);
        return "all".equals(normalized) || "所有".equals(view.trim());
    }

    public static JenkinsJobDetailDto describeJob(ConnectionEntity entity, String jobName) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        JsonNode root = client.describeJob(jobName);
        List<JenkinsBuildDto> builds = new ArrayList<>();
        for (JsonNode build : JenkinsRestClient.array(root, "builds")) {
            builds.add(toBuild(build));
        }
        List<JenkinsJobParameterDto> parameters = new ArrayList<>();
        for (JsonNode property : JenkinsRestClient.array(root, "property")) {
            for (JsonNode definition : JenkinsRestClient.array(property, "parameterDefinitions")) {
                JenkinsJobParameterDto parameter = toParameter(definition);
                if (parameter != null) {
                    parameters.add(parameter);
                }
            }
        }
        return new JenkinsJobDetailDto(
                JenkinsRestClient.text(root, "name"),
                firstNonBlank(JenkinsRestClient.text(root, "fullName"), JenkinsRestClient.text(root, "name")),
                JenkinsRestClient.text(root, "url"),
                JenkinsRestClient.text(root, "color"),
                JenkinsRestClient.text(root, "description"),
                JenkinsRestClient.bool(root, "buildable"),
                JenkinsRestClient.bool(root, "inQueue"),
                toBuild(root.path("lastBuild")),
                toBuild(root.path("lastCompletedBuild")),
                toBuild(root.path("lastSuccessfulBuild")),
                toBuild(root.path("lastFailedBuild")),
                List.copyOf(builds),
                List.copyOf(parameters)
        );
    }

    public static JenkinsMutationResultDto triggerBuild(
            ConnectionEntity entity,
            String jobName,
            Map<String, String> parameters
    ) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        JenkinsRestClient.TriggerResponse response = client.triggerBuild(jobName, parameters);
        return new JenkinsMutationResultDto(
                true,
                "Build queued for job " + jobName,
                response.queueUrl()
        );
    }

    public static JenkinsMutationResultDto stopBuild(ConnectionEntity entity, String jobName, int buildNumber)
            throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        client.stopBuild(jobName, buildNumber);
        return new JenkinsMutationResultDto(
                true,
                "Stop requested for " + jobName + " #" + buildNumber,
                null
        );
    }

    public static JenkinsBuildLogDto buildLog(
            ConnectionEntity entity,
            String jobName,
            int buildNumber,
            int start
    ) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        try {
            JenkinsRestClient.ProgressiveLog log = client.progressiveLog(jobName, buildNumber, start);
            return new JenkinsBuildLogDto(log.text(), log.moreData(), log.nextStart());
        } catch (Exception ex) {
            String text = client.consoleText(jobName, buildNumber);
            return new JenkinsBuildLogDto(text, false, text.length());
        }
    }

    public static JenkinsQueueResultDto listQueue(ConnectionEntity entity, String jobName) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        JsonNode root = client.listQueue();
        String filter = jobName != null ? jobName.trim() : "";
        List<JenkinsQueueItemDto> items = new ArrayList<>();
        for (JsonNode item : JenkinsRestClient.array(root, "items")) {
            JsonNode task = item.path("task");
            String taskName = firstNonBlank(
                    JenkinsRestClient.text(task, "fullName"),
                    JenkinsRestClient.text(task, "name")
            );
            if (!filter.isEmpty() && !queueTaskMatches(taskName, filter)) {
                continue;
            }
            items.add(new JenkinsQueueItemDto(
                    JenkinsRestClient.longValue(item, "id"),
                    taskName,
                    JenkinsRestClient.text(task, "url"),
                    JenkinsRestClient.text(item, "why"),
                    JenkinsRestClient.bool(item, "blocked"),
                    JenkinsRestClient.bool(item, "buildable"),
                    JenkinsRestClient.longValue(item, "inQueueSince")
            ));
        }
        return new JenkinsQueueResultDto(List.copyOf(items), items.size());
    }

    public static JenkinsNodesResultDto listNodes(ConnectionEntity entity) throws Exception {
        JenkinsRestClient client = new JenkinsRestClient(JenkinsConnectionConfig.from(entity));
        JsonNode root = client.listNodes();
        List<JenkinsNodeDto> nodes = new ArrayList<>();
        for (JsonNode node : JenkinsRestClient.array(root, "computer")) {
            List<String> labels = new ArrayList<>();
            for (JsonNode label : JenkinsRestClient.array(node, "assignedLabels")) {
                String name = JenkinsRestClient.text(label, "name");
                if (name != null && !name.isBlank()) {
                    labels.add(name);
                }
            }
            int numExecutors = JenkinsRestClient.intValue(node, "numExecutors");
            int busyExecutors = node.has("busyExecutors")
                    ? JenkinsRestClient.intValue(node, "busyExecutors")
                    : 0;
            nodes.add(new JenkinsNodeDto(
                    JenkinsRestClient.text(node, "displayName"),
                    JenkinsRestClient.text(node, "description"),
                    JenkinsRestClient.bool(node, "offline"),
                    JenkinsRestClient.bool(node, "temporarilyOffline"),
                    JenkinsRestClient.bool(node, "idle"),
                    numExecutors,
                    busyExecutors,
                    JenkinsRestClient.text(node, "offlineCauseReason"),
                    labels.isEmpty() ? null : String.join(", ", labels)
            ));
        }
        return new JenkinsNodesResultDto(List.copyOf(nodes), nodes.size());
    }

    private static void collectJobs(JsonNode parent, List<JenkinsJobDto> out) {
        for (JsonNode job : JenkinsRestClient.array(parent, "jobs")) {
            String jobClass = JenkinsRestClient.text(job, "_class");
            boolean folder = isFolderClass(jobClass);
            if (!folder) {
                out.add(toJobDto(job, false));
            }
            if (job.has("jobs")) {
                collectJobs(job, out);
            }
        }
    }

    private static void collectDirectChildren(JsonNode parent, List<JenkinsJobDto> out) {
        for (JsonNode job : JenkinsRestClient.array(parent, "jobs")) {
            boolean folder = isFolderClass(JenkinsRestClient.text(job, "_class"));
            out.add(toJobDto(job, folder));
        }
        out.sort((left, right) -> {
            if (left.folder() != right.folder()) {
                return left.folder() ? -1 : 1;
            }
            String leftName = left.fullName() != null ? left.fullName() : left.name();
            String rightName = right.fullName() != null ? right.fullName() : right.name();
            return String.CASE_INSENSITIVE_ORDER.compare(
                    leftName != null ? leftName : "",
                    rightName != null ? rightName : ""
            );
        });
    }

    private static JenkinsJobDto toJobDto(JsonNode job, boolean folder) {
        JsonNode lastBuild = job.path("lastBuild");
        JsonNode lastSuccess = job.path("lastSuccessfulBuild");
        JsonNode lastFailed = job.path("lastFailedBuild");
        Integer lastBuildNumber = lastBuild.has("number")
                ? JenkinsRestClient.intValue(lastBuild, "number")
                : null;
        return new JenkinsJobDto(
                JenkinsRestClient.text(job, "name"),
                firstNonBlank(JenkinsRestClient.text(job, "fullName"), JenkinsRestClient.text(job, "name")),
                JenkinsRestClient.text(job, "url"),
                JenkinsRestClient.text(job, "color"),
                JenkinsRestClient.text(job, "_class"),
                job.has("buildable") ? JenkinsRestClient.bool(job, "buildable") : !folder,
                folder,
                lastBuildNumber,
                JenkinsRestClient.text(lastBuild, "result"),
                JenkinsRestClient.bool(lastBuild, "building"),
                JenkinsRestClient.longValue(lastBuild, "timestamp"),
                JenkinsRestClient.longValue(lastBuild, "duration"),
                JenkinsRestClient.longValue(lastSuccess, "timestamp"),
                JenkinsRestClient.longValue(lastFailed, "timestamp")
        );
    }

    private static boolean isFolderClass(String jobClass) {
        return jobClass != null && jobClass.toLowerCase(Locale.ROOT).contains("folder");
    }

    private static JenkinsJobParameterDto toParameter(JsonNode definition) {
        String name = JenkinsRestClient.text(definition, "name");
        if (name == null || name.isBlank()) {
            return null;
        }
        List<String> choices = new ArrayList<>();
        for (JsonNode choice : JenkinsRestClient.array(definition, "choices")) {
            if (choice != null && choice.isTextual() && !choice.asText().isBlank()) {
                choices.add(choice.asText());
            } else if (choice != null && !choice.isNull()) {
                choices.add(choice.asText());
            }
        }
        return new JenkinsJobParameterDto(
                name,
                parameterType(definition),
                JenkinsRestClient.text(definition, "description"),
                defaultParameterValue(definition.path("defaultParameterValue")),
                List.copyOf(choices)
        );
    }

    private static String parameterType(JsonNode definition) {
        String explicit = JenkinsRestClient.text(definition, "type");
        if (explicit != null && !explicit.isBlank()) {
            return simplifyParameterType(explicit);
        }
        String className = JenkinsRestClient.text(definition, "_class");
        if (className == null || className.isBlank()) {
            return "String";
        }
        int slash = className.lastIndexOf('.');
        String simple = slash >= 0 ? className.substring(slash + 1) : className;
        return simplifyParameterType(simple);
    }

    private static String simplifyParameterType(String raw) {
        String value = raw.trim();
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.contains("boolean")) return "Boolean";
        if (lower.contains("choice")) return "Choice";
        if (lower.contains("password")) return "Password";
        if (lower.contains("text")) return "Text";
        if (lower.contains("string")) return "String";
        if (lower.contains("file")) return "File";
        if (lower.contains("run")) return "Run";
        return value.replace("ParameterDefinition", "").replace("ParameterValue", "");
    }

    private static String defaultParameterValue(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode value = node.get("value");
        if (value == null || value.isNull() || value.isMissingNode()) {
            return null;
        }
        if (value.isBoolean() || value.isNumber() || value.isTextual()) {
            return value.asText();
        }
        return value.toString();
    }

    private static boolean queueTaskMatches(String taskName, String jobName) {
        if (taskName == null || taskName.isBlank()) {
            return false;
        }
        if (taskName.equals(jobName)) {
            return true;
        }
        // Folder jobs may appear as short name in queue.
        return taskName.endsWith("/" + jobName) || jobName.endsWith("/" + taskName);
    }

    private static JenkinsBuildDto toBuild(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull() || !node.isObject()) {
            return null;
        }
        int number = JenkinsRestClient.intValue(node, "number");
        if (number <= 0 && !node.has("number")) {
            return null;
        }
        return new JenkinsBuildDto(
                number,
                JenkinsRestClient.text(node, "url"),
                JenkinsRestClient.text(node, "result"),
                JenkinsRestClient.bool(node, "building"),
                JenkinsRestClient.longValue(node, "timestamp"),
                JenkinsRestClient.longValue(node, "duration"),
                JenkinsRestClient.text(node, "displayName")
        );
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        return fallback;
    }
}
