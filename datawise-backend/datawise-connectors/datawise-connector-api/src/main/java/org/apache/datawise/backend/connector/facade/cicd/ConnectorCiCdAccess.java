package org.apache.datawise.backend.connector.facade.cicd;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.JenkinsBuildLogDto;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.JenkinsJobDetailDto;
import org.apache.datawise.backend.domain.JenkinsJobsResultDto;
import org.apache.datawise.backend.domain.JenkinsMutationResultDto;
import org.apache.datawise.backend.domain.JenkinsNodesResultDto;
import org.apache.datawise.backend.domain.JenkinsQueueResultDto;
import org.apache.datawise.backend.domain.JenkinsViewsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Jenkins and other CI/CD job-server capability entry. */
@Component
public class ConnectorCiCdAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorCiCdAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public JenkinsInfoDto info(ConnectionEntity connection) {
        return catalog.resolve(connection).ciCd().info(connection);
    }

    public JenkinsViewsResultDto listViews(ConnectionEntity connection) {
        return catalog.resolve(connection).ciCd().listViews(connection);
    }

    public JenkinsJobsResultDto listJobs(
                                         ConnectionEntity connection,
                                         String nameFilter,
                                         int limit,
                                         String view,
                                         String folder,
                                         boolean browse) {
        return catalog.resolve(connection).ciCd().listJobs(connection, nameFilter, limit, view, folder, browse);
    }

    public JenkinsJobDetailDto describeJob(ConnectionEntity connection, String jobName) {
        return catalog.resolve(connection).ciCd().describeJob(connection, jobName);
    }

    public JenkinsMutationResultDto triggerBuild(
                                                 ConnectionEntity connection,
                                                 String jobName,
                                                 Map<String, String> parameters) {
        return catalog.resolve(connection).ciCd().triggerBuild(connection, jobName, parameters);
    }

    public JenkinsMutationResultDto stopBuild(ConnectionEntity connection, String jobName, int buildNumber) {
        return catalog.resolve(connection).ciCd().stopBuild(connection, jobName, buildNumber);
    }

    public JenkinsBuildLogDto buildLog(
                                       ConnectionEntity connection,
                                       String jobName,
                                       int buildNumber,
                                       int start) {
        return catalog.resolve(connection).ciCd().buildLog(connection, jobName, buildNumber, start);
    }

    public JenkinsQueueResultDto listQueue(ConnectionEntity connection, String jobName) {
        return catalog.resolve(connection).ciCd().listQueue(connection, jobName);
    }

    public JenkinsNodesResultDto listNodes(ConnectionEntity connection) {
        return catalog.resolve(connection).ciCd().listNodes(connection);
    }
}
