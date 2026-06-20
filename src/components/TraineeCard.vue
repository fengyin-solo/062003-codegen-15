<template>
  <div class="trainee-card card" :class="statusClass">
    <div class="card-top">
      <h4>{{ trainee.name }}</h4>
      <span class="badge" :class="trainee.status">{{ statusLabel }}</span>
    </div>

    <div class="bars">
      <div class="bar-row">
        <span>疲劳</span>
        <div class="bar"><div class="fill fatigue" :style="{ width: trainee.fatigue + '%' }"></div></div>
        <span>{{ trainee.fatigue }}</span>
      </div>
      <div class="bar-row">
        <span>压力</span>
        <div class="bar"><div class="fill stress" :style="{ width: trainee.stress + '%' }"></div></div>
        <span>{{ trainee.stress }}</span>
      </div>
    </div>

    <div class="stats-grid">
      <div v-for="key in statKeys" :key="key" class="stat-cell">
        <span class="stat-label">{{ statLabels[key] }}</span>
        <span class="stat-val">{{ trainee.stats[key] }}</span>
      </div>
    </div>

    <div v-if="score !== null" class="score">
      综合评分 <strong>{{ score }}</strong>
      <span v-if="trainee.status === 'trainee'" class="debut-hint">
        {{ score >= debutThreshold ? '✓ 可出道' : `需 ${debutThreshold}` }}
      </span>
    </div>

    <div v-if="trainee.illnessDays > 0" class="illness">🤒 休养中 ({{ trainee.illnessDays }}天)</div>
    <div v-if="trainee.fans > 0" class="fans">个人粉丝 {{ trainee.fans.toLocaleString() }}</div>

    <div class="contract-section" v-if="trainee.contract">
      <div class="contract-row">
        <span class="contract-label">忠诚度</span>
        <div class="bar small"><div class="fill loyalty" :style="{ width: trainee.contract.loyalty + '%' }"></div></div>
        <span class="contract-val">{{ Math.round(trainee.contract.loyalty) }}</span>
      </div>
      <div class="contract-info">
        <span :class="contractStatusClass">
          {{ contractStatusText }}
        </span>
        <span class="contract-days">剩余 {{ contractDaysLeft }} 天</span>
      </div>
      <button
        v-if="canNegotiate"
        class="btn sm contract-btn"
        @click.stop="$emit('negotiate', trainee.id)"
      >
        📝 续约谈判
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  trainee: Object,
  score: { type: Number, default: null },
  currentDay: { type: Number, default: 1 },
})

defineEmits(['negotiate'])

const statKeys = GAME_CONFIG.stats
const statLabels = GAME_CONFIG.statLabels
const debutThreshold = GAME_CONFIG.rating.debutScoreThreshold

const statusLabel = computed(() => {
  const map = { trainee: '练习生', debuted: '已出道', left: '已离开' }
  return map[props.trainee.status] || props.trainee.status
})

const statusClass = computed(() => ({
  debuted: props.trainee.status === 'debuted',
  left: props.trainee.status === 'left',
  ill: props.trainee.illnessDays > 0,
}))

const contractDaysLeft = computed(() => {
  if (!props.trainee.contract) return 0
  return Math.max(0, props.trainee.contract.endDay - props.currentDay)
})

const contractStatusClass = computed(() => {
  const days = contractDaysLeft.value
  const loyalty = props.trainee.contract?.loyalty || 50
  if (days <= 0) return 'contract-status expired'
  if (days <= 7 || loyalty < 30) return 'contract-status critical'
  if (days <= 30 || loyalty < 50) return 'contract-status warning'
  return 'contract-status normal'
})

const contractStatusText = computed(() => {
  const days = contractDaysLeft.value
  const loyalty = props.trainee.contract?.loyalty || 50
  if (days <= 0) return '已到期'
  if (days <= 7 || loyalty < 30) return '高风险'
  if (days <= 30 || loyalty < 50) return '需关注'
  return '合约正常'
})

const canNegotiate = computed(() => {
  if (props.trainee.status === 'left') return false
  if (props.trainee.contract?.pendingOffer) return true
  const days = contractDaysLeft.value
  return days <= GAME_CONFIG.contract.warningDaysBeforeExpiry
})
</script>

<style scoped>
.trainee-card {
  padding: 1rem;
  transition: border-color 0.2s;
}

.trainee-card.debuted { border-color: var(--accent); }
.trainee-card.left { opacity: 0.5; }
.trainee-card.ill { border-color: var(--warning); }

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.card-top h4 { font-size: 1rem; }

.badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--bg-secondary);
}

.badge.debuted { background: var(--accent-soft); color: var(--accent); }
.badge.left { background: var(--danger-soft); color: var(--danger); }

.bars { margin-bottom: 0.75rem; }

.bar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

.bar-row span:first-child { width: 28px; color: var(--text-muted); }
.bar-row span:last-child { width: 24px; text-align: right; }

.bar {
  flex: 1;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.fill.fatigue { background: var(--warning); }
.fill.stress { background: var(--danger); }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.25rem;
  text-align: center;
}

.stat-cell {
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 0.3rem 0.1rem;
}

.stat-label { display: block; font-size: 0.65rem; color: var(--text-muted); }
.stat-val { font-weight: 700; font-size: 0.85rem; }

.score {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.debut-hint {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  color: var(--accent);
}

.illness, .fans {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  color: var(--warning);
}

.contract-section {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.contract-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}

.contract-row .contract-label { width: 45px; color: var(--text-muted); }
.contract-row .contract-val { width: 28px; text-align: right; color: var(--text-muted); }

.bar.small {
  flex: 1;
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.bar.small .fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

.bar.small .fill.loyalty {
  background: var(--accent);
}

.contract-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}

.contract-status {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
}

.contract-status.normal {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
}

.contract-status.warning {
  background: rgba(255, 152, 0, 0.15);
  color: #ff9800;
}

.contract-status.critical {
  background: rgba(244, 67, 54, 0.15);
  color: #f44336;
}

.contract-status.expired {
  background: var(--danger-soft);
  color: var(--danger);
}

.contract-days {
  color: var(--text-muted);
}

.contract-btn {
  width: 100%;
  font-size: 0.8rem;
  padding: 0.4rem 0.6rem;
}
</style>
