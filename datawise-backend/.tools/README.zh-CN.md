# datawise-backend 构建工具说明

本目录与父 `pom.xml` 中的 Maven 插件配套。质量类插件**默认跳过**，日常 `mvn package` 不受影响。

## 一、Maven 插件（干什么的）

| 插件 | 干什么 | 常用命令 |
|------|--------|----------|
| **maven-compiler-plugin** | 编译 Java；`parameters=true` 保留参数名给 Spring 用 | 构建自动跑 |
| **maven-resources-plugin** | 复制 `resources`，编码固定 UTF-8 | 构建自动跑 |
| **maven-surefire-plugin** | 跑单元测试 `*Test` | `mvn test` |
| **maven-failsafe-plugin** | 跑集成测试 `*IT` | `mvn verify` |
| **spring-boot-maven-plugin** | 打可执行 fat-jar（仅 server 等模块开启） | `mvn package`（在 server 模块） |
| **maven-shade-plugin** | 打 uber-jar / 合并 SPI，connector 插件用 | 子模块 `package` 时 |
| **maven-antrun-plugin** | 跑 Ant 任务，把 connector jar 拷到 `config/plugins` | connector `package` 时 |
| **maven-dependency-plugin** | 看依赖树、拷贝依赖 | `mvn dependency:tree` |
| **build-helper-maven-plugin** | 追加源码目录（ANTLR 生成代码等） | sqlflow 等子模块 |
| **maven-source-plugin** | 打 `*-sources.jar` | `mvn source:jar` |
| **flatten-maven-plugin** | 发布前展平 POM | 发布时按需启用 |
| **spotless-maven-plugin** | 格式化 Java + 许可证头 + 去无用 import | 见下方 |
| **maven-checkstyle-plugin** | 代码风格检查（禁止 printStackTrace 等） | 见下方 |
| **license-maven-plugin** | 批量检查/写入许可证头 | 见下方 |

### 质量插件怎么开

```bash
# 格式化（会改文件）
mvn -f datawise-backend/pom.xml spotless:apply -Dspotless.skip=false

# 只检查格式，不改文件
mvn -f datawise-backend/pom.xml spotless:check -Dspotless.skip=false

# Checkstyle
mvn -f datawise-backend/pom.xml checkstyle:check -Dcheckstyle.skip=false

# 许可证头
mvn -f datawise-backend/pom.xml license:check -Dlicense.skip=false
mvn -f datawise-backend/pom.xml license:format -Dlicense.skip=false
```

## 二、本目录文件

| 路径 | 作用 |
|------|------|
| `copyright.txt` | 许可证正文（**无** `/* */`）。Spotless / mycila 共用 |
| `format/phenixan_spotless_formatter.xml` | Spotless 用的 Eclipse 格式化规则（Java 17） |
| `checkstyle/phenixan_checkstyle.xml` | Checkstyle 正式规则（已适配 Checkstyle 10.x） |
| `suppressions.xml` | Checkstyle 抑制（忽略 target、生成代码等） |
| `README.zh-CN.md` | 本说明 |

### 实测状态（2026-09）

| 命令 | 结果 |
|------|------|
| `mvn -N validate` | 通过 |
| `mvn -N spotless:check -Dspotless.skip=false` | 通过（插件可跑） |
| `mvn -pl datawise-common checkstyle:check -Dcheckstyle.skip=false` | 插件可跑；当前代码仍有风格违规（属预期，需逐步改） |
| `mvn -pl datawise-common license:check -Dlicense.skip=false` | 插件可跑；部分文件缺许可证头（属预期） |
| `mvn -pl datawise-common checkstyle:check`（默认 skip） | 通过，不拦日常构建 |
| `mvn -pl datawise-common dependency:help` | 通过 |

## 三、其它已迁入（非插件）

| 文件 | 作用 |
|------|------|
| `../lombok.config` | Lombok 全局：强制用 `@Slf4j`，禁止 Log4j 注解；`equals/toString` 调 `super` |
| `../.editorconfig` | 编辑器统一缩进/换行（LF、4 空格） |
| `../.mvn/maven.config` | 默认 `-Dfile.encoding=UTF-8`、`maven.compile.fork=true` |
| `../.mvn/jvm.config` | Maven JVM 堆内存与 headless（**未**写死 `java.home`，避免换机失败） |

## 四、刻意未迁入

| 项 | 原因 |
|----|------|
| clean-dist / 拷贝到 `dist/plugins` | 旧 SeaTunnel 分发模型；本仓库用 connector + antrun → `config/plugins` |
| antrun 写 changelog.txt | 发布仪式用，日常无收益 |
| frontend-maven / kotlin-maven | frontend、Kotlin 不在本 backend |
| findbugs.xml / scalastyle / scalafmt | 未接 SpotBugs；无 Scala |
| `.tools/plugin.xml`（assembly） | 旧 tar.gz 打包描述，现 desktop/connector 另有方案 |
| `.mvn` 里写死 `java.home=D:/java/jdk-21` | 本机路径，换环境必挂 |
| 默认 `-DskipTests=true` | 本仓库需要能跑测试 |

## 五、旧项目还有、这里已有或不必搬的

- **antlr4-maven-plugin**：`datawise-sqlflow` 已配置
- **exec-maven-plugin**：旧 taskconcurrency 专用，按需再加
- **datawise-shade / dao-plugin / datasource-plugins 模块**：是业务插件体系，不是 Maven 插件；cli 已用 connectors 体系替代
