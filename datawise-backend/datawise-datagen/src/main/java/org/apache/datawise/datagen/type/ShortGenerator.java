package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

public final class ShortGenerator implements IGenerator<Short> {

    @Override
    public Short generateData(String fieldName, GenContext ctx) {
        return (short) (1000 + ctx.rowIndex());
    }
}

