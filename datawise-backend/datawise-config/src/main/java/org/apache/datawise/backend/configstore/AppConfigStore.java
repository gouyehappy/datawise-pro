package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.app.AppConfigSections;
import org.apache.datawise.backend.security.AppConfigSecrets;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.apache.datawise.backend.common.support.XmlConfigSupport;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class AppConfigStore {

    private static final Logger log = LoggerFactory.getLogger(AppConfigStore.class);

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final SecretValueCodec secretValueCodec;

    public AppConfigStore(
                          ConfigDirectoryService configDirectory,
                          ObjectMapper objectMapper,
                          SecretValueCodec secretValueCodec) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.secretValueCodec = secretValueCodec;
    }

    public Optional<Map<String, Object>> readAppConfig() {
        var path = configDirectory.resolve(ConfigPaths.APP);
        if (!XmlConfigSupport.isRegularFile(path)) {
            return Optional.empty();
        }
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            quarantineCorruptConfig(path);
            return Optional.empty();
        }
        try {
            Document document = XmlConfigSupport.readDocument(path);
            Map<String, Object> config = AppConfigSections.mapFromDocument(objectMapper, document);
            AppConfigSecrets.decryptAiSection(config, secretValueCodec);
            return Optional.of(config);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.app.parse path=" + path, ex);
            quarantineCorruptConfig(path);
            return Optional.empty();
        }
    }

    public synchronized void writeAppConfig(Map<String, Object> config) throws Exception {
        configDirectory.ensureExists();
        var path = configDirectory.resolve(ConfigPaths.APP);
        Map<String, Object> toWrite = AppConfigSections.deepCopy(config);
        readAppConfig().ifPresent(existing -> AppConfigSecrets.preserveBlankSecrets(toWrite, existing));
        AppConfigSecrets.encryptAiSection(toWrite, secretValueCodec);
        Document document = XmlConfigSupport.newDocument();
        AppConfigSections.writeToDocument(objectMapper, document, toWrite);
        XmlConfigSupport.writeDocument(path, document);
    }

    public String readAppConfigXml() throws Exception {
        var path = configDirectory.resolve(ConfigPaths.APP);
        if (!XmlConfigSupport.isRegularFile(path)) {
            return null;
        }
        return XmlConfigSupport.readUtf8(path);
    }

    public void writeAppConfigXml(String xml) throws Exception {
        if (xml == null || xml.isBlank()) {
            return;
        }
        var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        Document document;
        try {
            document = factory.newDocumentBuilder()
                    .parse(new java.io.ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid XML", ex);
        }
        Map<String, Object> config = AppConfigSections.mapFromDocument(objectMapper, document);
        AppConfigSecrets.decryptAiSection(config, secretValueCodec);
        writeAppConfig(config);
    }

    public synchronized int migratePlaintextSecretsIfNeeded() throws Exception {
        var path = configDirectory.resolve(ConfigPaths.APP);
        if (!XmlConfigSupport.isRegularFile(path)) {
            return 0;
        }
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            quarantineCorruptConfig(path);
            return 0;
        }
        try {
            Document document = XmlConfigSupport.readDocument(path);
            Map<String, Object> config = AppConfigSections.mapFromDocument(objectMapper, document);
            int plaintextKeys = AppConfigSecrets.countPlaintextApiKeys(config, secretValueCodec);
            if (plaintextKeys == 0) {
                return 0;
            }
            writeAppConfig(config);
            return plaintextKeys;
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.app.migrateSecrets path=" + path, ex);
            quarantineCorruptConfig(path);
            return 0;
        }
    }

    public Optional<Map<String, Object>> readSqlSnippets(String layer) {
        String filename = resolveSnippetPath(layer);
        var path = configDirectory.resolve(filename);
        if (!XmlConfigSupport.isRegularFile(path)) {
            return Optional.empty();
        }
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            quarantineCorruptSqlSnippets(path);
            return Optional.empty();
        }
        try {
            return readSnippetPayload(path);
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.sqlSnippets.parse file=" + filename + " path=" + path, ex);
            quarantineCorruptSqlSnippets(path);
            return Optional.empty();
        }
    }

    public void writeSqlSnippets(String layer, Map<String, Object> payload) throws Exception {
        configDirectory.ensureExists();
        String filename = resolveSnippetPath(layer);
        var path = configDirectory.resolve(filename);
        Document document = XmlConfigSupport.newDocument();
        Element root = document.createElement("datawise-sql-snippets");
        root.setAttribute("layer", layer);
        document.appendChild(root);
        XmlConfigSupport.appendCdataElement(document, root, "payload", objectMapper.writeValueAsString(payload));
        XmlConfigSupport.writeDocument(path, document);
    }

    public Map<String, Object> readUpdaterPreferences() {
        var path = configDirectory.resolve(ConfigPaths.UPDATER);
        if (!XmlConfigSupport.isRegularFile(path)) {
            return defaultUpdaterPreferences();
        }
        if (!XmlConfigSupport.hasUsableXmlContent(path)) {
            quarantineCorruptConfig(path);
            return defaultUpdaterPreferences();
        }
        try {
            Document document = XmlConfigSupport.readDocument(path);
            Element root = XmlConfigSupport.rootElement(document);
            Map<String, Object> prefs = new LinkedHashMap<>();
            prefs.put("notifyOnUpdate", XmlConfigSupport.childBoolean(root, "notify-on-update", true));
            prefs.put("autoDownload", XmlConfigSupport.childBoolean(root, "auto-download", true));
            return prefs;
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.updater.parse path=" + path, ex);
            quarantineCorruptConfig(path);
            return defaultUpdaterPreferences();
        }
    }

    public void writeUpdaterPreferences(Map<String, Object> prefs) throws Exception {
        configDirectory.ensureExists();
        var path = configDirectory.resolve(ConfigPaths.UPDATER);
        Document document = XmlConfigSupport.newDocument();
        Element root = document.createElement("datawise-updater");
        document.appendChild(root);
        boolean notify = prefs.get("notifyOnUpdate") instanceof Boolean value ? value : true;
        boolean autoDownload = prefs.get("autoDownload") instanceof Boolean value ? value : true;
        XmlConfigSupport.appendTextElement(document, root, "notify-on-update", String.valueOf(notify));
        XmlConfigSupport.appendTextElement(document, root, "auto-download", String.valueOf(autoDownload));
        XmlConfigSupport.writeDocument(path, document);
    }

    private String resolveSnippetPath(String layer) {
        if ("shared".equals(layer)) {
            return TenantScopedConfigSupport.ensureCurrentSharedSqlSnippetsPath(configDirectory);
        }
        return ConfigPaths.SQL_SNIPPETS_PERSONAL;
    }

    private static Map<String, Object> defaultUpdaterPreferences() {
        Map<String, Object> prefs = new LinkedHashMap<>();
        prefs.put("notifyOnUpdate", true);
        prefs.put("autoDownload", true);
        return prefs;
    }

    private Optional<Map<String, Object>> readSnippetPayload(Path path) throws Exception {
        Document document = XmlConfigSupport.readDocument(path);
        Element root = XmlConfigSupport.rootElement(document);
        String json = XmlConfigSupport.childText(root, "payload");
        if (json == null || json.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
        }));
    }

    private void quarantineCorruptSqlSnippets(java.nio.file.Path path) {
        try {
            java.nio.file.Path backup = XmlConfigSupport.quarantineCorruptFile(path);
            if (backup != null) {
                log.warn("Quarantined corrupt sql snippets: {} -> {}", path, backup);
            }
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.sqlSnippets.quarantine path=" + path, ex);
        }
    }

    private void quarantineCorruptConfig(java.nio.file.Path path) {
        try {
            java.nio.file.Path backup = XmlConfigSupport.quarantineCorruptFile(path);
            if (backup != null) {
                log.warn("Quarantined corrupt app config: {} -> {}", path, backup);
            }
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "config.app.quarantine path=" + path, ex);
        }
    }
}
