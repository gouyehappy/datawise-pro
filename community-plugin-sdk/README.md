# Community Plugin SDK

Minimal Java helpers for DataWise `.dwp` sidecars (`stdio-jsonl` JSON-RPC).

Implements the **plugin side** of the protocol in
[`_private/docs/design/COMMUNITY_PLUGIN.md#platform`](../_private/docs/design/COMMUNITY_PLUGIN.md#platform).
Authoring steps:
[`_private/docs/design/COMMUNITY_PLUGIN.md#implementation`](../_private/docs/design/COMMUNITY_PLUGIN.md#implementation).

## Use

```xml
<dependency>
  <groupId>org.apache.datawise</groupId>
  <artifactId>community-plugin-sdk</artifactId>
  <version>1.0.0</version>
</dependency>
```

```java
public final class MyPlugin extends StdioJsonRpcSidecar {
  public static void main(String[] args) throws Exception {
    new MyPlugin().runStdio();
  }

  @Override
  protected JsonNode handle(String method, JsonNode params) {
    return switch (method) {
      case "plugin/initialize" -> mapper().createObjectNode().put("ok", true);
      default -> throw new IllegalArgumentException("Unknown method: " + method);
    };
  }
}
```

Install locally before packaging examples:

```bash
mvn -f community-plugin-sdk/pom.xml install -DskipTests
```
