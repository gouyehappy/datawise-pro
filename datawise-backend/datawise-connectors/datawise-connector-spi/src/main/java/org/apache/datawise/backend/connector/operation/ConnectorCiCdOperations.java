package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.JenkinsBuildLogDto;
import org.apache.datawise.backend.domain.JenkinsInfoDto;
import org.apache.datawise.backend.domain.JenkinsJobDetailDto;
import org.apache.datawise.backend.domain.JenkinsJobsResultDto;
import org.apache.datawise.backend.domain.JenkinsMutationResultDto;
import org.apache.datawise.backend.domain.JenkinsNodesResultDto;
import org.apache.datawise.backend.domain.JenkinsQueueResultDto;
import org.apache.datawise.backend.domain.JenkinsViewsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Map;

/** CI/CD job server operations (Jenkins and similar). */
public interface ConnectorCiCdOperations {

    JenkinsInfoDto info(ConnectionEntity connection);

    JenkinsViewsResultDto listViews(ConnectionEntity connection);

    JenkinsJobsResultDto listJobs(
                                  ConnectionEntity connection,
                                  String nameFilter,
                                  int limit,
                                  String view,
                                  String folder,
                                  boolean browse);

    JenkinsJobDetailDto describeJob(ConnectionEntity connection, String jobName);

    JenkinsMutationResultDto triggerBuild(
                                          ConnectionEntity connection,
                                          String jobName,
                                          Map<String, String> parameters);

    JenkinsMutationResultDto stopBuild(ConnectionEntity connection, String jobName, int buildNumber);

    JenkinsBuildLogDto buildLog(
                                ConnectionEntity connection,
                                String jobName,
                                int buildNumber,
                                int start);

    JenkinsQueueResultDto listQueue(ConnectionEntity connection, String jobName);

    JenkinsNodesResultDto listNodes(ConnectionEntity connection);
}
