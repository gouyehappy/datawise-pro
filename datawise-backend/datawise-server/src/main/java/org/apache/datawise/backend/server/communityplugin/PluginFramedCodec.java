package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * DBX-compatible sidecar framing (stdio-framed).
 *
 * <pre>
 * frame = kind(u8) + length(u32 BE) + payload
 *   kind 0 = JSON-RPC bytes
 *   kind 1 = binary: channelLen(u16 BE) + channel UTF-8 + data
 * </pre>
 */
public final class PluginFramedCodec {

    public static final byte KIND_JSON = 0;
    public static final byte KIND_BINARY = 1;
    public static final int MAX_JSON_BYTES = 8 * 1024 * 1024;
    public static final int MAX_BINARY_BYTES = 64 * 1024 * 1024;

    private PluginFramedCodec() {
    }

    public sealed interface Frame permits JsonFrame, BinaryFrame {
    }

    public record JsonFrame(byte[] payload) implements Frame {
        public JsonFrame {
            payload = payload != null ? payload : new byte[0];
        }
    }

    public record BinaryFrame(String channel, byte[] data) implements Frame {
        public BinaryFrame {
            channel = channel != null ? channel : "";
            data = data != null ? data : new byte[0];
        }
    }

    public static void writeJson(OutputStream out, byte[] jsonUtf8) throws IOException {
        if (jsonUtf8 == null) {
            jsonUtf8 = new byte[0];
        }
        if (jsonUtf8.length > MAX_JSON_BYTES) {
            throw new CommunityPluginException("JSON frame exceeds " + MAX_JSON_BYTES + " bytes");
        }
        writeFrame(out, KIND_JSON, jsonUtf8);
    }

    public static void writeBinary(OutputStream out, String channel, byte[] data) throws IOException {
        if (channel == null || channel.isBlank() || channel.length() > 256 || channel.chars().anyMatch(Character::isWhitespace)) {
            throw new CommunityPluginException("Invalid binary channel name");
        }
        if (data == null) {
            data = new byte[0];
        }
        if (data.length > MAX_BINARY_BYTES) {
            throw new CommunityPluginException("Binary frame exceeds " + MAX_BINARY_BYTES + " bytes");
        }
        byte[] channelBytes = channel.getBytes(StandardCharsets.UTF_8);
        if (channelBytes.length > 0xFFFF) {
            throw new CommunityPluginException("Binary channel is too long");
        }
        byte[] payload = new byte[2 + channelBytes.length + data.length];
        payload[0] = (byte) ((channelBytes.length >> 8) & 0xFF);
        payload[1] = (byte) (channelBytes.length & 0xFF);
        System.arraycopy(channelBytes, 0, payload, 2, channelBytes.length);
        System.arraycopy(data, 0, payload, 2 + channelBytes.length, data.length);
        writeFrame(out, KIND_BINARY, payload);
    }

    public static Frame readFrame(InputStream in) throws IOException {
        byte[] header = in.readNBytes(5);
        if (header.length == 0) {
            return null;
        }
        if (header.length < 5) {
            throw new EOFException("Incomplete plugin frame header");
        }
        byte kind = header[0];
        int length = ((header[1] & 0xFF) << 24)
                | ((header[2] & 0xFF) << 16)
                | ((header[3] & 0xFF) << 8)
                | (header[4] & 0xFF);
        int maximum = kind == KIND_JSON ? MAX_JSON_BYTES : MAX_BINARY_BYTES + 1024;
        if (length < 0 || length > maximum) {
            throw new CommunityPluginException("Plugin frame length out of range: " + length);
        }
        byte[] payload = in.readNBytes(length);
        if (payload.length < length) {
            throw new EOFException("Incomplete plugin frame payload");
        }
        return switch (kind) {
            case KIND_JSON -> new JsonFrame(payload);
            case KIND_BINARY -> parseBinaryPayload(payload);
            default -> throw new CommunityPluginException("Unknown plugin frame kind: " + kind);
        };
    }

    private static BinaryFrame parseBinaryPayload(byte[] payload) {
        if (payload.length < 2) {
            throw new CommunityPluginException("Invalid binary frame");
        }
        int channelLen = ((payload[0] & 0xFF) << 8) | (payload[1] & 0xFF);
        if (channelLen <= 0 || payload.length < 2 + channelLen) {
            throw new CommunityPluginException("Invalid binary channel");
        }
        String channel = new String(payload, 2, channelLen, StandardCharsets.UTF_8);
        byte[] data = Arrays.copyOfRange(payload, 2 + channelLen, payload.length);
        return new BinaryFrame(channel, data);
    }

    private static void writeFrame(OutputStream out, byte kind, byte[] payload) throws IOException {
        out.write(kind);
        int len = payload.length;
        out.write((len >>> 24) & 0xFF);
        out.write((len >>> 16) & 0xFF);
        out.write((len >>> 8) & 0xFF);
        out.write(len & 0xFF);
        out.write(payload);
        out.flush();
    }
}
