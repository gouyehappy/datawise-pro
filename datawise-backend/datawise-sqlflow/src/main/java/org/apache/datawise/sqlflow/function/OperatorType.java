package org.apache.datawise.sqlflow.function;

public enum OperatorType
{
    ADD("+", 2),
    SUBTRACT("-", 2),
    MULTIPLY("*", 2),
    DIVIDE("/", 2),
    MODULUS("%", 2),
    NEGATION("-", 1),
    EQUAL("=", 2),
    /**
     * Normal comparison operator, but unordered values such as NaN are placed after all normal values.
     */
    COMPARISON_UNORDERED_LAST("COMPARISON_UNORDERED_LAST", 2),
    /**
     * Normal comparison operator, but unordered values such as NaN are placed before all normal values.
     */
    COMPARISON_UNORDERED_FIRST("COMPARISON_UNORDERED_FIRST", 2),
    LESS_THAN("<", 2),
    LESS_THAN_OR_EQUAL("<=", 2),
    CAST("CAST", 1),
    SUBSCRIPT("[]", 2),
    HASH_CODE("HASH CODE", 1),
    SATURATED_FLOOR_CAST("SATURATED FLOOR CAST", 1),
    IS_DISTINCT_FROM("IS DISTINCT FROM", 2),
    XX_HASH_64("XX HASH 64", 1),
    INDETERMINATE("INDETERMINATE", 1);

    private final String operator;
    private final int argumentCount;

    OperatorType(String operator, int argumentCount)
    {
        this.operator = operator;
        this.argumentCount = argumentCount;
    }

    public String getOperator()
    {
        return operator;
    }

    public int getArgumentCount()
    {
        return argumentCount;
    }
}
