package org.apache.datawise.backend.service.ssh;

import org.apache.datawise.backend.model.SshCommandItem;
import org.apache.datawise.backend.model.SshScriptRecord;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Seeds built-in quick-command records into each SSH connection's script store on first access.
 * Blank built-in content is repaired in place. Built-in ids missing from an existing store are
 * appended (so new defaults like MongoDB appear without wiping user records).
 */
final class SshScriptRecordBootstrap {

    static final String BUILTIN_PREFIX = "builtin-";

    static final String FULL_INSPECTION = String.join("; ",
            "echo '=== host ==='; hostname; uname -a",
            "echo '=== uptime ==='; uptime",
            "echo '=== disk ==='; df -hT",
            "echo '=== inode ==='; df -i",
            "echo '=== memory ==='; free -h 2>/dev/null || vm_stat",
            "echo '=== load ==='; top -b -n 1 2>/dev/null | head -n 25 || top -l 1 2>/dev/null | head -n 25",
            "echo '=== cpu ==='; ps aux --sort=-%cpu 2>/dev/null | head -n 15 || ps aux | head -n 15",
            "echo '=== mem ==='; ps aux --sort=-%mem 2>/dev/null | head -n 15 || ps aux | head -n 15",
            "echo '=== ports ==='; ss -tlnp 2>/dev/null | head -n 30 || netstat -tlnp 2>/dev/null | head -n 30",
            "echo '=== failed ==='; systemctl --failed 2>/dev/null || true"
    );

    private SshScriptRecordBootstrap() {
    }

    static List<SshScriptRecord> ensureDefaults(List<SshScriptRecord> existing, long now) {
        if (existing == null || existing.isEmpty()) {
            return new ArrayList<>(builtInRecords(now));
        }

        Map<String, SshScriptRecord> defaultsById = new LinkedHashMap<>();
        for (SshScriptRecord defaults : builtInRecords(now)) {
            defaultsById.put(defaults.getId(), defaults);
        }

        List<SshScriptRecord> repaired = new ArrayList<>(existing.size());
        Set<String> presentIds = new HashSet<>();
        boolean changed = false;
        for (SshScriptRecord record : existing) {
            if (record == null || record.getId() == null || record.getId().isBlank()) {
                continue;
            }
            presentIds.add(record.getId());
            SshScriptRecord defaults = defaultsById.get(record.getId());
            if (defaults != null && isBlankContent(record)) {
                record.setCommands(copyCommands(defaults.getCommands()));
                record.setContentHtml(defaults.getContentHtml());
                if (record.getUpdatedAt() <= 0) {
                    record.setUpdatedAt(now);
                }
                changed = true;
            } else if (defaults != null && appendMissingInspection(record, defaults)) {
                changed = true;
            }
            repaired.add(record);
        }

        for (SshScriptRecord defaults : defaultsById.values()) {
            if (presentIds.contains(defaults.getId())) {
                continue;
            }
            repaired.add(copyRecord(defaults));
            changed = true;
        }

        return changed ? repaired : existing;
    }

    static boolean isBuiltInId(String recordId) {
        return recordId != null && recordId.startsWith(BUILTIN_PREFIX);
    }

    private static boolean isBlankContent(SshScriptRecord record) {
        return !SshCommandDslParser.hasCommands(record.getCommands())
                && (record.getContentHtml() == null || record.getContentHtml().isBlank());
    }

    /** Prepend the stock inspection command when a structured status record does not have it yet. */
    private static boolean appendMissingInspection(SshScriptRecord record, SshScriptRecord defaults) {
        if (!"builtin-status".equals(record.getId()) || !SshCommandDslParser.hasCommands(record.getCommands())) {
            return false;
        }
        for (SshCommandItem item : record.getCommands()) {
            if (item != null && item.getCommand() != null && item.getCommand().contains("=== host ===")) {
                return false;
            }
        }
        SshCommandItem inspection = null;
        if (defaults.getCommands() != null) {
            for (SshCommandItem item : defaults.getCommands()) {
                if (item != null && item.getCommand() != null && item.getCommand().contains("=== host ===")) {
                    inspection = item;
                    break;
                }
            }
        }
        if (inspection == null) {
            return false;
        }
        List<SshCommandItem> merged = new ArrayList<>();
        merged.add(new SshCommandItem(
                inspection.getTitle(),
                inspection.getCommand(),
                inspection.getMode(),
                inspection.getDescription() != null ? inspection.getDescription() : ""
        ));
        merged.addAll(copyCommands(record.getCommands()));
        record.setCommands(merged);
        record.setContentHtml(SshCommandDslParser.serialize(merged));
        return true;
    }

    private static List<SshCommandItem> copyCommands(List<SshCommandItem> source) {
        List<SshCommandItem> copy = new ArrayList<>();
        if (source == null) {
            return copy;
        }
        for (SshCommandItem item : source) {
            if (item == null) {
                continue;
            }
            copy.add(new SshCommandItem(
                    item.getTitle(),
                    item.getCommand(),
                    item.getMode(),
                    item.getDescription() != null ? item.getDescription() : ""
            ));
        }
        return copy;
    }

    private static SshScriptRecord copyRecord(SshScriptRecord source) {
        SshScriptRecord copy = new SshScriptRecord();
        copy.setId(source.getId());
        copy.setTitle(source.getTitle());
        copy.setCommands(copyCommands(source.getCommands()));
        copy.setContentHtml(source.getContentHtml());
        copy.setUpdatedAt(source.getUpdatedAt());
        return copy;
    }

    private static List<SshScriptRecord> builtInRecords(long now) {
        return List.of(
                record(
                        "builtin-common",
                        "常用",
                        List.of(
                                cmd("当前用户", "whoami; id", "run", "查看登录用户与身份"),
                                cmd("主机信息", "hostname; uname -a", "run", "主机名与内核"),
                                cmd("当前时间", "date; timedatectl 2>/dev/null | head -n 8", "run"),
                                cmd("目录占用", "du -h --max-depth=1 2>/dev/null | sort -hr | head -n 20", "run"),
                                cmd("大文件", "find / -xdev -type f -size +500M 2>/dev/null | head -n 30", "paste"),
                                cmd("网络地址", "ip -br a 2>/dev/null || ifconfig", "run"),
                                cmd("路由", "ip route 2>/dev/null || route -n", "run"),
                                cmd("环境变量", "env | sort | head -n 40", "run")
                        ),
                        now
                ),
                record(
                        "builtin-logs",
                        "日志",
                        List.of(
                                cmd("最近日志",
                                        "journalctl -n 80 --no-pager 2>/dev/null || tail -n 80 /var/log/messages 2>/dev/null || tail -n 80 /var/log/syslog",
                                        "run"),
                                cmd("错误日志",
                                        "journalctl -p err -n 50 --no-pager 2>/dev/null || grep -iE 'error|exception|fail' /var/log/messages 2>/dev/null | tail -n 50",
                                        "run"),
                                cmd("日志目录", "ls -lt /var/log 2>/dev/null | head -n 20", "run"),
                                cmd("跟踪 syslog",
                                        "journalctl -f --no-pager 2>/dev/null || tail -f /var/log/messages 2>/dev/null || tail -f /var/log/syslog",
                                        "paste",
                                        "前台跟随，需手动 Ctrl+C")
                        ),
                        now
                ),
                record(
                        "builtin-status",
                        "状态",
                        List.of(
                                cmd("完整巡检", FULL_INSPECTION, "run",
                                        "一次跑完主机、磁盘、内存、负载、进程、端口和失败服务，结果留在当前终端"),
                                cmd("运行时间", "uptime", "run"),
                                cmd("磁盘", "df -hT", "run"),
                                cmd("inode", "df -i", "run"),
                                cmd("内存", "free -h 2>/dev/null || vm_stat", "run"),
                                cmd("负载 Top", "top -b -n 1 2>/dev/null | head -n 25 || top -l 1 2>/dev/null | head -n 25", "run"),
                                cmd("进程 CPU", "ps aux --sort=-%cpu 2>/dev/null | head -n 20 || ps aux | head -n 20", "run"),
                                cmd("进程内存", "ps aux --sort=-%mem 2>/dev/null | head -n 20 || ps aux | head -n 20", "run"),
                                cmd("端口", "ss -tlnp 2>/dev/null | head -n 30 || netstat -tlnp 2>/dev/null | head -n 30", "run"),
                                cmd("系统服务失败", "systemctl --failed 2>/dev/null || true", "run")
                        ),
                        now
                ),
                record(
                        "builtin-yarn",
                        "YARN",
                        List.of(
                                cmd("应用列表", "yarn application -list", "paste"),
                                cmd("运行中应用", "yarn application -list -appStates RUNNING", "paste"),
                                cmd("应用状态", "yarn application -status {{appId}}", "paste"),
                                cmd("应用日志",
                                        "yarn logs -applicationId {{appId}} 2>/dev/null | tail -n 200",
                                        "paste"),
                                cmd("KILL 应用", "yarn application -kill {{appId}}", "paste"),
                                cmd("节点列表", "yarn node -list -all", "paste"),
                                cmd("队列", "yarn queue -list 2>/dev/null || yarn scheduler -showJobs 2>/dev/null || true", "paste"),
                                cmd("集群指标", "yarn top 2>/dev/null || yarn node -list", "paste"),
                                cmd("RM 状态",
                                        "yarn rmadmin -getServiceState rm 2>/dev/null || curl -s http://localhost:8088/ws/v1/cluster/info 2>/dev/null | head -c 800",
                                        "paste")
                        ),
                        now
                ),
                record(
                        "builtin-kafka",
                        "Kafka",
                        List.of(
                                cmd("Topic 列表",
                                        "kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null || kafka-topics --bootstrap-server localhost:9092 --list",
                                        "paste"),
                                cmd("查看 Topic",
                                        "kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic {{topic}} 2>/dev/null || kafka-topics --bootstrap-server localhost:9092 --describe --topic {{topic}}",
                                        "paste"),
                                cmd("消费组列表",
                                        "kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list 2>/dev/null || kafka-consumer-groups --bootstrap-server localhost:9092 --list",
                                        "paste"),
                                cmd("消费组详情",
                                        "kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group {{groupId}} 2>/dev/null || kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group {{groupId}}",
                                        "paste"),
                                cmd("消费消息",
                                        "kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic {{topic}} --from-beginning --max-messages 20 2>/dev/null || kafka-console-consumer --bootstrap-server localhost:9092 --topic {{topic}} --from-beginning --max-messages 20",
                                        "paste"),
                                cmd("生产消息",
                                        "kafka-console-producer.sh --bootstrap-server localhost:9092 --topic {{topic}} 2>/dev/null || kafka-console-producer --bootstrap-server localhost:9092 --topic {{topic}}",
                                        "paste",
                                        "交互写入，Ctrl+C 结束"),
                                cmd("Topic 配置",
                                        "kafka-configs.sh --bootstrap-server localhost:9092 --entity-type topics --entity-name {{topic}} --describe 2>/dev/null || kafka-configs --bootstrap-server localhost:9092 --entity-type topics --entity-name {{topic}} --describe",
                                        "paste")
                        ),
                        now
                ),
                record(
                        "builtin-mongodb",
                        "MongoDB",
                        List.of(
                                cmd("库列表",
                                        "mongosh --quiet --eval 'db.adminCommand({ listDatabases: 1 }).databases.map(d => d.name).join(\"\\n\")' 2>/dev/null || mongo --quiet --eval 'db.adminCommand({ listDatabases: 1 }).databases.forEach(d => print(d.name))'",
                                        "paste"),
                                cmd("集合列表",
                                        "mongosh {{db}} --quiet --eval 'db.getCollectionNames().join(\"\\n\")' 2>/dev/null || mongo {{db}} --quiet --eval 'db.getCollectionNames().forEach(printjson)'",
                                        "paste"),
                                cmd("抽样查询",
                                        "mongosh {{db}} --quiet --eval 'db.getCollection(\"{{collection}}\").find().limit(10).toArray()' 2>/dev/null || mongo {{db}} --quiet --eval 'db.getCollection(\"{{collection}}\").find().limit(10).forEach(printjson)'",
                                        "paste"),
                                cmd("集合统计",
                                        "mongosh {{db}} --quiet --eval 'printjson(db.getCollection(\"{{collection}}\").stats())' 2>/dev/null || mongo {{db}} --quiet --eval 'printjson(db.getCollection(\"{{collection}}\").stats())'",
                                        "paste"),
                                cmd("索引",
                                        "mongosh {{db}} --quiet --eval 'printjson(db.getCollection(\"{{collection}}\").getIndexes())' 2>/dev/null || mongo {{db}} --quiet --eval 'printjson(db.getCollection(\"{{collection}}\").getIndexes())'",
                                        "paste"),
                                cmd("服务器状态",
                                        "mongosh --quiet --eval 'printjson(db.serverStatus())' 2>/dev/null || mongo --quiet --eval 'printjson(db.serverStatus())'",
                                        "paste"),
                                cmd("副本集状态",
                                        "mongosh --quiet --eval 'try { printjson(rs.status()) } catch (e) { print(e) }' 2>/dev/null || mongo --quiet --eval 'try { printjson(rs.status()) } catch(e) { print(e) }'",
                                        "paste")
                        ),
                        now
                )
        );
    }

    private static SshCommandItem cmd(String title, String command, String mode) {
        return cmd(title, command, mode, "");
    }

    private static SshCommandItem cmd(String title, String command, String mode, String description) {
        return new SshCommandItem(title, command, mode, description != null ? description : "");
    }

    private static SshScriptRecord record(String id, String title, List<SshCommandItem> commands, long updatedAt) {
        SshScriptRecord record = new SshScriptRecord();
        record.setId(id);
        record.setTitle(title);
        record.setCommands(commands);
        record.setContentHtml(SshCommandDslParser.serialize(commands));
        record.setUpdatedAt(updatedAt);
        return record;
    }
}
