<script setup lang="ts">
// Session import: stream a third-party export into the sidecar for a sanitized
// preview, then either create host connections via host.importConnections /
// host.createConnections (when the host exposes that API) or fall back to
// sanitized JSON export + the connection-form "Import sessions" action.
//
// Host create path: drafts are ConnectionConfig-shaped (dbType=plugin) with no
// secrets — passwords / key material never leave the sidecar.
// Fallback path: no plugin-local connection store (legacy imported-connections.json
// was removed on purpose); clear notice points users to export / form action.
import { computed, onBeforeUnmount, ref } from "vue";
import { Download, FileUp, FolderInput, Loader2, PencilLine, Plus, RotateCcw } from "@lucide/vue";
import {
  IMPORT_CHUNK_LIMIT,
  createHostConnectionsFromImport,
  hostConnectionDraftsFromExport,
  importErrorCode,
  importPreviewChunkParams,
  importPreviewStartParams,
  parseImportSessions,
  type ImportKind,
  type ImportSessionView,
} from "../lib/connectionImport";
import { exportSanitizedJson } from "../lib/sanitizedDownload";

const props = defineProps<{ t: (key: string, values?: Record<string, string | number>) => string }>();
interface ImportSource { kind: ImportKind; labelKey: string; accept: string; windtermExtras: boolean }
const SOURCES: ImportSource[] = [
  { kind: "moba", labelKey: "importWizard.source.moba", accept: ".mxtsessions", windtermExtras: false },
  { kind: "xshell", labelKey: "importWizard.source.xshell", accept: ".xts", windtermExtras: false },
  { kind: "windterm", labelKey: "importWizard.source.windterm", accept: ".sessions", windtermExtras: true },
  { kind: "securecrt", labelKey: "importWizard.source.securecrt", accept: ".xml", windtermExtras: false },
  { kind: "finalshell", labelKey: "importWizard.source.finalshell", accept: ".zip", windtermExtras: false },
  { kind: "electerm", labelKey: "importWizard.source.electerm", accept: ".json", windtermExtras: false },
  { kind: "termius", labelKey: "importWizard.source.termius", accept: ".json", windtermExtras: false },
  // ~/.ssh/config 没有扩展名，accept 留空表示不限文件类型。
  { kind: "sshconfig", labelKey: "importWizard.source.sshconfig", accept: "", windtermExtras: false },
];
const SECRET_NOTE_KEYS: Record<string, string> = { encrypted: "importWizard.note.encrypted", "not-carried": "importWizard.note.notCarried", "key-path-only": "importWizard.note.keyPathOnly" };
const step = ref<1 | 2 | 3>(1);
const kind = ref<ImportKind>("moba");
const mainFile = ref<File | null>(null);
const userConfigFile = ref<File | null>(null);
const masterPassword = ref("");
const parsing = ref(false);
const parseError = ref("");
const parseErrorCode = ref<"" | "masterPassword" | "sizeLimit">("");
const sessions = ref<ImportSessionView[]>([]);
const normalizedExport = ref<unknown>(null);
const exporting = ref(false);
const exportError = ref("");
const creating = ref(false);
const createError = ref("");
const createNotice = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const userConfigInput = ref<HTMLInputElement | null>(null);
const activeUploads = new Set<string>();
const currentSource = computed(() => SOURCES.find((source) => source.kind === kind.value) ?? SOURCES[0]);
const hasSecretGaps = computed(() => sessions.value.some((session) => session.hasSecret || !!session.secretNote));
function secretNoteText(session: ImportSessionView): string { return SECRET_NOTE_KEYS[session.secretNote] ? props.t(SECRET_NOTE_KEYS[session.secretNote]) : session.secretNote; }
function chooseSource(source: ImportSource) { kind.value = source.kind; resetFileState(); step.value = 2; }
function resetFileState() {
  mainFile.value = null;
  userConfigFile.value = null;
  masterPassword.value = "";
  parsing.value = false;
  parseError.value = "";
  parseErrorCode.value = "";
  sessions.value = [];
  normalizedExport.value = null;
  exportError.value = "";
  creating.value = false;
  createError.value = "";
  createNotice.value = "";
}
function restart() { resetFileState(); kind.value = "moba"; step.value = 1; }
function onFileChange(event: Event) { const input = event.target as HTMLInputElement; mainFile.value = input.files?.[0] ?? null; input.value = ""; }
function onUserConfigChange(event: Event) { const input = event.target as HTMLInputElement; userConfigFile.value = input.files?.[0] ?? null; input.value = ""; }
/**
 * Prefer RPC chunks over binary+event ACK: DataWise workbench `sendBinary` is
 * fire-and-forget, and import ACK events were timing out in the UI even when
 * the sidecar accepted the frame. Invoke returns nextOffset synchronously.
 */
async function streamFile(taskId: string, part: "main" | "user-config", file: File) {
  for (let offset = 0; offset < file.size;) {
    const bytes = new Uint8Array(await file.slice(offset, offset + IMPORT_CHUNK_LIMIT).arrayBuffer());
    if (!bytes.byteLength) throw new Error("import file changed while reading");
    const expectedNext = offset + bytes.byteLength;
    try {
      const result = await window.datawisePlugin.invoke<{ nextOffset?: number }>(
        "import/preview/chunk",
        importPreviewChunkParams(taskId, part, offset, bytes),
        { timeoutMs: 60_000 },
      );
      const nextOffset = Number(result?.nextOffset);
      if (!Number.isFinite(nextOffset) || nextOffset !== expectedNext) {
        throw new Error(`import preview chunk offset mismatch (got ${result?.nextOffset}, expected ${expectedNext})`);
      }
      offset = nextOffset;
    } catch (cause) {
      await window.datawisePlugin.invoke("import/preview/cancel", { taskId }).catch(() => undefined);
      throw cause;
    }
  }
}
async function cancelActiveUploads() {
  const taskIds = [...activeUploads];
  activeUploads.clear();
  await Promise.all(taskIds.map((taskId) => window.datawisePlugin.invoke("import/preview/cancel", { taskId }).catch(() => undefined)));
}

onBeforeUnmount(() => { void cancelActiveUploads(); });

async function parse() {
  const file = mainFile.value;
  if (!file) return;
  parsing.value = true; parseError.value = ""; parseErrorCode.value = ""; exportError.value = ""; createError.value = ""; createNotice.value = "";
  let taskId = "";
  try {
    const started = await window.datawisePlugin.invoke<{ taskId: string }>("import/preview/start", importPreviewStartParams(kind.value, file.size, userConfigFile.value?.size ?? 0, masterPassword.value));
    taskId = started.taskId;
    activeUploads.add(taskId);
    await streamFile(taskId, "main", file);
    if (userConfigFile.value) await streamFile(taskId, "user-config", userConfigFile.value);
    const payload = await window.datawisePlugin.invoke<{ sessions?: unknown; export?: unknown }>("import/preview/finish", { taskId });
    sessions.value = parseImportSessions(payload);
    normalizedExport.value = payload.export ?? null;
    step.value = 3;
  } catch (cause) {
    parseError.value = cause instanceof Error ? cause.message : String(cause); parseErrorCode.value = importErrorCode(cause);
    if (taskId) await window.datawisePlugin.invoke("import/preview/cancel", { taskId }).catch(() => undefined);
  } finally {
    if (taskId) activeUploads.delete(taskId);
    parsing.value = false;
    masterPassword.value = "";
  }
}
async function exportPreview() {
  if (!normalizedExport.value) return;
  exporting.value = true; exportError.value = "";
  try {
    const bytes = new TextEncoder().encode(`${JSON.stringify(normalizedExport.value, null, 2)}\n`);
    const name = `${kind.value}-sessions-sanitized.json`;
    await exportSanitizedJson(bytes, name);
  } catch (cause) { exportError.value = cause instanceof Error ? cause.message : String(cause); }
  finally { exporting.value = false; }
}

async function createConnections() {
  if (creating.value || !sessions.value.length) return;
  creating.value = true;
  createError.value = "";
  createNotice.value = "";
  try {
    const drafts = hostConnectionDraftsFromExport(normalizedExport.value, sessions.value);
    if (!drafts.length) {
      createError.value = props.t("importWizard.empty");
      return;
    }
    const result = await createHostConnectionsFromImport(drafts);
    if (result == null) {
      // Host bridge has no create/import API yet — keep export + form action as the path.
      createNotice.value = props.t("importWizard.createUnavailable");
      return;
    }
    createNotice.value = props.t(hasSecretGaps.value ? "importWizard.createPartial" : "importWizard.createDone", {
      count: result.count,
    });
  } catch (cause) {
    createError.value = props.t("importWizard.createFailed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="import-wizard">
    <p class="import-steps">{{ t("importWizard.step", { current: step }) }}</p>
    <p class="import-hint">{{ t("importWizard.storageNote") }}</p>
    <template v-if="step === 1">
      <div class="import-sources"><button v-for="source in SOURCES" :key="source.kind" type="button" class="import-source" :class="{ 'is-picked': source.kind === kind }" @click="chooseSource(source)"><FolderInput /><span>{{ t(source.labelKey) }}</span></button></div>
    </template>
    <template v-else-if="step === 2">
      <p class="import-source-line">{{ t(currentSource.labelKey) }}</p>
      <div class="import-file-row"><button type="button" class="import-pick" :disabled="parsing" @click="fileInput?.click()"><FileUp />{{ t("importWizard.pickFile") }}</button><span v-if="mainFile" class="import-file-name" :title="mainFile.name">{{ t("importWizard.fileChosen", { name: mainFile.name }) }}</span><input ref="fileInput" type="file" :accept="currentSource.accept" class="import-file-input" @change="onFileChange" /></div>
      <template v-if="currentSource.windtermExtras"><div class="import-file-row"><button type="button" class="import-pick" :disabled="parsing" @click="userConfigInput?.click()">{{ t("importWizard.userConfig") }}</button><span v-if="userConfigFile" class="import-file-name" :title="userConfigFile.name">{{ t("importWizard.fileChosen", { name: userConfigFile.name }) }}</span><input ref="userConfigInput" type="file" accept="user.config" class="import-file-input" @change="onUserConfigChange" /></div><label class="import-field"><span>{{ t("importWizard.masterPassword") }}</span><input v-model="masterPassword" type="password" autocomplete="off" :placeholder="t('importWizard.masterPasswordHint')" /></label></template>
      <p v-if="parseErrorCode === 'masterPassword'" class="import-error">{{ t("importWizard.needMasterPassword") }}</p><p v-else-if="parseErrorCode === 'sizeLimit'" class="import-error">{{ t("importWizard.sizeLimit") }}</p><p v-else-if="parseError" class="import-error">{{ t("importWizard.parseFailed", { error: parseError }) }}</p><p v-if="!mainFile" class="import-hint">{{ t("importWizard.parseHint") }}</p>
      <div class="import-nav"><button type="button" class="import-back" @click="step = 1">{{ t("importWizard.back") }}</button><button type="button" class="primary-button" :disabled="!mainFile || parsing" @click="() => void parse()"><Loader2 v-if="parsing" class="spinning" /><PencilLine v-else />{{ t("importWizard.parse") }}</button></div>
    </template>
    <template v-else>
      <p v-if="hasSecretGaps" class="import-hint">{{ t("importWizard.notesBanner") }}</p>
      <div v-if="sessions.length" class="import-table-wrap"><table class="import-table"><thead><tr><th>{{ t("importWizard.col.name") }}</th><th>{{ t("importWizard.col.host") }}</th><th>{{ t("importWizard.col.user") }}</th><th>{{ t("importWizard.col.group") }}</th><th>{{ t("importWizard.col.auth") }}</th></tr></thead><tbody><tr v-for="session in sessions" :key="session.index"><td class="import-col-name" :title="session.description || session.name">{{ session.name }}</td><td class="import-col-host">{{ session.host }}<template v-if="session.port">:{{ session.port }}</template></td><td>{{ session.username }}</td><td class="import-col-group" :title="session.groupPath">{{ session.groupPath }}</td><td><span class="import-auth" :title="session.hasSecret ? t('importWizard.hasSecret') : ''">{{ session.authKind || "—" }}</span><span v-if="session.secretNote" class="import-secret-flag" :title="secretNoteText(session)">•</span></td></tr></tbody></table></div>
      <p v-else class="import-hint">{{ t("importWizard.empty") }}</p>
      <p v-if="createNotice" class="import-hint">{{ createNotice }}</p>
      <p v-if="createError" class="import-error">{{ createError }}</p>
      <p v-if="exportError" class="import-error">{{ t("importWizard.exportFailed", { error: exportError }) }}</p>
      <div class="import-nav">
        <button type="button" class="import-back" @click="step = 2">{{ t("importWizard.back") }}</button>
        <button type="button" class="primary-button" :disabled="creating || !sessions.length" @click="() => void createConnections()">
          <Loader2 v-if="creating" class="spinning" /><Plus v-else />{{ t("importWizard.create") }}
        </button>
        <button type="button" class="import-back" :disabled="exporting || !normalizedExport" @click="() => void exportPreview()">
          <Loader2 v-if="exporting" class="spinning" /><Download v-else />{{ t("importWizard.export") }}
        </button>
        <button type="button" class="import-back" @click="restart"><RotateCcw />{{ t("importWizard.restart") }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.import-wizard {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
}
.import-steps {
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
}
.import-sources {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.import-source {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  background: transparent;
  color: var(--foreground);
  font-size: var(--dw-font-size);
  text-align: left;
  cursor: pointer;
}
.import-source:hover { background: var(--accent); }
.import-source.is-picked {
  border-color: var(--primary);
  color: var(--primary);
}
.import-source svg { width: 15px; height: 15px; flex: 0 0 auto; }
.import-hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
}
.import-source-line {
  margin: 0;
  font-size: var(--dw-font-size);
  font-weight: 600;
}
.import-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.import-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 10px;
  background: transparent;
  color: var(--foreground);
  font-size: var(--dw-font-size);
  cursor: pointer;
}
.import-pick:disabled { opacity: 0.55; cursor: default; }
.import-pick svg { width: 14px; height: 14px; }
.import-file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
}
.import-file-input { display: none; }
.import-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--dw-font-size);
}
.import-field input {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 8px;
  background: var(--background);
  color: var(--foreground);
}
.import-error {
  margin: 0;
  color: var(--destructive);
  font-size: var(--dw-text-xs);
}
.import-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.import-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 10px;
  background: transparent;
  color: var(--foreground);
  font-size: var(--dw-font-size);
  cursor: pointer;
}
.import-back:disabled { opacity: 0.55; cursor: default; }
.import-back svg, .primary-button svg { width: 14px; height: 14px; }
.import-table-wrap {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.import-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-font-size);
}
.import-table th,
.import-table td {
  border-bottom: 1px solid var(--border);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.import-table th {
  color: var(--muted-foreground);
  font-weight: 600;
  position: sticky;
  top: 0;
  background: var(--background);
}
.import-col-name { font-weight: 500; }
.import-col-group, .import-col-host { color: var(--muted-foreground); }
.import-auth { font-family: var(--font-mono, ui-monospace, monospace); }
.import-secret-flag {
  margin-left: 4px;
  color: var(--muted-foreground);
}
.spinning { animation: import-spin 0.8s linear infinite; }
@keyframes import-spin { to { transform: rotate(360deg); } }
</style>
