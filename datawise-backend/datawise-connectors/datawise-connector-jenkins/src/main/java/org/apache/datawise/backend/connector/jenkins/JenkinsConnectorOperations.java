package org.apache.datawise.backend.connector.jenkins;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.jenkins.support.JenkinsConnectionErrors;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorCiCdOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.JenkinsBuildLogDto;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.JenkinsJobDetailDto;
import org.apache.datawise.backend.domain.JenkinsJobsResultDto;
import org.apache.datawise.backend.domain.JenkinsMutationResultDto;
import org.apache.datawise.backend.domain.JenkinsNodesResultDto;
import org.apache.datawise.backend.domain.JenkinsQueueResultDto;
import org.apache.datawise.backend.domain.JenkinsViewsResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.jenkins.JenkinsConnectionSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;

public class JenkinsConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorCiCdOperations {

    private static final Logger log = LoggerFactory.getLogger(JenkinsConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            JenkinsInfoDto info = JenkinsConnectionSupport.info(entity);
            long latency = System.currentTimeMillis() - start;
            String mode = info.mode() != null ? info.mode() : "unknown";
            String message = String.format(
                    "Connected to Jenkins %s (%s) in %dms",
                    entity.getHost(),
                    mode,
                    latency
            );
            return new ConnectionTestResult(true, message, latency);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "Jenkins connection test failed for " + entity.getHost(), ex);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(false, JenkinsConnectionErrors.toUserMessage(entity, ex), latency);
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        return List.of();
    }

    @Override
    public JenkinsInfoDto info(ConnectionEntity connection) {
        return wrap(() -> JenkinsConnectionSupport.info(connection));
    }

    @Override
    public JenkinsViewsResultDto listViews(ConnectionEntity connection) {
        return wrap(() -> JenkinsConnectionSupport.listViews(connection));
    }

    @Override
    public JenkinsJobsResultDto listJobs(
            ConnectionEntity connection,
            String nameFilter,
            int limit,
            String view,
            String folder,
            boolean browse
    ) {
        return wrap(() -> JenkinsConnectionSupport.listJobs(connection, nameFilter, limit, view, folder, browse));
    }

    @Override
    public JenkinsJobDetailDto describeJob(ConnectionEntity connection, String jobName) {
        return wrap(() -> JenkinsConnectionSupport.describeJob(connection, jobName));
    }

    @Override
    public JenkinsMutationResultDto triggerBuild(
            ConnectionEntity connection,
            String jobName,
            Map<String, String> parameters
    ) {
        return wrap(() -> JenkinsConnectionSupport.triggerBuild(connection, jobName, parameters));
    }

    @Override
    public JenkinsMutationResultDto stopBuild(ConnectionEntity connection, String jobName, int buildNumber) {
        return wrap(() -> JenkinsConnectionSupport.stopBuild(connection, jobName, buildNumber));
    }

    @Override
    public JenkinsBuildLogDto buildLog(
            ConnectionEntity connection,
            String jobName,
            int buildNumber,
            int start
    ) {
        return wrap(() -> JenkinsConnectionSupport.buildLog(connection, jobName, buildNumber, start));
    }

    @Override
    public JenkinsQueueResultDto listQueue(ConnectionEntity connection, String jobName) {
        return wrap(() -> JenkinsConnectionSupport.listQueue(connection, jobName));
    }

    @Override
    public JenkinsNodesResultDto listNodes(ConnectionEntity connection) {
        return wrap(() -> JenkinsConnectionSupport.listNodes(connection));
    }

    private static <T> T wrap(JenkinsCallable<T> callable) {
        try {
            return callable.call();
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    @FunctionalInterface
    private interface JenkinsCallable<T> {
        T call() throws Exception;
    }
}
