<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  modelValue: {
    password: string;
    privateKey: string;
    passphrase: string;
  };
  zh?: boolean;
  /** When editing, password/key may be optional (leave blank to keep). */
  optionalSecrets?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: typeof props.modelValue];
}>();

const authMode = ref<'password' | 'key'>(
  props.modelValue.privateKey?.trim() ? 'key' : 'password',
);
const showPassword = ref(false);
const showPassphrase = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function t(en: string, cn: string) {
  return props.zh ? cn : en;
}

const local = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function patch(partial: Partial<typeof props.modelValue>) {
  emit('update:modelValue', { ...props.modelValue, ...partial });
}

function onPickKey() {
  fileInput.value?.click();
}

async function onKeyFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  patch({ privateKey: text });
  authMode.value = 'key';
  input.value = '';
}

function setMode(mode: 'password' | 'key') {
  authMode.value = mode;
}
</script>

<template>
  <div class="ssh-auth">
    <div class="seg">
      <button
        type="button"
        class="seg-btn"
        :class="{ active: authMode === 'password' }"
        @click="setMode('password')"
      >
        {{ t('Password', '密码') }}
      </button>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: authMode === 'key' }"
        @click="setMode('key')"
      >
        {{ t('Private key', '私钥') }}
      </button>
    </div>

    <label v-if="authMode === 'password'" class="field">
      <span>
        {{
          optionalSecrets
            ? t('Password (leave blank to keep)', '密码（留空则保留）')
            : t('Password', '密码')
        }}
      </span>
      <div class="input-row">
        <input
          :value="local.password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="off"
          @input="patch({ password: ($event.target as HTMLInputElement).value })"
        />
        <button type="button" class="btn sm ghost" @click="showPassword = !showPassword">
          {{ showPassword ? t('Hide', '隐藏') : t('Show', '显示') }}
        </button>
      </div>
    </label>

    <template v-else>
      <label class="field">
        <span>
          {{
            optionalSecrets
              ? t('Private key PEM (optional replace)', '私钥 PEM（可选替换）')
              : t('Private key (PEM)', '私钥 (PEM)')
          }}
        </span>
        <textarea
          :value="local.privateKey"
          spellcheck="false"
          rows="5"
          @input="patch({ privateKey: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>
      <div class="key-actions">
        <button type="button" class="btn sm" @click="onPickKey">
          {{ t('Load key file…', '选择密钥文件…') }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".pem,.key,.txt,*"
          class="hidden-file"
          @change="onKeyFile"
        />
        <span class="host-meta">{{ t('OpenSSH / PEM', '支持 OpenSSH / PEM') }}</span>
      </div>
      <label class="field">
        <span>{{ t('Key passphrase', '私钥口令') }}</span>
        <div class="input-row">
          <input
            :value="local.passphrase"
            :type="showPassphrase ? 'text' : 'password'"
            autocomplete="off"
            @input="patch({ passphrase: ($event.target as HTMLInputElement).value })"
          />
          <button type="button" class="btn sm ghost" @click="showPassphrase = !showPassphrase">
            {{ showPassphrase ? t('Hide', '隐藏') : t('Show', '显示') }}
          </button>
        </div>
      </label>
    </template>
  </div>
</template>

<style scoped>
.ssh-auth {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  align-self: flex-start;
}

.seg-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 0 12px;
  height: 26px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.seg-btn.active {
  background: var(--action-soft);
  color: var(--action-hi);
}

.input-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.input-row input {
  flex: 1;
  min-width: 0;
}

.key-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hidden-file {
  display: none;
}
</style>
