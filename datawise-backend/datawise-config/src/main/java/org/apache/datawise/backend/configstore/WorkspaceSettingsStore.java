package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import java.io.IOException;
import java.nio.file.Path;

@Service
public class WorkspaceSettingsStore {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceSettingsStore.class);

    private final ConfigDirectoryService configDirectory;

    public WorkspaceSettingsStore(ConfigDirectoryService configDirectory) {
        this.configDirectory = configDirectory;
    }

    public String readScriptsDir(String defaultScriptsDir) {
        Path settingsPath = configDirectory.resolve(ConfigPaths.WORKSPACE);
        if (!XmlConfigSupport.isRegularFile(settingsPath)) {
            return defaultScriptsDir;
        }
        try {
            Document document = XmlConfigSupport.readDocument(settingsPath);
            Element rootElement = XmlConfigSupport.rootElement(document);
            String scriptsDir = XmlConfigSupport.childText(rootElement, "scripts-dir");
            if (scriptsDir != null && !scriptsDir.isBlank()) {
                return scriptsDir.trim();
            }
        } catch (Exception ex) {
            ExceptionLogging.recoverable(log, "Failed to read scripts-dir from workspace settings", ex);
        }
        return defaultScriptsDir;
    }

    public void writeScriptsDir(String scriptsDir) throws IOException {
        configDirectory.ensureExists();
        Path settingsPath = configDirectory.resolve(ConfigPaths.WORKSPACE);
        try {
            Document document = XmlConfigSupport.newDocument();
            Element rootElement = document.createElement("datawise-workspace");
            document.appendChild(rootElement);
            XmlConfigSupport.appendTextElement(document, rootElement, "scripts-dir", scriptsDir);
            XmlConfigSupport.writeDocument(settingsPath, document);
        } catch (Exception ex) {
            throw new IOException("Failed to persist " + ConfigPaths.WORKSPACE, ex);
        }
    }
}
