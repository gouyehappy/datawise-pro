package org.apache.datawise.datagen.type;

import net.datafaker.Faker;
import org.apache.datawise.datagen.type.base.IGenerator;
import org.junit.jupiter.api.Test;

import java.util.Locale;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TypeGeneratorRegistryTest {

    @Test
    void resolveJsonTypeShouldGenerateValidJsonText() {
        IGenerator<?> generator = TypeGeneratorRegistry.resolve("json", "tag_schema");
        GenContext ctx = new GenContext(new Faker(new Locale("zh", "CN"), new Random(1L)), new Random(1L));
        ctx.setRowIndex(0);

        Object value = generator.generateData("tag_schema", ctx);

        assertTrue(value instanceof String);
        String text = (String) value;
        assertTrue(text.startsWith("{") && text.endsWith("}"));
        assertTrue(text.contains("\"tag_schema\""));
        assertTrue(text.contains("\"seq\":1"));
        assertEquals("{\"tag_schema\":\"value-1\",\"seq\":1,\"enabled\":false}", text);
    }
}
