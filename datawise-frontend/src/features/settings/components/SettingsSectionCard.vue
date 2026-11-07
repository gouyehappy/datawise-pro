<script setup lang="ts">
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'

withDefaults(
    defineProps<{
      title: string
      hint?: string
      icon?: DwIconName
      tone?: 'primary' | 'sky' | 'violet' | 'panel'
      badge?: string
      compactHead?: boolean
    }>(),
    {
      tone: 'primary',
      compactHead: false,
    },
)
</script>

<template>
  <section class="shortcut-card">
    <div
        class="shortcut-card__head"
        :class="{'setting-card__head--compact': compactHead}"
    >
      <div
          v-if="icon"
          class="shortcut-card__icon"
          :class="{
            'shortcut-card__icon--primary': tone === 'primary',
            'shortcut-card__icon--sky': tone === 'sky',
            'shortcut-card__icon--violet': tone === 'violet',
            'setting-card__icon--panel': tone === 'panel',
          }"
          aria-hidden="true"
      >
        <DwIcon :name="icon" size="lg" :stroke-width="1.7"/>
      </div>
      <div class="shortcut-card__copy">
        <h3>{{ title }}</h3>
        <p v-if="hint" class="hint">{{ hint }}</p>
      </div>
      <span v-if="badge != null && badge !== ''" class="count-badge">{{ badge }}</span>
    </div>
    <div class="setting-card__body">
      <slot/>
    </div>
  </section>
</template>
