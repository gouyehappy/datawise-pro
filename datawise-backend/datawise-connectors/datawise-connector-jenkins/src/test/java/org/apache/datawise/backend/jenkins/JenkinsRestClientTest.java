package org.apache.datawise.backend.jenkins;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JenkinsRestClientTest {

    @Test
    void jobApiPath_encodesNestedFolders() {
        assertEquals("/job/folder/job/my%20job", JenkinsRestClient.jobApiPath("folder/my job"));
        assertEquals("/job/simple", JenkinsRestClient.jobApiPath("simple"));
    }

    @Test
    void viewApiPath_encodesName() {
        assertEquals("/view/%E6%89%80%E6%9C%89", JenkinsRestClient.viewApiPath("所有"));
        assertEquals("/view/apiGateway", JenkinsRestClient.viewApiPath("apiGateway"));
        assertEquals(
                "/view/Ebases%20%E6%8E%A5%E5%8F%A3%E8%87%AA%E5%8A%A8%E5%8C%96",
                JenkinsRestClient.viewApiPath("Ebases 接口自动化")
        );
    }
}
