<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwButton, DwActionFeedback} from '@/core/components'

defineProps<{
  testing: boolean
  saving: boolean
  saveDisabled?: boolean
  testMessage: string | null
  testOk: boolean | null
  /** 保存失败等就地提示；优先展示于测试结果左侧同一区域 */
  actionMessage?: string | null
  actionOk?: boolean | null
  /** 缺连接器时可一键安装 */
  canInstallConnector?: boolean
  installingConnector?: boolean
  missingConnectorLabel?: string | null
}>()

const emit = defineEmits<{
  test: []
  cancel: []
  save: []
  installConnector: []
}>()

const {t} = useI18n()
</script>

<template>
  <footer class="conn-footer">
    <div class="conn-footer__left">
      <DwButton
          variant="secondary"
          :disabled="testing || saving || installingConnector"
          :loading="testing"
          @click="emit('test')"
      >
        {{ testing ? t('connection.testing') : t('connection.test') }}
      </DwButton>
      <DwButton
          v-if="canInstallConnector"
          variant="primary"
          :disabled="testing || saving || installingConnector"
          :loading="installingConnector"
          @click="emit('installConnector')"
      >
        {{
          installingConnector
            ? t('connection.installingConnectorShort')
            : t('connection.installConnector', {type: missingConnectorLabel || ''})
        }}
      </DwButton>
      <DwActionFeedback
          v-if="actionMessage"
          :message="actionMessage"
          :ok="actionOk ?? null"
      />
      <DwActionFeedback
          v-else
          :message="testMessage"
          :ok="testOk"
      />
    </div>
    <div class="conn-footer__right">
      <DwButton variant="secondary" :disabled="saving" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </DwButton>
      <DwButton
          variant="primary"
          :loading="saving"
          :disabled="saving || saveDisabled"
          :title="saveDisabled ? t('auth.permissionDenied') : undefined"
          @click="emit('save')"
      >
        {{ saving ? t('common.saving') : t('common.save') }}
      </DwButton>
    </div>
  </footer>
</template>

<style scoped>
.conn-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  flex-shrink: 0;
  padding: var(--dw-space-6) var(--dw-space-10) var(--dw-space-7);
  border-top: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.conn-footer__left {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
  flex: 1;
}

.conn-footer__right {
  display: flex;
  gap: var(--dw-gap);
  flex-shrink: 0;
}
</style>
