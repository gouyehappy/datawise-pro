package org.apache.datawise.backend.service.portability;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Zip encode/decode helpers for profile portability packages. */
final class ProfilePackageZipCodec {

    private ProfilePackageZipCodec() {
    }

    static String peekText(byte[] bytes) {
        int limit = Math.min(bytes.length, 512);
        if (limit >= 2 && (bytes[0] & 0xFF) == 0x50 && (bytes[1] & 0xFF) == 0x4B) {
            return null; // ZIP magic
        }
        return new String(bytes, 0, limit, StandardCharsets.UTF_8);
    }

    static Map<String, byte[]> unzip(byte[] packageBytes) throws IOException {
        Map<String, byte[]> files = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(packageBytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = entry.getName().replace('\\', '/');
                if (name.contains("..")) {
                    throw new IOException("zip entry escapes: " + name);
                }
                files.put(name, zip.readAllBytes());
            }
        }
        return files;
    }

    static byte[] zipEntries(Map<String, byte[]> entries) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bos)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return bos.toByteArray();
    }
}
