package org.apache.datawise.backend.ai.analysis.graph.checkpoint;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.serializer.plain_text.gson.GsonStateSerializer;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.ObjectInput;
import java.io.ObjectOutput;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * StateGraph checkpoint 序列化（Gson + 分析图 state factory）。
 * <p>
 * spring-ai-alibaba 默认 {@link GsonStateSerializer} 使用 {@link ObjectOutput#writeUTF(String)}，
 * 单段 payload 不能超过 65535 字节；分析结果集较大时会触发 {@link java.io.UTFDataFormatException}。
 * 本实现改为长度前缀的 UTF-8 字节块，并保留对旧 checkpoint 的读取兼容。
 */
public final class AiAnalysisGsonStateSerializer extends GsonStateSerializer {

    /** 新格式魔数：DWK1 */
    static final int FORMAT_V2 = 0x44574B01;
    static final int MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
    private static final Type MAP_TYPE = new TypeToken<Map<String, Object>>() {
    }.getType();

    public AiAnalysisGsonStateSerializer() {
        super((Map<String, Object> data) -> restoreState(data));
    }

    @Override
    public void write(OverAllState state, ObjectOutput out) throws IOException {
        Map<String, Object> data = new LinkedHashMap<>(state.data());
        redactApiKeys(data);
        String json = gson.toJson(data);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_PAYLOAD_BYTES) {
            throw new IOException("Analysis checkpoint payload too large: " + bytes.length + " bytes");
        }
        out.writeInt(FORMAT_V2);
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    /** Strip LLM apiKey values so file-storage checkpoints never persist secrets. */
    private static void redactApiKeys(Map<String, Object> data) {
        if (data == null || !data.containsKey(AiAnalysisGraphKeys.REQUEST)) {
            return;
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.chatRequest(data.get(AiAnalysisGraphKeys.REQUEST));
        if (request == null) {
            return;
        }
        data.put(AiAnalysisGraphKeys.REQUEST, redactRequest(request));
    }

    private static AiChatRequest redactRequest(AiChatRequest request) {
        return new AiChatRequest(
                request.prompt(),
                request.targets(),
                redactProfile(request.llm()),
                request.analysisContext(),
                request.skipSqlConfirmation(),
                request.disabledAnalysisSteps(),
                request.analysisMode(),
                redactStepLlms(request.stepLlms())
        );
    }

    private static Map<String, AiLlmProfileDto> redactStepLlms(Map<String, AiLlmProfileDto> stepLlms) {
        if (stepLlms == null || stepLlms.isEmpty()) {
            return stepLlms != null ? stepLlms : Map.of();
        }
        Map<String, AiLlmProfileDto> redacted = new LinkedHashMap<>(stepLlms.size());
        for (Map.Entry<String, AiLlmProfileDto> entry : stepLlms.entrySet()) {
            redacted.put(entry.getKey(), redactProfile(entry.getValue()));
        }
        return redacted;
    }

    private static AiLlmProfileDto redactProfile(AiLlmProfileDto profile) {
        if (profile == null) {
            return null;
        }
        return new AiLlmProfileDto(
                profile.provider(),
                profile.baseUrl(),
                null,
                profile.model(),
                profile.temperature(),
                profile.maxTokens(),
                profile.completionsPath()
        );
    }

    @Override
    public OverAllState read(ObjectInput in) throws IOException, ClassNotFoundException {
        int marker = in.readInt();
        if (marker == FORMAT_V2) {
            return readV2Payload(in);
        }
        return readLegacyWriteUtfPayload(in, marker);
    }

    private OverAllState readV2Payload(ObjectInput in) throws IOException {
        int length = in.readInt();
        if (length <= 0 || length > MAX_PAYLOAD_BYTES) {
            throw new IOException("Invalid analysis checkpoint payload length: " + length);
        }
        byte[] bytes = new byte[length];
        in.readFully(bytes);
        return deserializePayload(new String(bytes, StandardCharsets.UTF_8));
    }

    /**
     * 兼容旧版 {@link ObjectOutput#writeUTF(String)}：其流布局为 2 字节长度 + modified UTF-8 正文。
     * 已读出的 4 字节可还原长度前缀与正文起始 2 字节。
     */
    private OverAllState readLegacyWriteUtfPayload(ObjectInput in, int marker) throws IOException {
        int utfLength = (marker >>> 16) & 0xFFFF;
        if (utfLength <= 0 || utfLength > 65_535) {
            throw new IOException("Unsupported analysis checkpoint format marker: " + marker);
        }

        byte[] legacyEnvelope = new byte[2 + utfLength];
        legacyEnvelope[0] = (byte) (utfLength >>> 8);
        legacyEnvelope[1] = (byte) utfLength;
        legacyEnvelope[2] = (byte) ((marker >>> 8) & 0xFF);
        legacyEnvelope[3] = (byte) (marker & 0xFF);

        int remaining = utfLength - 2;
        if (remaining > 0) {
            in.readFully(legacyEnvelope, 4, remaining);
        }

        try (DataInputStream data = new DataInputStream(new ByteArrayInputStream(legacyEnvelope))) {
            return deserializePayload(data.readUTF());
        }
    }

    private OverAllState deserializePayload(String json) {
        JsonElement root = JsonParser.parseString(json);
        if (root.isJsonObject() && root.getAsJsonObject().has("data")) {
            Map<String, Object> data = gson.fromJson(root.getAsJsonObject().get("data"), MAP_TYPE);
            return stateFactory().apply(data);
        }
        Map<String, Object> data = gson.fromJson(json, MAP_TYPE);
        return stateFactory().apply(data);
    }

    private static OverAllState restoreState(Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return new AiAnalysisGraphStateFactory().create();
        }
        return AiAnalysisGraphStateFactory.fromCheckpointData(data);
    }
}
