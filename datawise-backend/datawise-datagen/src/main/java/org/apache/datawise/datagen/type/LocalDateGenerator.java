package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

import java.time.LocalDate;

public final class LocalDateGenerator implements IGenerator<LocalDate> {

    @Override
    public LocalDate generateData(String fieldName, GenContext ctx) {
        int seq = ctx.seq();
        return LocalDate.of(2024, 1, (seq % 28) + 1);
    }
}

