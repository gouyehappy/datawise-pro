package org.apache.datawise.community.jenkins;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JenkinsClientPathTest {

    @Test
    void jobApiPathEncodesFolders() {
        assertEquals("/job/foo", JenkinsClient.jobApiPath("foo"));
        assertEquals("/job/folder/job/bar", JenkinsClient.jobApiPath("folder/bar"));
        assertEquals("/job/folder/job/bar", JenkinsClient.jobApiPath("/folder/bar/"));
    }

    @Test
    void jobApiPathRejectsBlank() {
        assertThrows(IllegalArgumentException.class, () -> JenkinsClient.jobApiPath("  "));
    }

    @Test
    void viewApiPath() {
        assertEquals("/view/All", JenkinsClient.viewApiPath("All"));
    }

    @Test
    void isFolderDetectsClassAndChildren() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        assertTrue(JenkinsClient.isFolder(mapper.readTree("{\"_class\":\"com.cloudbees.hudson.plugins.folder.Folder\",\"jobs\":[]}")));
        assertTrue(JenkinsClient.isFolder(mapper.readTree("{\"name\":\"f\",\"jobs\":[{\"name\":\"a\"}]}")));
    }
}
