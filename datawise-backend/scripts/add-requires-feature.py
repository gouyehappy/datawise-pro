"""One-off: add @RequiresFeature to controllers that had zero authorization checks.

Dry-run by default; pass --apply to write. Only touches the explicit plan below.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "datawise-server/src/main/java/org/apache/datawise/backend/controller"

# file -> (class-level feature or None, {method: feature})
PLAN = {
    "explorer/ExplorerKubernetesController.java": (
        "WORKBENCH_EXPLORER_CONTEXT_OPEN",
        {
            "applyKubernetesYaml": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
            "deleteKubernetesPod": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
            "restartKubernetesDeployment": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
        },
    ),
    "explorer/ExplorerYarnController.java": ("WORKBENCH_EXPLORER_CONTEXT_OPEN", {}),
    "explorer/ExplorerJenkinsController.java": ("WORKBENCH_EXPLORER_CONTEXT_OPEN", {}),
    "explorer/ExplorerPolarisController.java": (
        "WORKBENCH_EXPLORER_CONTEXT_OPEN",
        {"updatePolarisConfig": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS"},
    ),
    "explorer/ExplorerNacosController.java": (
        "WORKBENCH_EXPLORER_CONTEXT_OPEN",
        {
            "publishNacosConfig": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
            "detectNacosNamespaces": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
        },
    ),
    "auth/UserAdminController.java": ("SETTINGS_USER_PERMISSIONS", {}),
    "table/TableMetadataController.java": (
        "WORKBENCH_EXPLORER_CONTEXT_OPEN",
        {
            "exportTableSql": "WORKBENCH_EXPLORER_CONTEXT_EXPORT",
            "exportDatabaseSql": "WORKBENCH_EXPLORER_CONTEXT_EXPORT",
        },
    ),
    "table/TableDataController.java": (
        "WORKBENCH_EXPLORER_CONTEXT_OPEN",
        {
            "insertTableRow": "WORKBENCH_CONSOLE_DANGEROUS_SQL",
            "deleteTableRow": "WORKBENCH_CONSOLE_DANGEROUS_SQL",
            "updateTableRow": "WORKBENCH_CONSOLE_DANGEROUS_SQL",
            "restoreTableDataAudit": "WORKBENCH_CONSOLE_DANGEROUS_SQL",
        },
    ),
    "sql/SqlSessionController.java": ("WORKBENCH_CONSOLE_TRANSACTION", {}),
    "platform/SqlReviewController.java": ("WORKBENCH_CONSOLE_RUN", {}),
    "platform/McpBridgeController.java": (
        "NAV_AI",
        {"invoke": "WORKBENCH_CONSOLE_DANGEROUS_SQL"},
    ),
    "platform/McpConfirmationController.java": ("NAV_AI", {}),
    "platform/ScheduledTaskController.java": ("SETTINGS_DATA_AGENT", {}),
    "platform/OrchestrationController.java": ("SETTINGS_DATA_AGENT", {}),
    "platform/QueryLibraryController.java": ("WORKBENCH_CONSOLE_SAVE", {}),
    "platform/DiscoveryController.java": ("WORKBENCH_EXPLORER_SEARCH", {}),
    "platform/ShareController.java": ("WORKBENCH_EXPLORER_CONTEXT_EXPORT", {}),
    "workspace/NotificationController.java": ("UTIL_NOTIFY", {}),
    "workspace/WorkspaceSettingsController.java": ("SETTINGS_LAYOUT", {}),
    "appconfig/ProfilePortabilityController.java": ("SETTINGS_PROFILE", {}),
    "system/PluginController.java": ("NAV_PLUGIN", {}),
    "platform/ProjectController.java": (
        "TITLE_BAR_WORKSPACE",
        {
            "importPackage": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
            "delete": "WORKBENCH_EXPLORER_CONTEXT_DANGEROUS",
        },
    ),
    "platform/ProjectFilesController.java": (
        "WORKBENCH_EXPLORER_CONTEXT_OPEN",
        {
            "write": "WORKBENCH_EXPLORER_CONTEXT_EDIT",
            "mkdir": "WORKBENCH_EXPLORER_CONTEXT_EDIT",
            "rename": "WORKBENCH_EXPLORER_CONTEXT_EDIT",
        },
    ),
    "workspace/InstanceSqlController.java": ("WORKBENCH_CONSOLE_SAVE", {}),
    "workspace/ViewModelController.java": ("WORKBENCH_CONSOLE_VIEW_MODEL", {}),
    "workspace/WorkspaceSqlController.java": (
        "WORKBENCH_CONSOLE_RUN",
        {"saveConsole": "WORKBENCH_CONSOLE_SAVE"},
    ),
    "workspace/WorkspaceExportController.java": ("WORKBENCH_EXPLORER_CONTEXT_EXPORT", {}),
}

IMPORT_ANCHOR = "import org.springframework.stereotype."
IMPORTS = [
    "import org.apache.datawise.backend.domain.UserFeaturePermission;",
    "import org.apache.datawise.backend.security.RequiresFeature;",
]


def add_imports(text: str) -> str:
    missing = [imp for imp in IMPORTS if imp not in text]
    if not missing:
        return text
    block = "\n".join(missing) + "\n"
    idx = text.find(IMPORT_ANCHOR)
    if idx != -1:
        return text[:idx] + block + text[idx:]
    # no spring stereotype import: place after the last import line
    last = -1
    for m in re.finditer(r"^import .*;$", text, re.M):
        last = m.end()
    if last == -1:
        raise SystemExit("cannot place imports")
    return text[: last + 1] + "\n" + block + text[last + 1 :]


def annotate_class(text: str, class_name: str, feature: str) -> str:
    anchor = "public class " + class_name
    idx = text.find(anchor)
    if idx == -1:
        raise SystemExit(f"class {class_name} not found")
    line_start = text.rfind("\n", 0, idx) + 1
    indent = text[line_start:idx]
    if "@RequiresFeature" in text[max(0, idx - 400) : idx]:
        return text
    return text[:line_start] + indent + f"@RequiresFeature(UserFeaturePermission.{feature})\n" + text[line_start:]


def annotate_method(text: str, method: str, feature: str) -> str:
    pattern = re.compile(r"\n([ \t]*)(public\s+[^\n;{]*?\b" + re.escape(method) + r"\s*\()")
    m = pattern.search(text)
    if not m:
        raise SystemExit(f"method {method} not found")
    start = m.start()
    if "@RequiresFeature" in text[max(0, start - 300) : start]:
        return text
    indent = m.group(1)
    return text[:start] + f"\n{indent}@RequiresFeature(UserFeaturePermission.{feature})" + text[start:]


def main() -> None:
    apply = "--apply" in sys.argv
    changed = 0
    for rel, (cls_feature, methods) in PLAN.items():
        path = ROOT / rel
        if not path.is_file():
            raise SystemExit(f"missing {path}")
        original = path.read_text(encoding="utf-8")
        text = original
        if cls_feature:
            class_name = path.stem
            text = annotate_class(text, class_name, cls_feature)
        for method, feature in methods.items():
            text = annotate_method(text, method, feature)
        text = add_imports(text)
        if text != original:
            changed += 1
            print(f"{'WRITE' if apply else 'PLAN '} {rel}")
            if apply:
                path.write_text(text, encoding="utf-8", newline="\n")
    print(f"\n{changed} files changed")


if __name__ == "__main__":
    main()
