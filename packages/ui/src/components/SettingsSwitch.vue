<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    hint?: string
    disabled?: boolean
    /** Only render the pill control (compose with SettingsRow). */
    bare?: boolean
  }>(),
  {
    disabled: false,
    bare: false,
  },
)

const model = defineModel<boolean>({required: true})
</script>

<template>
  <label
      class="settings-switch"
      :class="{'is-disabled': disabled, 'settings-switch--bare': bare}"
  >
    <span v-if="!bare" class="settings-switch__body">
      <span class="settings-switch__label">{{ label }}</span>
      <span v-if="hint" class="settings-switch__hint">{{ hint }}</span>
    </span>
    <span class="settings-switch__control">
      <input
          v-model="model"
          type="checkbox"
          role="switch"
          :disabled="disabled"
          :aria-label="bare ? label : undefined"
      />
      <span class="settings-switch__track" aria-hidden="true">
        <span class="settings-switch__thumb"/>
      </span>
    </span>
  </label>
</template>

<style scoped>
/*
 * Geometry aligned to Cursor molten Switch size=regular
 *   track 30×18, thumb travel 12px
 * 选中轨道用中性色，靠滑块位置区分状态，不依赖彩色（4 套皮肤通用）。
 */
.settings-switch {
  --settings-switch-w: 30px;
  --settings-switch-h: 18px;
  --settings-switch-thumb: 14px;
  --settings-switch-inset: 2px;
  --settings-switch-travel: 12px;
  --settings-switch-on: color-mix(in srgb, var(--dw-text) 62%, var(--dw-bg-panel));

  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--dw-gap-lg);
  padding: var(--dw-space-3) 0;
  cursor: pointer;
}

.settings-switch--bare {
  display: inline-flex;
  grid-template-columns: none;
  padding: 0;
}

.settings-switch__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.settings-switch__label {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
  line-height: var(--dw-leading-snug);
}

.settings-switch__hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.settings-switch__control {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.settings-switch__control input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
  z-index: 1;
}

.settings-switch__track {
  position: relative;
  display: block;
  width: var(--settings-switch-w);
  height: var(--settings-switch-h);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 16%, transparent);
  transition: background 0.14s ease;
  box-sizing: border-box;
}

.settings-switch__thumb {
  position: absolute;
  top: var(--settings-switch-inset);
  left: var(--settings-switch-inset);
  width: var(--settings-switch-thumb);
  height: var(--settings-switch-thumb);
  /* 滑块与轨道同用 --dw-radius-pill：直角皮肤(ide/ledger)下整体直角，圆润皮肤下保持胶囊+圆滑块 */
  border-radius: var(--dw-radius-pill, 999px);
  background: #fff;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 22%, transparent);
  transition: transform 0.14s ease;
}

.settings-switch__control input:checked + .settings-switch__track {
  background: var(--settings-switch-on);
}

.settings-switch__control input:checked + .settings-switch__track .settings-switch__thumb {
  transform: translateX(var(--settings-switch-travel));
}

.settings-switch__control input:focus-visible + .settings-switch__track {
  outline: 2px solid color-mix(in srgb, var(--dw-text) 45%, transparent);
  outline-offset: 2px;
}

.settings-switch__control input:active:not(:disabled) + .settings-switch__track .settings-switch__thumb {
  /* slight press squash like Cursor active transition */
  transform: translateX(0) scaleX(1.05);
}

.settings-switch__control input:checked:active:not(:disabled) + .settings-switch__track .settings-switch__thumb {
  transform: translateX(var(--settings-switch-travel)) scaleX(1.05);
}

.settings-switch.is-disabled,
.settings-switch:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.72;
}
</style>
