package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

public final class NullGenerator implements IGenerator<Object> {

    @Override
    public Object generateData(String fieldName, GenContext ctx) {
        return null;
    }
}

