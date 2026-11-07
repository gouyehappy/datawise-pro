<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import ToolWindowShell from '@/features/layout/components/ToolWindowShell.vue'
import {useMcpConfirmPoller} from '@/features/ai/mcp-confirm/composables/useMcpConfirmPoller'
import {mcpConfirmRequiresProductionApproval} from '@/features/ai/mcp-confirm/services/mcp-confirm-governance.service'
import type {McpConfirmTicket} from '@/features/ai/mcp-confirm/types'

const {t} = useI18n()
const {pending, drawerOpen, decidingId, decide, pendingCount} = useMcpConfirmPoller()

const subtitle = computed(() => {
    if (pendingCount.value <= 0) return undefined
    return t('mcpConfirm.pendingCount', {count: pendingCount.value})
})

function previewSql(preview: Record<string, unknown>): string | null {
    const sql = preview.sql
    return typeof sql === 'string' && sql.trim() ? sql : null
}

function needsApproval(ticket: McpConfirmTicket): boolean {
    return mcpConfirmRequiresProductionApproval(ticket.execution, ticket.preview)
}

function confirmLabel(ticket: McpConfirmTicket): string {
    return needsApproval(ticket) ? t('mcpConfirm.confirmSubmitApproval') : t('mcpConfirm.confirm')
}

function riskLabel(risk: string): string {
    if (risk === 'prod_approval') return t('mcpConfirm.riskProdApproval')
    if (risk === 'write') return t('mcpConfirm.riskWrite')
    if (risk === 'session') return t('mcpConfirm.riskSession')
    return risk
}

function close() {
    drawerOpen.value = false
}
</script>

<template>
  <ToolWindowShell
    v-if="drawerOpen"
    class="mcp-confirm-drawer"
    :title="t('mcpConfirm.title')"
    :subtitle="subtitle"
    :collapse-label="t('common.close')"
    @collapse="close"
  >
    <EmptyState
      v-if="pending.length === 0"
      embedded
      compact
      class="mcp-confirm-empty"
      :title="t('mcpConfirm.empty')"
    />

    <ul v-else class="mcp-confirm-list">
      <li
        v-for="ticket in pending"
        :key="ticket.ticketId"
        class="mcp-confirm-card"
      >
        <div class="mcp-confirm-card__meta">
          <span class="mcp-confirm-card__risk" :data-risk="ticket.risk">{{ riskLabel(ticket.risk) }}</span>
          <span class="mcp-confirm-card__tool">{{ ticket.tool }}</span>
        </div>
        <p class="mcp-confirm-card__summary">{{ ticket.summary }}</p>
        <p v-if="needsApproval(ticket)" class="mcp-confirm-card__approval-hint">
          {{ t('mcpConfirm.prodApprovalHint') }}
        </p>
        <pre
          v-if="previewSql(ticket.preview)"
          class="mcp-confirm-card__sql"
        >{{ previewSql(ticket.preview) }}</pre>
        <div class="mcp-confirm-card__actions">
          <button
            type="button"
            class="mcp-confirm-btn mcp-confirm-btn--ghost"
            :disabled="decidingId === ticket.ticketId"
            @click="decide(ticket.ticketId, 'reject')"
          >
            {{ t('mcpConfirm.reject') }}
          </button>
          <button
            type="button"
            class="mcp-confirm-btn mcp-confirm-btn--primary"
            :disabled="decidingId === ticket.ticketId"
            @click="decide(ticket.ticketId, 'confirm')"
          >
            {{ confirmLabel(ticket) }}
          </button>
        </div>
        <p class="mcp-confirm-card__expires">
          {{ t('mcpConfirm.expires', {at: ticket.expiresAt}) }}
        </p>
      </li>
    </ul>
  </ToolWindowShell>
</template>

<style scoped>
.mcp-confirm-drawer {
  position: fixed;
  right: 16px;
  bottom: 48px;
  z-index: 1200;
  width: min(420px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  box-shadow: var(--dw-shadow-lg, 0 12px 40px rgb(0 0 0 / 28%));
}

.mcp-confirm-empty {
  padding: 16px;
  min-height: 0;
}

.mcp-confirm-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  max-height: calc(70vh - 64px);
}

.mcp-confirm-card {
  border: 1px solid var(--dw-border, #333);
  border-radius: 8px;
  padding: 12px;
  background: var(--dw-surface-raised, rgb(255 255 255 / 4%));
}

.mcp-confirm-card__meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  font-size: var(--dw-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mcp-confirm-card__risk {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dw-warning-soft, #5c4b1a);
}

.mcp-confirm-card__risk[data-risk='write'],
.mcp-confirm-card__risk[data-risk='prod_approval'] {
  background: var(--dw-danger-soft, #5c1a1a);
}

.mcp-confirm-card__approval-hint {
  margin: 0 0 8px;
  font-size: var(--dw-text-sm);
  line-height: 1.4;
  color: var(--dw-danger, #dc2626);
}

.mcp-confirm-card__tool {
  color: var(--dw-text-secondary);
}

.mcp-confirm-card__summary {
  margin: 0 0 8px;
  font-size: var(--dw-text-md);
  line-height: 1.4;
}

.mcp-confirm-card__sql {
  margin: 0 0 10px;
  padding: 8px;
  max-height: 140px;
  overflow: auto;
  font-size: var(--dw-text-sm);
  border-radius: 6px;
  background: var(--dw-code-bg, rgb(0 0 0 / 35%));
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-confirm-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mcp-confirm-btn {
  border: 1px solid var(--dw-border, #444);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: var(--dw-text-sm);
  cursor: pointer;
  background: transparent;
  color: inherit;
}

.mcp-confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mcp-confirm-btn--primary {
  background: var(--dw-accent, #3b82f6);
  border-color: transparent;
  color: #fff;
}

.mcp-confirm-card__expires {
  margin: 8px 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}
</style>
