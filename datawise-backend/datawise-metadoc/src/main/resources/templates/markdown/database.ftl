# 数据库文档

- **Database**: ${database}
- **ConnectionId**: ${connectionId}

## 表清单

<#if tables?size == 0>
_无表或不支持 schema tables 内省_
<#else>
<#list tables as t>
- \`${t.tableName}\`<#if t.comment?? && t.comment?has_content> — ${t.comment}</#if>
</#list>
</#if>

<#if includeDetails && tables?size != 0>
## 表详情
<#list tables as t>
### \`${t.tableName}\`
<#if t.comment?? && t.comment?has_content>
> ${t.comment}
</#if>

#### 字段
<#if t.columns?size == 0>
_无字段信息_
<#else>
| # | 名称 | 类型 | 可空 | 主键 | 默认值 | 自增 | 注释 |
|---:|---|---|:---:|:---:|---|:---:|---|
<#list t.columns as c>
| ${c.ordinal} | \`${c.nameMd}\` | ${c.dataTypeMd} | ${c.nullableYn} | ${c.keyYn} | ${c.defaultValueMd} | ${c.autoIncrementYn} | ${c.commentMd} |
</#list>
</#if>

#### 索引
<#if t.indexes?size == 0>
_无索引信息_
<#else>
| 名称 | 唯一 | 列 |
|---|:---:|---|
<#list t.indexes as idx>
| \`${idx.nameMd}\` | ${idx.uniqueYn} | ${idx.columnsMd} |
</#list>
</#if>

#### 外键
<#if t.foreignKeys?size == 0>
_无外键信息_
<#else>
| 名称 | 列 | 引用表 | 引用列 |
|---|---|---|---|
<#list t.foreignKeys as fk>
| \`${fk.nameMd}\` | ${fk.columnsMd} | ${fk.referenceTableMd} | ${fk.referenceColumnsMd} |
</#list>
</#if>

<#-- spacer -->

</#list>
</#if>

