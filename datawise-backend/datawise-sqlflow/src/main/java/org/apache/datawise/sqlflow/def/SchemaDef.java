package org.apache.datawise.sqlflow.def;

import java.util.LinkedList;
import java.util.List;

public class SchemaDef extends Def implements Comparable<SchemaDef>
{

    private List<TableDef> tables = new LinkedList<>();
    private List<String> views = new LinkedList<>();
    private List<String> functions = new LinkedList<>();
    private List<String> userFunctions = new LinkedList<>();
    private List<String> modules = new LinkedList<>();

    /**
     * 需要保留一个空构造方法，否则序列化有问题
     */
    public SchemaDef()
    {
    }

    public SchemaDef(String name)
    {
        this.name = name;
    }

    public SchemaDef(String name, List<TableDef> tables)
    {
        this.name = name;
        this.tables = tables;
    }

    public static SchemaDef build(String name)
    {
        return new SchemaDef(name);
    }

    @Override
    public int compareTo(SchemaDef o)
    {
        return this.name.compareTo(o.getName());
    }
}
