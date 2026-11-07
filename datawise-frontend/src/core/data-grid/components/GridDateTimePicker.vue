<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    buildGridCalendarCells,
    createGridDateTimeParts,
    formatGridDateTimeParts,
    normalizeGridDateTimeParts,
    parseGridDateTimeText,
    shiftGridCalendarMonth,
    type GridDateTimeParts,
    type GridTemporalKind,
} from '@/core/data-grid/services/grid-datetime.service'

const props = defineProps<{
  open: boolean
  kind: GridTemporalKind
  value: string
  anchorStyle?: {top: string; left: string}
}>()

const emit = defineEmits<{
  change: [value: string]
  close: []
  interact: []
}>()

const {t} = useI18n()

const parts = ref<GridDateTimeParts>(createGridDateTimeParts())
const viewYear = ref(parts.value.year)
const viewMonth = ref(parts.value.month)
const withMillis = ref(false)

const weekdayLabels = computed(() => [
  t('dataGrid.dateTimePicker.weekdaySun'),
  t('dataGrid.dateTimePicker.weekdayMon'),
  t('dataGrid.dateTimePicker.weekdayTue'),
  t('dataGrid.dateTimePicker.weekdayWed'),
  t('dataGrid.dateTimePicker.weekdayThu'),
  t('dataGrid.dateTimePicker.weekdayFri'),
  t('dataGrid.dateTimePicker.weekdaySat'),
])

const monthTitle = computed(() =>
    t('dataGrid.dateTimePicker.monthTitle', {year: viewYear.value, month: viewMonth.value}),
)

const calendarCells = computed(() => buildGridCalendarCells(viewYear.value, viewMonth.value))

const showCalendar = computed(() => props.kind !== 'time')
const showTime = computed(() => props.kind !== 'date')

watch(
    () => [props.open, props.value, props.kind] as const,
    ([open]) => {
      if (!open) return
      const parsed = parseGridDateTimeText(props.value, props.kind)
      parts.value = parsed
      viewYear.value = parsed.year
      viewMonth.value = parsed.month
      withMillis.value = /\.\d{1,9}\s*$/.test(props.value.trim())
    },
    {immediate: true},
)

function commit(next: GridDateTimeParts) {
  const normalized = normalizeGridDateTimeParts(next)
  parts.value = normalized
  emit('change', formatGridDateTimeParts(normalized, props.kind, {withMillis: withMillis.value}))
}

function selectDay(cell: {year: number; month: number; day: number}) {
  commit({
    ...parts.value,
    year: cell.year,
    month: cell.month,
    day: cell.day,
  })
  viewYear.value = cell.year
  viewMonth.value = cell.month
}

function shiftMonth(delta: number) {
  const next = shiftGridCalendarMonth(viewYear.value, viewMonth.value, delta)
  viewYear.value = next.year
  viewMonth.value = next.month
}

function shiftYear(delta: number) {
  viewYear.value += delta
}

function setTimeField(field: 'hour' | 'minute' | 'second', raw: string) {
  const num = Number(raw)
  if (!Number.isFinite(num)) return
  commit({...parts.value, [field]: num})
}

function useNow() {
  const now = createGridDateTimeParts()
  withMillis.value = props.kind === 'datetime'
  commit(now)
  viewYear.value = now.year
  viewMonth.value = now.month
}

function isSelectedDay(cell: {year: number; month: number; day: number}) {
  return (
      cell.year === parts.value.year
      && cell.month === parts.value.month
      && cell.day === parts.value.day
  )
}
</script>

<template>
  <Teleport to="body">
    <div
        v-if="open"
        class="grid-dt-picker"
        :style="anchorStyle"
        role="dialog"
        :aria-label="t('dataGrid.dateTimePicker.title')"
        @mousedown.prevent="emit('interact')"
    >
      <header v-if="showCalendar" class="grid-dt-picker__nav">
        <button type="button" class="grid-dt-picker__nav-btn" @click="shiftYear(-1)">«</button>
        <button type="button" class="grid-dt-picker__nav-btn" @click="shiftMonth(-1)">‹</button>
        <span class="grid-dt-picker__month">{{ monthTitle }}</span>
        <button type="button" class="grid-dt-picker__nav-btn" @click="shiftMonth(1)">›</button>
        <button type="button" class="grid-dt-picker__nav-btn" @click="shiftYear(1)">»</button>
      </header>

      <div v-if="showCalendar" class="grid-dt-picker__cal">
        <div class="grid-dt-picker__weekdays">
          <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
        </div>
        <div class="grid-dt-picker__days">
          <button
              v-for="(cell, index) in calendarCells"
              :key="`${cell.year}-${cell.month}-${cell.day}-${index}`"
              type="button"
              class="grid-dt-picker__day"
              :class="{
                'is-muted': !cell.inCurrentMonth,
                'is-selected': isSelectedDay(cell),
              }"
              @click="selectDay(cell)"
          >
            {{ cell.day }}
          </button>
        </div>
      </div>

      <footer v-if="showTime" class="grid-dt-picker__time">
        <div class="grid-dt-picker__time-fields">
          <input
              class="grid-dt-picker__time-input"
              type="text"
              inputmode="numeric"
              maxlength="2"
              :value="String(parts.hour).padStart(2, '0')"
              @change="setTimeField('hour', ($event.target as HTMLInputElement).value)"
          >
          <span>:</span>
          <input
              class="grid-dt-picker__time-input"
              type="text"
              inputmode="numeric"
              maxlength="2"
              :value="String(parts.minute).padStart(2, '0')"
              @change="setTimeField('minute', ($event.target as HTMLInputElement).value)"
          >
          <span>:</span>
          <input
              class="grid-dt-picker__time-input"
              type="text"
              inputmode="numeric"
              maxlength="2"
              :value="String(parts.second).padStart(2, '0')"
              @change="setTimeField('second', ($event.target as HTMLInputElement).value)"
          >
        </div>
        <button type="button" class="grid-dt-picker__now" @click="useNow">
          {{ t('dataGrid.dateTimePicker.now') }}
        </button>
      </footer>
      <footer v-else class="grid-dt-picker__time grid-dt-picker__time--date-only">
        <button type="button" class="grid-dt-picker__now" @click="useNow">
          {{ t('dataGrid.dateTimePicker.today') }}
        </button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.grid-dt-picker {
  position: fixed;
  z-index: var(--dw-z-window);
  width: 268px;
  padding: var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-float);
  color: var(--dw-text);
}

.grid-dt-picker__nav {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: var(--dw-space-1);
  margin-bottom: var(--dw-space-3);
}

.grid-dt-picker__month {
  text-align: center;
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.grid-dt-picker__nav-btn {
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  font-size: var(--dw-text-sm);
  line-height: 1;
}

.grid-dt-picker__nav-btn:hover {
  background: color-mix(in srgb, var(--dw-info) 10%, transparent);
  color: var(--dw-info-fg);
}

.grid-dt-picker__weekdays,
.grid-dt-picker__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--dw-space-1);
}

.grid-dt-picker__weekdays {
  margin-bottom: var(--dw-space-2);
}

.grid-dt-picker__weekdays span {
  text-align: center;
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-muted);
  font-weight: 600;
}

.grid-dt-picker__day {
  height: var(--dw-control-h-xs);
  border: none;
  border-radius: var(--dw-radius-pill);
  background: transparent;
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.grid-dt-picker__day.is-muted {
  color: var(--dw-text-muted);
  opacity: 0.55;
}

.grid-dt-picker__day:hover {
  background: color-mix(in srgb, var(--dw-info) 12%, transparent);
}

.grid-dt-picker__day.is-selected {
  background: color-mix(in srgb, var(--dw-info) 82%, var(--dw-info-fg));
  color: var(--dw-on-accent);
  font-weight: 600;
}

.grid-dt-picker__time {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin-top: var(--dw-space-3);
  padding-top: var(--dw-space-3);
  border-top: 1px solid var(--dw-border-light);
}

.grid-dt-picker__time--date-only {
  justify-content: flex-end;
}

.grid-dt-picker__time-fields {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.grid-dt-picker__time-input {
  width: 28px;
  height: var(--dw-control-h-xs);
  padding: 0;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-editor);
  color: var(--dw-text);
  text-align: center;
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
}

.grid-dt-picker__time-input:focus {
  outline: none;
  border-color: var(--dw-info);
  background: color-mix(in srgb, var(--dw-info) 78%, var(--dw-info-fg));
  color: var(--dw-on-accent);
}

.grid-dt-picker__now {
  border: none;
  background: transparent;
  color: var(--dw-info-fg);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: var(--dw-space-1) var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
}

.grid-dt-picker__now:hover {
  background: color-mix(in srgb, var(--dw-info) 10%, transparent);
}
</style>
