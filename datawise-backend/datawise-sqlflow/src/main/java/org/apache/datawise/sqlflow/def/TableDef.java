package org.apache.datawise.sqlflow.def;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Date;
import java.util.List;

@EqualsAndHashCode(callSuper = true)
@Data
public class TableDef extends Def implements Comparable<TableDef>, Cloneable
{

    private CatalogDef catalog;
    private SchemaDef schema;

    private String comment;

    private TableType tableType;
    private String type;

    private String engine;
    private String options;

    private List<ColumnDef> columns;

    /**
     * 表的记录数
     */
    private Long rows;
    private Date createTime;
    private Date updateTime;

    @Override
    public int compareTo(TableDef o)
    {
        return this.name.compareTo(o.getName());
    }

}
