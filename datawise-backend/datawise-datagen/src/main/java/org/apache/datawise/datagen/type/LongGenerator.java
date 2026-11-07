package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

public final class LongGenerator implements IGenerator<Long> {

    @Override
    public Long generateData(String fieldName, GenContext ctx) {
        return 1000L + ctx.rowIndex();
    }
}

