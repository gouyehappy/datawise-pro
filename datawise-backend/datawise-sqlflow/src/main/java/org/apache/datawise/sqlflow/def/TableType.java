package org.apache.datawise.sqlflow.def;

/**
 * 数据库表类型:视图表、物理表
 */
public enum TableType
{

    /**
     * 物理表
     */
    TABLE(0),

    /**
     * 视图表
     */
    VIEW(1);

    private int index;

    TableType(int idx)
    {
        this.index = idx;
    }

    public int getIndex()
    {
        return index;
    }
}
