<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${database} 数据库文档</title>
    <style>
        :root {
            --dw-bg: #ffffff;
            --dw-page: #f7f8fa;
            --dw-text: #111827;
            --dw-muted: #6b7280;
            --dw-border: #e5e7eb;
            --dw-primary: #2563eb;
            --dw-code-bg: #f3f4f6;
            --dw-soft: #f8fafc;
        }
        body {
            margin: 0;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.55;
            color: var(--dw-text);
            background: var(--dw-page);
        }
        .page {
            padding: 24px;
            max-width: 1100px;
            margin: 0 auto;
        }
        .hero {
            background: var(--dw-bg);
            border: 1px solid var(--dw-border);
            border-radius: 14px;
            padding: 18px 20px;
            box-shadow: 0 1px 0 rgba(0,0,0,.02);
        }
        h1 { margin: 0 0 6px; font-size: 20px; }
        .meta {
            margin-top: 10px;
            display: flex;
            gap: 18px;
            flex-wrap: wrap;
            color: var(--dw-muted);
            font-size: 13px;
        }
        .chip {
            padding: 6px 10px;
            background: var(--dw-soft);
            border: 1px solid var(--dw-border);
            border-radius: 999px;
        }
        h2 { margin: 18px 0 10px; font-size: 15px; }
        h3 { margin: 14px 0 8px; font-size: 14px; }
        h4 { margin: 12px 0 8px; font-size: 13px; color: var(--dw-muted); }
        code {
            background: var(--dw-code-bg);
            padding: 2px 6px;
            border-radius: 8px;
            font-size: 12px;
        }
        blockquote {
            margin: 8px 0 14px;
            padding: 10px 12px;
            background: #f8fafc;
            border-left: 4px solid #c7d2fe;
            color: #374151;
        }
        .card {
            margin-top: 14px;
            background: var(--dw-bg);
            border: 1px solid var(--dw-border);
            border-radius: 14px;
            padding: 16px 16px;
        }
        .empty-note {
            color: var(--dw-muted);
            font-style: italic;
            font-size: 13px;
        }
        ul { margin: 10px 0; padding-left: 18px; }
        li { margin: 6px 0; }
        table {
            border-collapse: collapse;
            width: 100%;
            font-size: 12px;
        }
        th, td {
            border: 1px solid var(--dw-border);
            padding: 8px 8px;
            vertical-align: top;
        }
        th {
            background: #f9fafb;
            text-align: left;
            color: #111827;
            font-weight: 600;
        }
        tbody tr:nth-child(even) td { background: #fcfcfd; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .muted { color: var(--dw-muted); }
        .section-gap { height: 8px; }
    </style>
</head>
<body>
<div class="page">
    <div class="hero">
        <h1>数据库文档</h1>
        <div class="meta">
            <span class="chip"><b>Database</b>: <code class="mono">${(database!'')?html}</code></span>
            <span class="chip"><b>ConnectionId</b>: <code class="mono">${(connectionId!'')?html}</code></span>
        </div>
    </div>

    <h2>表清单</h2>
    <div class="card">
        <#if tables?size == 0>
            <div class="empty-note">无表或不支持 schema tables 内省</div>
        <#else>
            <ul>
                <#list tables as t>
                    <li>
                        <code class="mono">${(t.tableName!'')?html}</code>
                        <#if t.comment?? && t.comment?has_content>
                            <span class="muted"> — ${(t.comment!'')?html}</span>
                        </#if>
                    </li>
                </#list>
            </ul>
        </#if>
    </div>

    <#if includeDetails && tables?size != 0>
        <h2>表详情</h2>
        <#list tables as t>
            <div class="card">
                <h3><code class="mono">${(t.tableName!'')?html}</code></h3>
                <#if t.comment?? && t.comment?has_content>
                    <blockquote>${(t.comment!'')?html}</blockquote>
                </#if>

                <h4>字段</h4>
                <#if t.columns?size == 0>
                    <div class="empty-note">无字段信息</div>
                <#else>
                    <table>
                        <thead>
                        <tr>
                            <th style="width:60px;">#</th>
                            <th>名称</th>
                            <th style="width:180px;">类型</th>
                            <th style="width:70px;">可空</th>
                            <th style="width:70px;">主键</th>
                            <th>默认值</th>
                            <th style="width:90px;">自增</th>
                            <th>注释</th>
                        </tr>
                        </thead>
                        <tbody>
                        <#list t.columns as c>
                            <tr>
                                <td>${c.ordinal}</td>
                                <td><code class="mono">${(c.name!'')?html}</code></td>
                                <td><span class="mono">${(c.dataType!'')?html}</span></td>
                                <td>${c.nullableYn}</td>
                                <td>${c.keyYn}</td>
                                <td><span class="mono">${(c.defaultValue!'')?html}</span></td>
                                <td>${c.autoIncrementYn}</td>
                                <td>${(c.comment!'')?html}</td>
                            </tr>
                        </#list>
                        </tbody>
                    </table>
                </#if>

                <div class="section-gap"></div>
                <h4>索引</h4>
                <#if t.indexes?size == 0>
                    <div class="empty-note">无索引信息</div>
                <#else>
                    <table>
                        <thead>
                        <tr>
                            <th>名称</th>
                            <th style="width:80px;">唯一</th>
                            <th>列</th>
                        </tr>
                        </thead>
                        <tbody>
                        <#list t.indexes as idx>
                            <tr>
                                <td><code class="mono">${(idx.name!'')?html}</code></td>
                                <td>${idx.uniqueYn}</td>
                                <td><span class="mono">${(idx.columns!'')?html}</span></td>
                            </tr>
                        </#list>
                        </tbody>
                    </table>
                </#if>

                <div class="section-gap"></div>
                <h4>外键</h4>
                <#if t.foreignKeys?size == 0>
                    <div class="empty-note">无外键信息</div>
                <#else>
                    <table>
                        <thead>
                        <tr>
                            <th>名称</th>
                            <th>列</th>
                            <th>引用表</th>
                            <th>引用列</th>
                        </tr>
                        </thead>
                        <tbody>
                        <#list t.foreignKeys as fk>
                            <tr>
                                <td><code class="mono">${(fk.name!'')?html}</code></td>
                                <td><span class="mono">${(fk.columns!'')?html}</span></td>
                                <td><span class="mono">${(fk.referenceTable!'')?html}</span></td>
                                <td><span class="mono">${(fk.referenceColumns!'')?html}</span></td>
                            </tr>
                        </#list>
                        </tbody>
                    </table>
                </#if>
            </div>
        </#list>
    </#if>
</div>
</body>
</html>

