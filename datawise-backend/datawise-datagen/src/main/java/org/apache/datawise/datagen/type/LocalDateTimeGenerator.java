package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

import java.time.LocalDateTime;

public final class LocalDateTimeGenerator implements IGenerator<LocalDateTime> {

    @Override
    public LocalDateTime generateData(String fieldName, GenContext ctx) {
        int seq = ctx.seq();
        int hour = 10 + (seq % 10);
        int minute = (seq * 7) % 60;
        return LocalDateTime.of(2024, 1, 15, hour, minute, 0);
    }
}

