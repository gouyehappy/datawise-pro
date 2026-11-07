package org.apache.datawise.sqlflow.def;

import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public class ColumnDef extends Def implements Comparable<ColumnDef>, Cloneable
{

    private String label;

    private String type;

    private Integer fieldType;
    private Boolean primaryKey = false;

    private ColumnType javaType;

    private Integer displaySize;
    private Integer scaleSize;
    private Integer precisionSize;

    private Boolean autoIncrement;
    private Boolean nullable = true;
    private String defaultValue;

    /**
     * 字符集
     */
    private String characterSet;
    /**
     * 排序规则
     */
    private String collation;

    private Boolean signed = false;

    private String comment;

    public ColumnDef(String name)
    {
        this.name = name;
    }

    @Override
    public int compareTo(ColumnDef o)
    {
        return this.name.compareTo(o.getName());
    }

    @Override
    public ColumnDef clone()
    {
        try {
            return (ColumnDef) super.clone();
        } catch (CloneNotSupportedException e) {
            throw new AssertionError();
        }
    }
}
