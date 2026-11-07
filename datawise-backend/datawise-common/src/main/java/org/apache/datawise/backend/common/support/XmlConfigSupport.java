package org.apache.datawise.backend.common.support;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;

public final class XmlConfigSupport {

    private XmlConfigSupport() {
    }

    public static Document newDocument() throws Exception {
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
    }

    public static Document readDocument(Path path) throws Exception {
        var factory = secureDocumentBuilderFactory();
        try (var input = Files.newInputStream(path)) {
            return factory.newDocumentBuilder().parse(input);
        }
    }

    public static Document readDocumentFromString(String xml) throws Exception {
        if (xml == null || xml.isBlank()) {
            throw new IllegalArgumentException("xml is required");
        }
        var factory = secureDocumentBuilderFactory();
        try (var input = new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8))) {
            return factory.newDocumentBuilder().parse(input);
        }
    }

    private static DocumentBuilderFactory secureDocumentBuilderFactory() throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory;
    }

    public static void writeDocument(Path path, Document document) throws Exception {
        Path parent = path.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        String xml = documentToString(document);
        Path temp = Files.createTempFile(
                parent != null ? parent : path.toAbsolutePath().getParent(),
                path.getFileName().toString() + ".",
                ".tmp");
        try {
            Files.writeString(temp, xml, StandardCharsets.UTF_8);
            AtomicFileWrites.moveReplace(temp, path);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    public static String documentToString(Document document) throws Exception {
        var transformer = TransformerFactory.newInstance().newTransformer();
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");
        var writer = new StringWriter();
        transformer.transform(new DOMSource(document), new StreamResult(writer));
        return writer.toString();
    }

    public static Element rootElement(Document document) {
        return document.getDocumentElement();
    }

    public static String childText(Element parent, String tagName) {
        NodeList nodes = parent.getElementsByTagName(tagName);
        if (nodes.getLength() == 0) {
            return null;
        }
        Node node = nodes.item(0);
        return node.getTextContent();
    }

    public static boolean childBoolean(Element parent, String tagName, boolean fallback) {
        String text = childText(parent, tagName);
        if (text == null || text.isBlank()) {
            return fallback;
        }
        return Boolean.parseBoolean(text.trim());
    }

    public static Element appendTextElement(Document document, Element parent, String tagName, String value) {
        Element element = document.createElement(tagName);
        element.setTextContent(value);
        parent.appendChild(element);
        return element;
    }

    public static Element appendCdataElement(Document document, Element parent, String tagName, String json) {
        Element element = document.createElement(tagName);
        element.setAttribute("format", "json");
        element.appendChild(document.createCDATASection(json));
        parent.appendChild(element);
        return element;
    }

    public static boolean isRegularFile(Path path) {
        return Files.isRegularFile(path);
    }

    /** 存在且含非空白内容，避免对空文件 parse 触发 Premature end of file */
    public static boolean hasUsableXmlContent(Path path) {
        if (!isRegularFile(path)) {
            return false;
        }
        try {
            return !Files.readString(path, StandardCharsets.UTF_8).trim().isEmpty();
        } catch (IOException ex) {
            return false;
        }
    }

    /** 将损坏的配置移到同目录 `.corrupt-{epoch}` 备份，便于人工恢复 */
    public static Path quarantineCorruptFile(Path path) throws IOException {
        if (!isRegularFile(path)) {
            return null;
        }
        String fileName = path.getFileName().toString();
        Path backup = path.resolveSibling(fileName + ".corrupt-" + Instant.now().toEpochMilli());
        return Files.move(path, backup, StandardCopyOption.REPLACE_EXISTING);
    }

    public static String readUtf8(Path path) throws IOException {
        return Files.readString(path, StandardCharsets.UTF_8);
    }
}
