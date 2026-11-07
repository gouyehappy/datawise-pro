package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

import java.time.LocalTime;

public final class LocalTimeGenerator implements IGenerator<LocalTime> {

    @Override
    public LocalTime generateData(String fieldName, GenContext ctx) {
        int seq = ctx.seq();
        int second = seq % 60;
        int minute = (seq * 7) % 60;
        return LocalTime.of(10, minute, second);
    }
}

