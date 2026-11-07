# Application icons

应用图标与首页品牌 Logo 同源：`src/assets/brand-logo.svg`。

---

## 文件

| 文件 | 用途 |
|------|------|
| `../src/assets/brand-logo.svg` | 源 SVG（AppBrandLogo、标题栏） |
| `icon.png` | 桌面 / macOS 主图（1024×1024） |
| `icon.ico` | Windows exe、安装包、托盘（多尺寸） |
| `../public/favicon.png` | 浏览器标签页（32×32） |

---

## 重新生成

修改 SVG 后：

```bash
npm run gen:icons
```

然后重新打桌面包：

```bash
npm run dist:desktop
```
