# DataWise 全产品代码审查 · 缺陷台账

> **生成日期**：2026-11-17
> **审查范围**：后端 15 个 Maven 模块（约 25.6 万行 Java）、前端（约 33.8 万行 TS/Vue）、桌面端、MCP、CLI、VSCode、插件生态
> **审查方式**：静态只读审查，180+ 核心类逐个阅读；关键 P0/P1 缺陷已做文件与行号交叉验证
> **缺陷总数**：76 项
> **配套报告**：`CODE_REVIEW_REPORT.html`（概览与重构路线图）
> **配套表格**：`CODE_REVIEW_DEFECTS.csv`（可用 Excel/表格工具筛选与批量改状态）

---

## 一、状态总览

> **2026-11-17 复验更新**：经独立复核（详见第五节与 `CODE_REVIEW_VERIFICATION.html`），13 项维持「部分修复」；FE-07 拆分引入的工具栏 CSS 回归已在 `47b772f` 收口，FE-07 仍标「已修复」。下表为复验后状态。

| 模块 | 总数 | P0 | P1 | P2 | P3 | 已修复 | 部分修复 | 待修复 | 已验证 |
|------|------|----|----|----|----|--------|----------|--------|--------|
| DataAgent（AI-xx） | 19 | 2 | 4 | 8 | 5 | 17 | 2（AI-08/15） | 0 | 0 |
| 安全鉴权（SEC-xx） | 13 | 2 | 2 | 5 | 4 | 10 | 3（SEC-05/10/11） | 0 | 0 |
| 连接器/数据库（DB-xx） | 17 | 3 | 2 | 10 | 2 | 13 | 4（DB-05/12/13/15） | 0 | 0 |
| 前端（FE-xx） | 13 | 0 | 2 | 6 | 5 | 13 | 0 | 0 | 0 |
| 桌面/生态（DT-xx） | 14 | 4 | 0 | 7 | 3 | 10 | 4（DT-02/03/04/13） | 0 | 0 |
| **合计** | **76** | **11** | **10** | **36** | **19** | **63** | **13** | **0** | **0** |

## 二、状态定义

| 状态 | 含义 |
|------|------|
| 待修复 | 已确认的缺陷，尚未开始处理（初始状态） |
| 修复中 | 已分配并正在修复 |
| 已修复 | 代码已修改，等待验证 |
| 部分修复 | 核心问题已处理，但存在明确未落实项或引入新问题（复验后新增） |
| 已验证 | 修复已通过测试/回归验证，可关闭 |
| 暂缓 | 认可但当前版本不处理（如依赖升级、架构调整） |
| 不修复 | 经评估接受现状（如有明确的兼容性/成本理由） |

严重度：**P0** 可组合成 RCE / 大规模凭据泄露 / 越权写操作 · **P1** 高危，需尽快修复 · **P2** 中危，有明确利用路径 · **P3** 低危/纵深防御加固

---

## 三、缺陷明细

### 模块一：DataAgent（datawise-ai）· 19 项

| ID | 严重度 | 状态 | 缺陷标题 | 代码位置 |
|----|--------|------|----------|----------|
| AI-01 | P0 | 已修复 | 一次性写入授权未与实际执行 SQL 绑定，可"张冠李戴"越权执行 | AgentWriteGrantService.java:63-91 · AiAnalysisGraphRunner.java:88-131 |
| AI-02 | P0 | 已修复 | skipSqlConfirmation 由客户端可控，可绕过 HITL 与写授权 | AiAnalysisGraphRunner.java:73-75 · AiChatRequest.java:13 · AnalysisCanvasPipelineService.java:57-66 |
| AI-03 | P1 | 已修复 | 一次性授权消费存在 TOCTOU 竞态，可并发重放 | AgentWriteGrantService.java:68-87 |
| AI-04 | P1 | 已修复 | LLM 路由 JSON 用 lastIndexOf 贪婪截断，尾部文本吞掉 JSON | AiAnalysisStepRouteService.java:161-169 |
| AI-05 | P1 | 已修复 | SQL 只读校验用关键词正则，误杀大量合法 SQL | AiSqlSafetyChecker.java:13-18,46 |
| AI-06 | P2 | 已修复 | Prompt 模板对失败 SQL/错误日志未限长，token 膨胀 | AiSqlPromptTemplates.java:127-134,166 · AiAnalysisPromptTemplates.java:75-80 |
| AI-07 | P1 | 已修复 | 全局 LLM 熔断器跨租户共享，单个用户坏配置阻断所有用户 | AiLlmCallPolicy.java:25-26,100-130 |
| AI-08 | P2 | 部分修复 | grant Map 无过期/已消费清理，内存泄漏 | AgentWriteGrantService.java:28,56,86-87 |
| AI-09 | P2 | 已修复 | AiSchemaCache.getOrLoad 非原子，缓存击穿且可覆盖新值 | AiSchemaCache.java:30-43 |
| AI-10 | P2 | 已修复 | RAG 索引重建 inFlight 判定非原子，可重复重建 | AiKnowledgeIndexRebuildCoordinator.java:51,69 |
| AI-11 | P2 | 已修复 | LLM 响应体无上限读取，存在 OOM 面 | AiLlmGateway.java:203-209 |
| AI-12 | P2 | 已修复 | 推理模型兜底可能把思维链当作最终答案 | AiChatCompletionTextExtractor.java:41-55,124-134 |
| AI-13 | P2 | 已修复 | 重试路由 off-by-one，实际重试次数比配置多一次 | AiAnalysisValidateRouter.java:27-31 · AiAnalysisPythonRouter.java:27-31 |
| AI-14 | P3 | 已修复 | SQL 规范化强制"行首 SELECT/WITH"，边界脆弱 | AiSqlNormalizer.java:32-72 |
| AI-15 | P3 | 部分修复 | 流式响应未对 delta 去 markdown 代码围栏 | AiLlmGateway.java:355-357,368 |
| AI-16 | P3 | 已修复 | Python 代码生成 jsonString 转义不完整 | AnalysisPythonGenerator.java:49-54 |
| AI-17 | P3 | 已修复 | 语义校验在别名无法解析时静默跳过列检查 | AiSqlSemanticChecker.java:96-106 |
| AI-18 | P3 | 已修复 | checkpoint 旧格式兼容分支数组越界 | AiAnalysisGsonStateSerializer.java:137-145 |
| AI-19 | P2 | 已修复 | grant issue 与 consume 的会话一致性缺口 | AgentWriteGrantService.java:30-61 |

**问题与修复建议**

- **AI-01**：`consume()` 只校验请求中的 `confirmedSql` 字符串等于发授权时的字符串且用户一致，但不校验该 threadId 对应检查点的 `SAFE_SQL` 是否等于 `confirmedSql`，也不校验 grant 的 connectionId/database 与会话作用域一致。可为无害 SQL_A 申请授权，再在 resume 时对会话 B 执行危险 SQL_B。**修复**：resume 中用 `compiledGraph.getState(config)` 取出 SAFE_SQL 与 confirmedSql 规范化后严格比对；IssueRequest 携带 threadId；grant 由服务端在 detectInterrupt 时结合 threadId/checkpointId 直接签发。
- **AI-02**：`/api/ai/analyze/stream` 的 `skipSqlConfirmation` 是请求体布尔字段，客户端传 true 即可跳过 SQL 确认与 grant 消费，服务端无二次判定。**修复**：改为服务端派生值（基于模式/租户配置/用户权限），禁止信任客户端布尔；内部画布走独立白名单。
- **AI-03**：`get → 检查 consumed → put` 非原子，并发 resume 使用同一 grantId 时可双双通过。**修复**：改用 `computeIfPresent` 原子 CAS，或消费成功后直接 `remove`。
- **AI-04**：`indexOf('{') + lastIndexOf('}')` 截取，LLM 输出带尾部文本或多个 JSON 对象时解析失败并被静默降级为 mockRoute。**修复**：用 Jackson JsonParser 顺序解析首个完整对象；降级时打 WARN 并记录原始响应片段。
- **AI-05**：正则在含字符串字面量的整个 SQL 上匹配，`SELECT REPLACE(col,...)`、字面量 `'delete'`、名为 call/exec 的列都被误判为写操作，触发无意义 LLM 重试。**修复**：先剥离字符串字面量再匹配；移除合法函数名；用 SQL Parser 判定语句类型。
- **AI-06**：`previousSql/failedSql/executionError/failedCode` 原样拼接无上限，重试又放大消耗。**修复**：统一经 `PromptDataSanitizer.block(value,N)` 限长后再拼 prompt。
- **AI-07**：单例单一计数器不区分租户/profile，一个用户配错 API Key 触发全局熔断 30 秒，形成跨租户 DoS。**修复**：熔断键按 tenantId+profileId 隔离；NonTransientAiException 不计入瞬态熔断。
- **AI-08**：ConcurrentHashMap 无界增长，未被消费与已消费 grant 永久驻留。**修复**：消费成功直接 remove；增加定时 purge。
- **AI-09**：并发 miss 时所有线程都执行 loader，后写入旧结果可能覆盖新值。**修复**：`computeIfAbsent` 或 CompletableFuture 占位实现 single-flight。
- **AI-10**：`get` 与 `put` 之间无原子保护，可重复提交重建任务。**修复**：`inFlight.putIfAbsent(scopeKey,true)`。
- **AI-11**：`stream.readAllBytes()` 把整个上游响应读入内存且无大小上限。**修复**：用 `readNBytes(MAX_BYTES)` 并截断，超限抛业务异常。
- **AI-12**：content 为空而 reasoning 有内容时，推理文本被选为最终答案，可能把 CoT 当 SQL/摘要返回。**修复**：仅当 reasoning 形态符合预期才启用兜底，并设长度上限+告警。
- **AI-13**：失败节点先加计数再从 1 起判断 `<=max`，实际多重试一次。**修复**：改为 `retryCount < maxRetries`，统一计数语义。
- **AI-14**：`(SELECT ...)`、`EXPLAIN SELECT`、`/*+ hint */ SELECT` 会被判空串。**修复**：用 tokenizer 找首个 SELECT/WITH 位置。
- **AI-15**：`onContent(content)` 推送原始 chunk，`stripCodeFence()` 只对最终累积文本调用一次，SSE 客户端会先看到围栏行。**修复**：流首/流尾增量识别围栏，或明确由前端处理。
- **AI-16**：只转义单引号，未转义反斜杠与换行。`C:\temp`、`\n` 会生成语法错误的 mock Python。**修复**：用 Jackson/Gson 序列化字符串字面量。
- **AI-17**：`columnIndex.get(table)` 为 null 时 continue，别名映射失败的列完全不校验。**修复**：退化为按引用表列集合校验或记 warning。
- **AI-18**：`legacyEnvelope[3]` 在 utfLength==1（校验 `>0` 可通过）时越界。**修复**：合法长度下限改为 `>=2`，对边界做防御。
- **AI-19**：`issue()` 接受客户端任意 conversationId/connectionId/database/confirmedSql，不校验是否来自真实中断会话。**修复**：grant 由服务端在 detectInterrupt 时结合 threadId/checkpointId 生成，客户端只展示与确认。

### 模块二：安全鉴权（server / common / config）· 13 项

| ID | 严重度 | 状态 | 缺陷标题 | 代码位置 |
|----|--------|------|----------|----------|
| SEC-01 | P0 | 已修复 | 登录密码经 URL query 传递并被访问日志记录为明文 | AuthController.java:49-55 · RequestLoggingFilter.java:177-181,218-227 |
| SEC-02 | P1 | 已修复 | OIDC 登录成功后 sessionId 经重定向 URL query 传递 | AuthController.java:91-94 |
| SEC-03 | P1 | 已修复 | SQL 写权限判定依赖关键词黑名单正则，可绕过越权执行 DML/DDL | FeaturePermissionAccess.java:33-35,58-63 · ContentFeatureGateAspect.java:41-44 |
| SEC-04 | P2 | 已修复 | 登录失败锁定仅按用户名，可被用于锁定任意账号（DoS） | LoginAttemptGuard.java:30-77 |
| SEC-05 | P0 | 部分修复 | 默认 License 签名密钥硬编码于公开配置文件 | application.yml:57 · EntitlementSigningSecretValidator.java:20-21 |
| SEC-06 | P2 | 已修复 | 社区插件安装接受任意本地文件路径 | CommunityPluginController.java:237-245 |
| SEC-07 | P2 | 已修复 | 文件会话存储并发 renew/upsert 无锁，读写竞争 | FileSessionStore.java:49-107 |
| SEC-08 | P2 | 已修复 | JWT id_token 校验缺 nbf/iat/nonce，kid 缺失回退首个 JWKS key | OidcIdTokenVerifier.java:88-108,127-162 |
| SEC-09 | P2 | 已修复 | CORS 通配 Origin 模式配合 allowCredentials(true) | WebConfig.java:34-37 · AuthSecurityProperties.java:54-60 |
| SEC-10 | P3 | 部分修复 | 部分异常 message 直接回显前端 | GlobalExceptionHandler.java:50-99 |
| SEC-11 | P3 | 部分修复 | WebSocket/UI 仍保留 ?dwSession= 会话 ID 走 URL | WebSocketSessionAuthSupport.java:42-51 · SessionAuthFilter.java:238-246 |
| SEC-12 | P3 | 已修复 | Secure Cookie 标志由客户端可控的 X-Forwarded-Proto 决定 | SessionAuthFilter.java:281-282 |
| SEC-13 | P3 | 已修复 | 配置解密失败信息含原始异常文本 | SecretValueCodec.java:90 · OidcAuthService.java:474 |

**问题与修复建议**

- **SEC-01**：`userPassword` 作为 `@RequestParam`，客户端通常放 URL query；POST /login 被判 INFO 必定落访问日志，脱敏只处理 JSON body。明文密码进入应用/代理日志、浏览器历史。**修复**：改 `@RequestBody LoginRequest`；requestPath() 对 password 类 query key 统一脱敏；生产禁用 query 传密码。
- **SEC-02**：sessionId 是等同密码的 bearer 凭据，通过 302 Location query 传给前端，会经历史、代理日志、Referer 外泄。**修复**：改用 URL fragment、一次性 ticket 兑换或 HttpOnly+Secure+SameSite Cookie；前端收到后立即 `history.replaceState` 清除。
- **SEC-03**：用正则判断是否要求 dangerous SQL 权限，`UPD/**/ATE` 或 `WITH ... AS DELETE` 可绕过。**修复**：用 JSqlParser 判定语句类型；规范化多语句与注释；鉴权基于语句实际类型。
- **SEC-04**：锁定键只有用户名，知道用户名即可故意输错 8 次锁 15 分钟；也无法抑制分布式撞库。**修复**：采用 (username, IP) 复合键 + IP 维度滑动窗口；引入渐进延迟/验证码。
- **SEC-05**：`signing-secret: datawise-dev-pack-signing-secret-change-me` 用于 License/dpk HMAC 签名，默认 mode=open 不 fail-fast，攻击者可伪造授权包。**修复**：改为 `${DATAWISE_ENTITLEMENT_SIGNING_SECRET}` 必填；fail-fast 提升为默认。
- **SEC-06**：`path` 由请求体完全控制，可让服务读取任意本地路径文件解析。**修复**：限制 path 落在配置的白名单目录，做 `toRealPath().startsWith(allowedRoot)` 校验。
- **SEC-07**：`renew→save→upsert` 的 read-modify-write 非原子，并发下可丢失更新或写坏文件。**修复**：加细粒度锁或串行化续期；高并发改用 JDBC 存储后端。
- **SEC-08**：仅校验 iss/aud/exp，未校验 nbf/iat/auth_time/nonce；无 kid 时选 JWKS 首个 key。**修复**：补齐 claims 校验（含 skew）与 nonce；kid 缺失时拒绝而非回退。
- **SEC-09**：默认 `app://*`、`http://localhost:*` 配合 credentials。**修复**：云 profile 收紧为同源或显式白名单；桌面端移除 `app://*` 通配。
- **SEC-10**：`DdlException`/`TableDataException` 的 message 可能拼入底层表名、SQL 片段。**修复**：统一走 `ClientErrorMessageSupport.forClient()`，内部明细只写日志。
- **SEC-11**：`?dwSession=` fallback 仍有效，会话 ID 进入 URL/日志/Referer（已 deprecated 并有指标）。**修复**：设移除时间表，或检测时强制要求一次性 ticket。
- **SEC-12**：`request.getHeader("X-Forwarded-Proto")` 决定 Cookie Secure 标志，部署未清理该头时攻击者可伪造。**修复**：统一走可信代理白名单判断转发头。
- **SEC-13**：`log.warn("...: {}", ex.toString())` 可能包含 URL/响应片段等底层细节。**修复**：仅记录稳定错误码+异常类型。

### 模块三：连接器 / 数据库层 · 17 项

| ID | 严重度 | 状态 | 缺陷标题 | 代码位置 |
|----|--------|------|----------|----------|
| DB-01 | P0 | 已修复 | 迁移 WHERE 子句黑名单校验后直接字符串拼接，可绕过注入 | MigrationWhereSupport.java:11-41 · SqlTransformOps.java:26-35 |
| DB-02 | P0 | 已修复 | 迁移水印列与排序列未加引号直接拼入 SQL | MigrationOrderBySupport.java:98-105 · SqlTransformOps.java:37-53,158-171 |
| DB-03 | P1 | 已修复 | 完整 JDBC URL（含明文密码）回显给用户错误消息 | JdbcErrorMessageFormatter.java:111-133 |
| DB-04 | P1 | 已修复 | JDBC URL 被写入异常消息与日志 | JdbcConnectionPoolManager.java:209-227 · ClassLoaderDriverDataSource.java:55 |
| DB-05 | P0 | 部分修复 | JDBC 驱动下载坐标未校验，路径穿越/SSRF/无完整性校验 | JdbcMavenCoordinate.java:8-33 · JdbcDriverLoader.java:349-398 |
| DB-06 | P2 | 已修复 | 默认无查询超时，慢查询可长期占用连接与请求线程 | JdbcStatementExecutor.java:28-34 · QueryOperationBudget.java:22-34 |
| DB-07 | P2 | 已修复 | MySQL URL 硬编码 allowPublicKeyRetrieval=true | JdbcUrlBuilder.java:47-50 |
| DB-08 | P2 | 已修复 | Elasticsearch 客户端可全局安装 trust-all 的 X509TrustManager | ElasticsearchRestClient.java:34-40,144-168 |
| DB-09 | P2 | 已修复 | ES REST 客户端跟随重定向，method/path 来自用户输入 | ElasticsearchRestClient.java:34-36,55-63,76-97 |
| DB-10 | P2 | 已修复 | 批量写入器擅自切换 autoCommit，破坏共享/手动事务边界 | JdbcPreparedBatchWriter.java:43-54,73-115 |
| DB-11 | P2 | 已修复 | 连接归还池时 schema/catalog 恢复失败被静默吞掉，跨请求污染 | JdbcConnectionAccessor.java:92-95,115-129 |
| DB-12 | P2 | 部分修复 | 无界读取把最多 10 万行全量载入堆内存 | JdbcResultSetMapper.java:23,32-52 · JdbcTableDataReader.java:286-294 |
| DB-13 | P2 | 部分修复 | 底层 JDBC 原始异常经 "Details:" 回显前端 | JdbcErrorMessageFormatter.java:45-64,78-109 · SqlExecuteService.java:217-229 |
| DB-14 | P2 | 已修复 | SSH 首次连接默认自动接受主机密钥（TOFU），存在 MITM | SshTunnelProperties.java:12-18 · SshKnownHostsSupport.java:38-56 |
| DB-15 | P2 | 部分修复 | 自定义 JDBC URL 无白名单校验，构成 SSRF 面 | JdbcUrlBuilder.java:12-29,101-108 |
| DB-16 | P3 | 已修复 | 内存游标读取存在并发竞态，可能返回 null 触发 NPE | MemorySqlResultCursorStore.java:53-68,117-129 |
| DB-17 | P3 | 已修复 | ES 批量请求部分失败仅记 lastError，整体仍按成功返回 | ElasticsearchRestExecutor.java:31-71 |

**问题与修复建议**

- **DB-01**：`validate()` 用黑名单正则拦截关键字，随后 `appendWhere()` 原样拼接；`appendWhere()` 在 JSqlParser 解析失败时回退 `sql + " WHERE " + condition`，无转义。**修复**：用 JSqlParser 解析为 Expression 后白名单校验 AST 节点；解析失败即拒绝而非回退拼接。
- **DB-02**：watermarkColumn、orderByColumns 来自用户可填的迁移配置，未做标识符引用/合法性校验，解析失败走 legacy 字符串回退。**修复**：标识符经方言 quoteIdentifier + 对照表元数据白名单校验；AST 失败时拒绝执行。
- **DB-03**：`describeTarget()` 无 host 时直接 `return entity.getJdbcUrl()`，用户自定义 URL 常带 password=、truststorePassword=，通过 API 响应泄露。**修复**：统一 `redactJdbcUrl`，仅保留 scheme://host:port/database。
- **DB-04**：`throw new SQLException("Driver rejected URL: "+url)` 与 `log.error("...url="+url,ex)`，形成"日志+响应"双通道泄露。**修复**：异常消息只带 dbType/connectionId；日志传脱敏值。
- **DB-05**：`parse()` 仅 split+trim，未拒绝 `..`、`/`、`\`；fileName/repositoryPath 直接参与路径与 URI 拼接，跟随重定向且无 SHA256 校验，可下载恶意 JAR 后加载执行。**修复**：坐标白名单 `[A-Za-z0-9_.-]+` 并拒绝 `..`；禁跟随重定向或逐跳校验私网；强制 SHA256；target.normalize() 后确认仍在 drivers 目录内。
- **DB-06**：默认 `timeout-seconds:0` 等于无限，一条锁等待/笛卡尔积 SQL 可占住 Hikari 连接直到池耗尽。**修复**：交互查询设默认 30-60s；把 wall-clock deadline 下推到 setQueryTimeout。
- **DB-07**：`sslMode=PREFERRED` 未强制 TLS 且 `allowPublicKeyRetrieval=true`，不安全网络下凭据可被中间人窃取。**修复**：默认关闭该参数，TLS 设为 REQUIRED/VERIFY_CA。
- **DB-08**：`insecureSkipTlsVerify` 为真时 X509TrustManager 为空实现，完全信任任意证书，Authorization 头暴露给中间人。**修复**：改用可配置 CA；若保留则限定 loopback/测试并强制审计告警。
- **DB-09**：`followRedirects(NORMAL)` 且 path 来自 Kibana 控制台输入，服务端 302 可跟随到内网，跨主机可能转发 Authorization 头。**修复**：改 `Redirect.NEVER`，逐跳校验白名单；重定向剥离 Authorization。
- **DB-10**：构造函数 `setAutoCommit(false)`、close 中 `setAutoCommit(true)`，会意外提交/回滚调用方未完成事务。**修复**：写入器只保存并恢复原 autoCommit 值；明确独占连接约束。
- **DB-11**：`restoreScope()` 在 `catch(SQLException ignored)` 后 best-effort 返回，代码注释承认"next borrow may still be polluted"，可串库查询。**修复**：恢复失败直接驱逐该池连接并告警。
- **DB-12**：`SAFETY_MAX_ROWS=100_000`，mapAll() 全量读进 List，含大字段时单请求可占数百 MB。**修复**：导出/元数据路径统一走 `JdbcResultStreamer` 流式；下调硬上限并支持游标分页。
- **DB-13**：多个分支把原始 `SQLException.getMessage()` 拼进用户可见消息，含 SQL、库名、主机、用户名。**修复**：面向用户只返回分类描述+errorCode/requestId；完整堆栈仅写服务端日志。
- **DB-14**：`strictHostKeyChecking=true` 但 `acceptNewHostKeys=true`，首次连接不做身份校验即接受并持久化。**修复**：默认 `accept-new=false`；已存在 key 变更硬失败并告警。
- **DB-15**：用户提供 jdbcUrl 直接采用，可构造指向内网/异常协议的 URL 探测内网。**修复**：scheme 白名单 + 目标 IP 校验（拒私网/回环/元数据）；dbType 枚举校验；统一出站策略检查。
- **DB-16**：`require()` 先 get、校验 TTL、touch(内部 put)、再 get，并发驱逐下重取可能得 null。**修复**：`computeIfPresent` 原子完成；最终为 null 显式抛 `SqlCursorGoneException`。
- **DB-17**：batch 单条失败只记录 lastError，DTO 仍按 lastStatus 返回，无法区分全成功与部分失败。**修复**：DTO 显式返回 partialFailure/每条状态；单条异常隔离处理。

### 模块四：前端（datawise-frontend）· 13 项

| ID | 严重度 | 状态 | 缺陷标题 | 代码位置 |
|----|--------|------|----------|----------|
| FE-01 | P1 | 已修复 | 迁移 SSE 单条畸形事件摧毁整个迁移流 | migration-stream.ts:103-135 · migration-job-stream.ts:70-115 |
| FE-02 | P2 | 已修复 | saveConsole 的 .then() 无 .catch()，保存失败静默 | useSqlEditorActions.ts:601-605 · workspace.ts:369-418 |
| FE-03 | P2 | 已修复 | 危险 SQL 确认链路 .then() 无 .catch()，失败静默 | SqlConsoleTab.vue:711-741 |
| FE-04 | P2 | 已修复 | ai-chat SSE 的 JSON.parse 未容错 | ai-chat-stream.ts:69,81 |
| FE-05 | P1 | 已修复 | AI 发送存在重复提交竞态，可重复扣减额度 | useAiChatSend.ts:212-248 |
| FE-06 | P2 | 已修复 | ECharts 实例与 DOM 生命周期失配，option 恢复后白屏 | EchartsPanel.vue:21-30,68-70 |
| FE-07 | P2 | 已修复 | 多个巨型组件违反单一职责（最大 2085 行） | SqlConsoleTab.vue（拆分后≈645）· WelcomeTab.vue（≈514）· IntegrationsSettingsPanel.vue（≈230）等 |
| FE-08 | P2 | 已修复 | 终端 WebSocket create() Promise 无超时，永久 pending | websocket-terminal.bridge.ts:81-143 |
| FE-09 | P3 | 已修复 | defineAsyncComponent 普遍用 as any 绕过类型检查 | ShortcutPanelDrawer.vue:51,57 · WorkspaceTabs.vue:60 等 |
| FE-10 | P3 | 已修复 | 模板 v-bind="xxx as any" 绕过绑定类型校验 | DataGridMainViews.vue:22,27 |
| FE-11 | P3 | 已修复 | 共享定时器永不清理，onUnmounted 空实现 | useConnectorUpdateBadge.ts:8-9,30-32 |
| FE-12 | P3 | 已修复 | JSON.parse 导入配置无容错 | app-config.service.ts:1068 · elasticsearch-profile.ts:142 · plugin-store.ts:210 |
| FE-13 | P3 | 已修复 | Store 直接暴露可变 ref 供外部修改，巨型 store | ai-chat.ts · app-config-store.ts:1322 |

**问题与修复建议**

- **FE-01**：每个 SSE 事件分支直接 `JSON.parse` 无 try/catch，一条脏数据即抛错冒泡，导致整个迁移 Promise reject、进度可能丢失。对比 `analysis-sse-consumer.ts:66-71` 有防护。**修复**：每分支包 try/catch，失败 onError 上报并跳过该事件。
- **FE-02**：`void saveConsoleTab(...).then(...)` 无 catch，底层动态 import/写文件异常时未捕获 rejection，用户点保存后无失败提示。**修复**：补 `.catch(notifyActionIssue)` 或底层统一 try/catch 返回 boolean。
- **FE-03**：`armDangerousSqlWithReview(...).then(...)` 无 catch，失败时危险 SQL 既不执行也无提示。**修复**：追加 catch，提示并回滚状态。
- **FE-04**：`JSON.parse(parsed.data)` 无容错，单条畸形帧可能打断增量渲染。**修复**：包 try/catch，跳过坏帧并记录。
- **FE-05**：检查 `isSending` 到 `setSending(true)` 之间有 `buildPrompt`、`scrollToBottom` 等 await 让出点，快速双击可两次通过检查，重复发送/扣费。**修复**：校验后同步立即 setSending，失败再回滚；或用 sessionId 级同步锁。
- **FE-06**：`v-if="option"` 销毁 DOM 但 chart 实例未 dispose，option 恢复时 `chart ??=` 跳过重新 init，对已脱离文档的实例 setOption 导致白屏。**修复**：option 为 null 时 dispose 并置 null；或改 v-show。
- **FE-07**：SqlConsoleTab.vue 单文件 2085 行承担 10+ 职责，是竞态与回归温床。**修复**：已按职责拆 composable/子组件（SqlConsole≈645、Welcome≈514、Integrations≈230）；拆分曾引入工具栏 scoped CSS 回归，已在 `47b772f` 收口。
- **FE-08**：create() 仅在收到 created/error/close 时 settle，服务端半开时 Promise 永久 pending，socket 与 4 个监听器驻留。**修复**：增加超时定时器与 settle，超时后 close；与 ssh bridge 对齐。
- **FE-09**：`(()=>import(...)) as any` 掩盖 loader 类型，props 契约不一致时无法编译校验。**修复**：统一 props 类型，用泛型去掉 as any。
- **FE-10**：`v-bind="formBind as any"` 关闭动态组件 props 类型检查。**修复**：定义明确 props 接口，避免 any。
- **FE-11**：模块级 `timer`/`started`，onUnmounted 刻意留空，HMR/复用场景下 started 永不重置。**修复**：抽为显式应用级 service（含引用计数），由根生命周期管理。
- **FE-12**：对用户导入文件直接 `JSON.parse` 无 try/catch，损坏文件抛未捕获异常且无提示。**修复**：外部输入统一 try/catch，捕获后 toast 提示。
- **FE-13**：setup store 将内部 ref 直接 return，外部可绕过 action 直接修改，持久化/会话上限逻辑可能被绕过。**修复**：ai-chat / app-config 对外 `readonly` 暴露；写操作走 action。巨型 store 物理拆分可另开重构。

### 模块五：桌面端与生态（desktop / mcp / cli / plugin）· 14 项

| ID | 严重度 | 状态 | 缺陷标题 | 代码位置 |
|----|--------|------|----------|----------|
| DT-01 | P0 | 已修复 | 桥接脚本无条件注入所有主 frame 且无 origin 校验（RCE 根因） | DesktopMainFrame.java:108-125 · DesktopBridgeRouter.java:92-134 · DatawiseDesktopApp.java:172-180 |
| DT-02 | P0 | 部分修复 | fs:registerRoot 无来源校验，路径沙箱形同虚设 | DesktopBridgeRouter.java:286,380-396 · DesktopPathSandbox.java:33-55 |
| DT-03 | P0 | 部分修复 | 自定义 JRE 路径 + 配置重启 = 任意可执行文件启动链 | DesktopBridgeRouter.java:208-210,711-746 · BackendProcessService.java:465-476 |
| DT-04 | P0 | 部分修复 | 更新器下载安装包无签名/哈希校验即执行 | DesktopUpdaterService.java:39-46,274-298,217-235 |
| DT-05 | P2 | 已修复 | deep link 参数无长度与内容校验，直接推送渲染器 | DeepLinkParser.java:18-57 · DesktopBridgeRouter.java:978-994 |
| DT-06 | P2 | 已修复 | Windows 协议注册命令用 %1 拼入 cmd.exe /c，URL 未净化 | WindowsProtocolRegistrar.java:31-42 |
| DT-07 | P2 | 已修复 | CLI --token 命令行参数导致 token 泄露 | headless-cli/src/main.ts:18 · config.ts:18-22 |
| DT-08 | P2 | 已修复 | MCP API Token 随被覆写的 DATAWISE_API_URL 外发 | datawise-mcp/src/create-server.ts:8-10,45-53 |
| DT-09 | P2 | 已修复 | 本地静态服务器 CORS 通配且反向代理转发全部认证头 | RendererStaticServer.java:141-142,163-190 |
| DT-10 | P2 | 已修复 | JSON-RPC sidecar 单条畸形输入导致整个会话终止 | StdioJsonRpcSidecar.java:84-111 · CommunityPluginSidecarSession.java:336 |
| DT-11 | P2 | 已修复 | agent setup --target 递归删除任意目录，缺少防护 | headless-cli/src/commands/agent-setup.ts:56-67 |
| DT-12 | P3 | 已修复 | openInTerminal 的 Windows/macOS 分支命令字符串拼接 | DesktopFsUtil.java:242-265 |
| DT-13 | P3 | 部分修复 | copilot-kit 不可信数据进 prompt + 危险命令黑名单可绕过 | composePrompt.ts:16-22 · destructive.ts:2-14 · cards.ts:122-167 |
| DT-14 | P3 | 已修复 | 后端日志抽取按字节边界解码导致乱码/行错乱 | BackendProcessService.java:377-392 |

**问题与修复建议**

- **DT-01**：只要 `frame.isMain()` 就注入桥接脚本，不校验 URL 是否受信；`DATAWISE_RENDERER_URL` 可把 renderer 指向任意外部 URL。可控页面可获得任意文件读写、shell.openExternal、JRE 配置、重启等全部原生能力。**修复**：仅白名单 origin 时注入并二次校验；移除/强校验环境变量；高敏通道按 fs:/config:/shell: 分级授权。
- **DT-02**：registerRoot 接受任意路径直接注册为根，可 `registerRoot("C:\\")` 后任意读写删；revealInExplorer 完全未过 requireAllowed。**修复**：删除公开通道或限定仅由宿主 pickDirectoryAsync 内部调用；revealInExplorer 补 requireAllowed。
- **DT-03**：可通过 `config:setJrePreferences` 设置任意 customHome，重启后执行 `<customHome>/bin/java -jar`；结合 DT-02 可植入恶意 java.exe 实现持久化 RCE。**修复**：JRE 路径只接受系统文件对话框选定路径或做签名/白名单校验。
- **DT-04**：下载走 browser_download_url 完成后直接执行，无 checksum/签名；repo slug 可由环境变量覆盖。**修复**：复用 Ed25519 校验签名或 SHA-256；固定更新源禁覆盖；落盘文件名白名单净化。
- **DT-05**：`datawise://` 是注册的外部协议，parse 原样透传所有参数，sql/connectionId 无长度与白名单，异常分支回显 rawUrl。**修复**：参数设长度上限与白名单；前端不得因深链自动执行 SQL；异常不回显 rawUrl。
- **DT-06**：`.cmd/.bat` launcher 注册命令为 `cmd.exe /c ""path" "%1""`，%1 含 &、|、^、" 可致命令注入。**修复**：优先注册 .exe；必须用 cmd 时严格转义或经注册表传参。
- **DT-07**：`--token` 出现在进程命令行（ps/任务管理器/CI 日志）。**修复**：优先用环境变量或 stdin/token 文件；保留时文档标注风险并支持文件读取。
- **DT-08**：BASE_URL 可由 `DATAWISE_API_URL` 任意覆写，而 buildAuthHeaders 会把 token 加到每个请求。**修复**：校验 API_URL 为回环地址或 HTTPS 白名单。
- **DT-09**：静态服务器 `Access-Control-Allow-Origin: *`，/api/** 代理转发几乎所有头（含认证头）到可被环境变量覆写的上游。**修复**：移除 CORS 通配；代理仅白名单转发必要头；校验代理目标为固定回环。
- **DT-10**：`readTree(line)` 在循环体内无 try-catch，插件输出任意非法 JSON 行即导致 sidecar 退出。**修复**：每行单独 try-catch，返回 JSON-RPC parse error(-32700) 保持进程存活。
- **DT-11**：`fs.rmSync(dest,{recursive:true,force:true})` 对 --target 指定任意路径递归删除。**修复**：限制 target 为预期子目录结构；删除前熔丝检查。
- **DT-12**：Windows 用 `cmd /c start cmd /k cd /d "`+abs+`"`，macOS 拼接 AppleScript 仅转义 `\` 与 `"`。**修复**：Windows 用 ProcessBuilder 直接以目录为工作目录；macOS 参数化传参。
- **DT-13**：`composeUserPrompt` 把整个 session context 以 JSON 直拼 prompt 可携带注入载荷；`looksDestructiveCommand` 黑名单可被 `$(...)`、变量拼接绕过；SDK 无强制工具白名单。**修复**：上下文定界与可信标记；危险判断改"默认拒绝+白名单"；SDK 提供强制白名单与风险分级。
- **DT-14**：`new String(buf,0,n)` 按任意字节边界解码 UTF-8，中文被截断乱码；每次 read 都 trim 后 appendLog 再换行，一条日志被拆成多行。**修复**：用 InputStreamReader(UTF-8) 按字符读取并按行缓冲。

---

## 四、修复优先级建议

| 优先级 | 对应缺陷 | 建议动作 |
|--------|----------|----------|
| 立即（P0） | AI-01, AI-02, SEC-01, SEC-05, DB-01, DB-02, DB-05, DT-01, DT-02, DT-03, DT-04 | 止血：桌面桥接信任模型、凭据改请求体/fragment、 grant 绑定 SQL、动态 SQL 改 AST 白名单、驱动/更新器校验 |
| 短期（P1） | AI-03, AI-04, AI-05, AI-07, SEC-02, SEC-03, DB-03, DB-04, FE-01, FE-05 | 加固：凭据脱敏、密钥外部注入、判断改解析器、竞态防护、熔断隔离 |
| 中期（P2） | 全部 36 项 P2 | 治理：统一缓存/限流租户隔离、查询超时、大结果集流式、异常信息收敛、异步容错规范化 |
| 持续（P3） | 全部 19 项 P3 | 质量：巨型组件拆分、TypeScript as any 清零、静默降级补可观测、安全回归用例 |

> **架构级重构提示**：桌面端 JCEF 桥接层（DT-01/02/03）需重建"origin 白名单 + 按通道授权 + 敏感操作二次确认"的信任模型；DataAgent 授权体系（AI-01/02/03/19）需改为服务端签发并与 threadId/SQL 强绑定；全产品"黑名单正则 + 失败回退拼接"反模式（AI-05, SEC-03, DB-01, DB-02）需统一改为 SQL Parser + AST 白名单。详见 `CODE_REVIEW_REPORT.html`。

---

## 五、修复复验结果（2026-11-17）

对修复提交 `5b079a5`（72 项）与 `e4a063b`（前端 4 项）做独立复核，并对照后续 `c94c2a5` / `47b772f`。逐项比对 diff 与当前 HEAD 代码，关键 P0 人工抽查。**详细复验报告见 `CODE_REVIEW_VERIFICATION.html`。**

**复验结论**：台账原标「76 项全部已修复」偏乐观。实际 **63 项确认真实修复、13 项部分修复、4 项测试/归因瑕疵**；修复引入的问题中 FE-07 CSS 回归已收口，仍余 **2 处开放项**（DT-02 功能回归、SEC-02 异常写入 fragment）。无一项完全未修复。

### 状态修正

以下 13 项状态为「**部分修复**」（CSV / 第三节明细已同步）：

| ID | 级别 | 未落实项 |
|----|------|----------|
| AI-08 | P2 | 定时 purge 未实现（仅 lazy 清理） |
| AI-15 | P3 | 流尾 markdown 围栏仍随 delta 推送 |
| SEC-05 | P0 | 默认 application.yml 仍 `mode:open` + 硬编码默认密钥，校验器未改 |
| SEC-10 | P3 | 约 10 处 `ex.getMessage()` 仍直接回显，forClient 对会话用户 no-op |
| SEC-11 | P3 | `?dwSession=` fallback 仍有效，仅标记废弃 |
| DB-05 | P0 | 驱动下载无 SHA256/完整性校验，投毒 RCE 面仍在 |
| DB-12 | P2 | 仅降上限至 2 万行，未改走流式，大字段 OOM 未根治 |
| DB-13 | P2 | 兜底分支未分类异常仍回显原始 JDBC message |
| DB-15 | P2 | 缺目标 IP（私网/回环/元数据地址）校验 |
| DT-02 | P0 | 移除 registerRoot 后前端仍调用，导致「重新打开最近工作区」失效 |
| DT-03 | P0 | resolveJavaExecutable 不校验 customHome，configDir 覆写链可绕过 |
| DT-04 | P0 | 更新源可环境变量覆盖、无 digest 直接放行、无签名（源码 TODO 承认） |
| DT-13 | P3 | prompt 上下文未定界、无强制工具白名单 |

> **FE-07**：巨型组件拆分目标已达成；拆分引入的工具栏 scoped CSS 回归已在 `47b772f` 修复，故仍标「已修复」（不再计入部分修复）。

### 测试/归因瑕疵（4 项，代码本身正确）

- **AI-19 残留**：`loadCheckpointScope` 缺用户归属校验，可 boolean 探测他会话 SAFE_SQL（不可越权执行）
- **AI-05**：误杀问题已解决，但仍为正则黑名单而非台账建议的 AST 白名单
- **SEC-08**：JWT claims/nonce/kid 修复逻辑正确，但缺对应回归测试
- **FE-12**：JSON.parse 容错代码在修复前就存在，这两个提交零改动，归因不成立

### 修复引入的问题

1. **FE-07 工具栏 CSS 回归（P2）— 已收口**：拆分后 scoped 样式失配；`47b772f` 已把布局样式落到 `SqlConsoleToolbar.vue` 并同步 ViewModel 工具栏 nowrap。
2. **DT-02 功能回归（P2）— 仍开放**：前端 `local-files.service.ts` 仍调用已废弃的 `fs:registerRoot`，重新打开工作区看不到文件列表。需宿主提供可信替代 API。
3. **SEC-02 异常信息写入 fragment（P1）— 仍开放**：`AuthController` catch 分支把 `ex.getMessage()` 放进 URL fragment 并前端 toast 展示，与 SEC-10 目标冲突。

### 已切断的核心风险（确认高质量）

桌面 P0 RCE 主链（DT-01 信任边界 + DT-02/03 主路径收紧）、DataAgent 写授权闭环（AI-01/02/03/19）、SQL 判定根治（SEC-03 四处调用点全切 JSqlParser、DB-01/02 删 legacy 回退）、凭据泄露（SEC-01/02、DB-03/04）、前端竞态（FE-05/06）均已实质修复；前端 `vue-tsc --noEmit` 全量通过。
