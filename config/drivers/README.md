# JDBC drivers（本机缓存）

桌面安装包**默认不携带**驱动 JAR。首次测连 / 连接时，应用按连接表单里的 Maven 坐标下载到本目录（进度弹窗）；离线环境可手工放入 JAR。

core 连接器（MySQL / PostgreSQL / SQLite）的驱动已打进对应 connector 插件，一般无需再下。

- 开发：可把 JAR 放在此目录供本机联调（**勿提交**）
- 打包：`bundle-backend` **不会**把此目录中的 JAR 打进 Releases
- 说明：[`docs/DESKTOP_PACKAGING.md`](../../docs/DESKTOP_PACKAGING.md)
