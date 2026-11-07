<script setup lang="ts">
import {DwIcon} from '@/core/icons'
import type {DwIconName} from '@/core/icons'

withDefaults(
    defineProps<{
      title: string
      content: string
      icon?: DwIconName
    }>(),
    {
      icon: 'shortcuts',
    },
)
</script>

<template>
  <section class="tips-card">
    <div class="tips-card__icon" aria-hidden="true">
      <DwIcon :name="icon" size="rail" :stroke-width="1.7"/>
    </div>
    <div class="tips-card__body">
      <h3>{{ title }}</h3>
      <p>{{ content }}</p>
    </div>
  </section>
</template>
