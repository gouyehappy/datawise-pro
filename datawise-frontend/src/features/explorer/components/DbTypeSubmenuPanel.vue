<script setup lang="ts">
import DbTypeContextPanel from '@/features/explorer/components/DbTypeContextPanel.vue'
import {toDbTypeMenuId} from '@/features/explorer/constants/explorer-add-menu'
import type {DbType} from '@/core/types'

const emit = defineEmits<{ select: [id: string] }>()

function onSelect(dbType: DbType) {
  emit('select', toDbTypeMenuId(dbType))
}
</script>

<template>
  <DbTypeContextPanel @select="onSelect"/>
</template>
