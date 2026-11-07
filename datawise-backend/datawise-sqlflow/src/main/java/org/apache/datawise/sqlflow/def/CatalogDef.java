package org.apache.datawise.sqlflow.def;

import java.util.ArrayList;
import java.util.List;

public class CatalogDef extends Def
{

    List<SchemaDef> schemas = new ArrayList<>();

    public CatalogDef()
    {
    }

    public CatalogDef(String name)
    {
        this.name = name;
    }

    public CatalogDef(String name, List<SchemaDef> schemas)
    {
        this.name = name;
        this.schemas = schemas;
    }

    public static CatalogDef build(String name)
    {
        return new CatalogDef(name);
    }
}
