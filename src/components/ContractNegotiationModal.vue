<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal card">
      <div class="modal-header">
        <h3>📝 合约谈判</h3>
        <span class="rounds">剩余回合：{{ offer.roundsRemaining }}</span>
      </div>

      <div class="trainee-info">
        <div class="trainee-name">{{ trainee.name }}</div>
        <div class="trainee-meta">
          <span :class="statusClass">{{ statusLabel }}</span>
          <span>综合评分 {{ score }}</span>
          <span>粉丝 {{ trainee.fans.toLocaleString() }}</span>
        </div>
      </div>

      <div class="mood-section" :class="offer.traineeMood">
        <span class="mood-icon">{{ moodIcon }}</span>
        <span class="mood-text">{{ moodText }}</span>
      </div>

      <div class="stats-row">
        <div class="stat-item">
        <span class="stat-label">忠诚度</span>
        <div class="bar"><div class="fill loyalty" :style="{ width: trainee.contract.loyalty + '%' }"></div></div>
        <span class="stat-val">{{ Math.round(trainee.contract.loyalty) }}</span>
      </div>
      </div>

      <div class="contract-section">
        <div class="section-title">当前合约</div>
        <div class="contract-details">
          <div class="detail-row">
            <span>剩余期限</span>
            <span class="value">{{ daysRemaining }} 天</span>
          </div>
          <div class="detail-row">
            <span>当前分成</span>
            <span class="value">{{ (trainee.contract.revenueShare * 100).toFixed(1) }}%</span>
          </div>
          <div class="detail-row">
            <span>当前月薪</span>
            <span class="value">¥{{ trainee.contract.baseSalary.toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <div class="offer-section">
        <div class="section-title">你的报价</div>

        <div class="term-selector">
          <label>合约期限</label>
          <div class="term-buttons">
            <button
              v-for="term in termOptions"
              :key="term.days"
              class="btn sm"
              :class="{ active: selectedTerm === term.days }"
              @click="selectedTerm = term.days"
            >
              {{ term.label }}
            </button>
          </div>
        </div>

        <div class="slider-group">
          <div class="slider-header">
            <label>收入分成</label>
            <span class="slider-value">{{ (offerShare * 100).toFixed(1) }}%</span>
          </div>
          <input
            type="range"
            v-model.number="offerShare"
            :min="minShare"
            :max="maxShare"
            step="0.005"
            class="slider"
          />
          <div class="slider-hint">
            <span>期望：{{ (offer.desiredShare * 100).toFixed(1) }}%</span>
            <span v-if="shareGap > 0" class="gap warn">差距 {{ (shareGap * 100).toFixed(1) }}%</span>
            <span v-else class="gap good">已满足</span>
          </div>
        </div>

        <div class="slider-group">
          <div class="slider-header">
            <label>月薪</label>
            <span class="slider-value">¥{{ offerSalary.toLocaleString() }}</span>
          </div>
          <input
            type="range"
            v-model.number="offerSalary"
            :min="minSalary"
            :max="maxSalary"
            step="500"
            class="slider"
          />
          <div class="slider-hint">
            <span>期望：¥{{ offer.desiredSalary.toLocaleString() }}</span>
            <span v-if="salaryGap > 0" class="gap warn">差距 ¥{{ salaryGap.toLocaleString() }}</span>
            <span v-else class="gap good">已满足</span>
          </div>
        </div>
      </div>

      <div v-if="offer.negotiationFailed" class="failed-notice danger">
        ⚠️ 谈判破裂！对方已失去耐心。
      </div>

      <div class="modal-actions">
        <button class="btn primary" :disabled="!canSubmit" @click="handleNegotiate">
          提出报价
        </button>
        <button
          v-if="offer.canAccept"
          class="btn success"
          @click="$emit('accept')"
        >
          确认签约
        </button>
        <button class="btn danger" @click="$emit('reject')">
          终止谈判
        </button>
        <button class="btn ghost" @click="$emit('close')">稍后再说</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  trainee: Object,
  offer: Object,
  currentDay: Number,
  score: Number,
})

const emit = defineEmits(['close', 'negotiate', 'accept', 'reject'])

const minShare = GAME_CONFIG.contract.minRevenueShare
const maxShare = GAME_CONFIG.contract.maxRevenueShare
const minSalary = 2000
const maxSalary = 30000

const termOptions = [
  { days: 90, label: '90天' },
  { days: 180, label: '180天' },
  { days: 365, label: '1年' },
  { days: 730, label: '2年' },
]

const selectedTerm = ref(props.offer?.termDays || 365)

const offerShare = ref(props.offer?.offeredShare || GAME_CONFIG.contract.baseRevenueShare)
const offerSalary = ref(props.offer?.offeredSalary || GAME_CONFIG.contract.traineeBaseSalary)

const statusLabel = computed(() => {
  const map = { trainee: '练习生', debuted: '已出道', left: '已离开' }
  return map[props.trainee.status] || props.trainee.status
})

const statusClass = computed(() => props.trainee.status)

const daysRemaining = computed(() => props.trainee.contract.endDay - props.currentDay)

const shareGap = computed(() => {
  const gap = props.offer.desiredShare - offerShare.value
  return Math.max(0, gap)
})

const salaryGap = computed(() => {
  const gap = props.offer.desiredSalary - offerSalary.value
  return Math.max(0, gap)
})

const moodIcon = computed(() => {
  const map = { happy: '😊', neutral: '😐', unhappy: '😟', angry: '😠' }
  return map[props.offer.traineeMood] || '😐'
})

const moodText = computed(() => {
  const map = {
    happy: '非常满意',
    neutral: '尚可接受',
    unhappy: '不太满意',
    angry: '非常不满',
  }
  return map[props.offer.traineeMood] || '尚可接受'
})

const canSubmit = computed(() => {
  return props.offer.roundsRemaining > 0 && !props.offer.negotiationFailed
})

function handleNegotiate() {
  if (!canSubmit.value) return
  emit('negotiate', offerShare.value, offerSalary.value, selectedTerm.value)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 130;
  padding: 1rem;
}

.modal {
  max-width: 480px;
  width: 100%;
  padding: 1.5rem;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-header h3 { margin: 0; }

.rounds {
  font-size: 0.85rem;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
}

.trainee-info {
  background: var(--bg-secondary);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
}

.trainee-name {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}

.trainee-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.trainee-meta .debuted { color: var(--accent); }

.mood-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.mood-section.happy { background: rgba(76, 175, 80, 0.15); color: #4caf50; }
.mood-section.neutral { background: var(--bg-secondary); color: var(--text-secondary); }
.mood-section.unhappy { background: rgba(255, 152, 0, 0.15); color: #ff9800; }
.mood-section.angry { background: rgba(244, 67, 54, 0.15); color: #f44336; }

.mood-icon { font-size: 1.2rem; }

.stats-row {
  margin-bottom: 0.75rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.stat-item .stat-label { width: 50px; color: var(--text-muted); }
.stat-item .stat-val { width: 30px; text-align: right; }

.stat-item .bar {
  flex: 1;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.stat-item .fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.stat-item .fill.loyalty { background: var(--accent); }

.section-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.contract-section,
.offer-section {
  background: var(--bg-secondary);
  padding: 0.75rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
}

.contract-details {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
}

.detail-row .value {
  font-weight: 600;
  color: var(--text-primary);
}

.slider-group {
  margin-bottom: 0.75rem;
}

.slider-group:last-child {
  margin-bottom: 0;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
}

.slider-value {
  font-weight: 600;
  color: var(--accent);
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-primary);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  transition: transform 0.15s;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: none;
}

.slider-hint {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.slider-hint .gap.warn { color: var(--danger); }
.slider-hint .gap.good { color: var(--success, #4caf50); }

.term-selector {
  margin-bottom: 0.75rem;
}

.term-selector label {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 0.35rem;
  color: var(--text-secondary);
}

.term-buttons {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.term-buttons .btn {
  flex: 1;
  min-width: 70px;
}

.term-buttons .btn.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.failed-notice {
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  text-align: center;
}

.failed-notice.danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.modal-actions .btn {
  flex: 1;
  min-width: 100px;
}

.btn.success {
  background: #4caf50;
  border-color: #4caf50;
  color: white;
}

.btn.success:hover {
  background: #43a047;
}
</style>
