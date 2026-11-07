package org.apache.datawise.backend.server.communityplugin;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class PluginFramedCodecTest {

    @Test
    void roundTripsJsonAndBinaryFrames() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] json = "{\"jsonrpc\":\"2.0\",\"id\":1}".getBytes(StandardCharsets.UTF_8);
        PluginFramedCodec.writeJson(out, json);
        PluginFramedCodec.writeBinary(out, "ssh/terminal/in/s1", new byte[]{1, 2, 3});

        ByteArrayInputStream in = new ByteArrayInputStream(out.toByteArray());
        PluginFramedCodec.Frame first = PluginFramedCodec.readFrame(in);
        assertInstanceOf(PluginFramedCodec.JsonFrame.class, first);
        assertArrayEquals(json, ((PluginFramedCodec.JsonFrame) first).payload());

        PluginFramedCodec.Frame second = PluginFramedCodec.readFrame(in);
        assertInstanceOf(PluginFramedCodec.BinaryFrame.class, second);
        PluginFramedCodec.BinaryFrame binary = (PluginFramedCodec.BinaryFrame) second;
        assertEquals("ssh/terminal/in/s1", binary.channel());
        assertArrayEquals(new byte[]{1, 2, 3}, binary.data());
    }
}
