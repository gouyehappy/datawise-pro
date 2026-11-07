package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

public final class BooleanGenerator implements IGenerator<Boolean> {

    @Override
    public Boolean generateData(String fieldName, GenContext ctx) {
        return ctx.rowIndex() % 2 == 0;
    }
}

