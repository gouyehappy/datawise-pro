import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@datawise/community-copilot-kit": path.resolve(
        root,
        "../../shared/copilot-kit/src/index.ts",
      ),
    },
  },
  // ConnectingCard / PluginLogo 通过 ?raw 引用仓库根 assets/plugin.svg，
  // 路径越过 frontend/ 根。与 vite.config.ts 保持同一 fs.allow，否则 vitest
  // 的模块解析会拒绝该 ID（Denied ID ...plugin.svg?raw），整组组件测试 0 运行。
  server: { fs: { allow: [path.resolve(root, "..")] } },
  test: {
    environment: "node",
    include: [
      "src/**/*.{spec,test}.ts",
      "../../shared/copilot-kit/src/**/*.{spec,test}.ts",
    ],
  },
});
