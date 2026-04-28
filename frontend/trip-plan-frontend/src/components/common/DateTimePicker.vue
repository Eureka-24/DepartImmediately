<template>
  <div ref="wrapper" class="flatpickr-wrapper">
    <input
      type="text"
      :id="id"
      class="flatpickr-input"
      :value="modelValue"
      readonly
      @click="open"
      :placeholder="placeholder"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.css'

// Chinese localization
const zh = {
  months: {
    longhand: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    shorthand: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  },
  weekdays: {
    longhand: ['日', '一', '二', '三', '四', '五', '六'],
    shorthand: ['日', '一', '二', '三', '四', '五', '六']
  },
  weekAbbreviation: '周',
  amPM: ['上午', '下午'],
  yearSuffix: '年',
  todayBtn: '今天'
}

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  id: {
    type: String,
    required: true
  },
  placeholder: {
    type: String,
    default: ''
  },
  enableTime: {
    type: Boolean,
    default: true
  },
  dateFormat: {
    type: String,
    default: 'Y-m-d H:i'
  },
  minDate: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['update:modelValue'])

const wrapper = ref(null)
let fp = null

onMounted(() => {
  fp = flatpickr(wrapper.value.querySelector('input'), {
    enableTime: props.enableTime,
    dateFormat: props.dateFormat,
    minDate: props.minDate,
    inline: false,
    position: 'auto',
    defaultDate: props.modelValue || null,
    locale: zh,
    onChange: (selectedDates, dateStr) => {
      emit('update:modelValue', dateStr)
    },
    disableMobile: true,
    prevArrow: '◀',
    nextArrow: '▶',
    // Allow year dropdown scrolling
    scrollbarWidth: 8
  })
})

onUnmounted(() => {
  if (fp) {
    fp.destroy()
  }
})

function open() {
  if (fp) {
    fp.open()
  }
}

watch(() => props.modelValue, (newVal) => {
  if (fp && newVal !== fp.input.value) {
    fp.setDate(newVal, true)
  }
})
</script>

<style>
/* Flatpickr Dark Theme Override */
.flatpickr-calendar {
  background: var(--card-bg, rgba(20, 30, 51, 0.98)) !important;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1)) !important;
  border-radius: var(--radius-md, 12px) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
  font-family: 'DM Sans', 'Microsoft YaHei', system-ui, sans-serif !important;
  width: auto !important;
  max-width: 320px;
}

.flatpickr-days {
  width: auto !important;
}

.flatpickr-day {
  color: var(--text-primary, #e2e8f0) !important;
  background: transparent !important;
  border: 1px solid transparent !important;
  border-radius: var(--radius-sm, 8px) !important;
  max-width: 40px !important;
  height: 36px !important;
  line-height: 36px !important;
}

.flatpickr-day:hover {
  background: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
  border-color: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
}

.flatpickr-day.selected {
  background: var(--amber, #f59e0b) !important;
  border-color: var(--amber, #f59e0b) !important;
  color: var(--midnight-deep, #0a0e1a) !important;
}

.flatpickr-day.inRange {
  background: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
  border-color: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
  color: var(--text-primary, #e2e8f0) !important;
}

.flatpickr-day.startRange,
.flatpickr-day.endRange {
  background: var(--amber, #f59e0b) !important;
  border-color: var(--amber, #f59e0b) !important;
  color: var(--midnight-deep, #0a0e1a) !important;
}

.flatpickr-day.selected.startRange,
.flatpickr-day.selected.endRange {
  background: var(--amber, #f59e0b) !important;
  color: var(--midnight-deep, #0a0e1a) !important;
}

.flatpickr-months {
  padding: 8px 12px !important;
}

.flatpickr-month {
  color: var(--text-bright, #f8fafc) !important;
  font-weight: 600 !important;
}

.flatpickr-prev-month,
.flatpickr-next-month {
  color: var(--text-muted, #94a3b8) !important;
  fill: var(--text-muted, #94a3b8) !important;
}

.flatpickr-prev-month:hover,
.flatpickr-next-month:hover {
  color: var(--amber, #f59e0b) !important;
  fill: var(--amber, #f59e0b) !important;
}

.flatpickr-current-month {
  padding: 4px 0 !important;
}

/* Month dropdown styling */
.flatpickr-current-month .flatpickr-monthDropdown-months {
  background: var(--card-bg, rgba(20, 30, 51, 0.8)) !important;
  color: var(--text-bright, #f8fafc) !important;
  font-weight: 600 !important;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1)) !important;
  border-radius: var(--radius-sm, 8px) !important;
  padding: 4px 8px !important;
  appearance: none !important;
  -webkit-appearance: none !important;
  cursor: pointer !important;
}

.flatpickr-current-month .flatpickr-monthDropdown-months:hover {
  border-color: var(--amber, #f59e0b) !important;
}

.flatpickr-current-month .flatpickr-monthDropdown-months option {
  background: var(--card-bg, rgba(20, 30, 51, 0.98)) !important;
  color: var(--text-primary, #e2e8f0) !important;
  padding: 8px !important;
}

/* Year input styling */
.flatpickr-current-month input.cur-year {
  color: var(--text-bright, #f8fafc) !important;
  font-weight: 600 !important;
  background: var(--card-bg, rgba(20, 30, 51, 0.8)) !important;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.1)) !important;
  border-radius: var(--radius-sm, 8px) !important;
  padding: 4px 8px !important;
}

.flatpickr-current-month input.cur-year:hover {
  border-color: var(--amber, #f59e0b) !important;
}

.flatpickr-current-month input.cur-year:focus {
  outline: none !important;
  border-color: var(--amber, #f59e0b) !important;
}

/* Year arrows (click to increment/decrement year) */
.flatpickr-current-month .flatpickr-month-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.flatpickr-current-month .flatpickr-month-nav:hover {
  background: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
}

.flatpickr-time {
  background: var(--card-bg, rgba(20, 30, 51, 0.5)) !important;
  border-top: 1px solid var(--card-border, rgba(255, 255, 255, 0.06)) !important;
  border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px) !important;
  height: 48px !important;
}

.flatpickr-time input {
  color: var(--text-primary, #e2e8f0) !important;
  background: transparent !important;
  font-size: 16px !important;
}

.flatpickr-time input:hover {
  background: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
}

.flatpickr-time input:focus {
  background: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
  outline: none !important;
}

.flatpickr-am-p-m {
  color: var(--text-muted, #94a3b8) !important;
}

.flatpickr-am-p-m:hover {
  color: var(--amber, #f59e0b) !important;
}

.flatpickr-am-p-m .flatpickr-toggle-inner {
  color: var(--text-primary, #e2e8f0) !important;
}

.numInputWrapper {
  background: transparent !important;
}

.numInputWrapper span {
  border-color: transparent !important;
  background: var(--amber-soft, rgba(245, 158, 11, 0.15)) !important;
  border-radius: 4px !important;
}

.numInputWrapper span:hover {
  background: var(--amber, #f59e0b) !important;
  color: var(--midnight-deep, #0a0e1a) !important;
}

.numInputWrapper span::after {
  border-color: transparent !important;
}

span.flatpickr-weekday {
  color: var(--text-dim, #64748b) !important;
  background: transparent !important;
  font-size: 11px !important;
  text-transform: uppercase !important;
  letter-spacing: 1px !important;
}

/* Wrapper styles */
.flatpickr-wrapper {
  width: 100%;
}

.flatpickr-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--card-bg, rgba(20, 30, 51, 0.6)) !important;
  border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06)) !important;
  border-radius: var(--radius-md, 12px) !important;
  color: var(--text-primary, #e2e8f0) !important;
  font-size: 14px !important;
  font-family: inherit !important;
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.flatpickr-input:hover {
  border-color: var(--amber, #f59e0b) !important;
}

.flatpickr-input:focus {
  outline: none !important;
  border-color: var(--amber, #f59e0b) !important;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2) !important;
}

.flatpickr-input::placeholder {
  color: var(--text-dim, #64748b) !important;
}

/* Remove default flatpickr calendar inline styles */
.flatpickr-calendar * {
  box-sizing: border-box;
}
</style>