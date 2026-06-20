<template>
  <div class="groups-panel card">
    <h3>🌟 出道组合 · 合约管理</h3>
    <div v-if="groups.length === 0" class="empty">暂无出道组合</div>

    <div v-for="gs in groupStatus" :key="gs.groupId" class="group-item">
      <div class="group-head">
        <div class="group-title">
          <strong>{{ gs.groupName }}</strong>
          <span class="debut-day">第 {{ getGroup(gs.groupId).debutedDay }} 天出道</span>
        </div>
        <div class="group-risk-badge" :class="highestRisk(gs)">
          {{ riskLabel(highestRisk(gs)) }}
        </div>
      </div>

      <div class="group-stats">
        <span>总销量 {{ gs.totalSales.toLocaleString() }}</span>
        <span>{{ gs.singlesCount }} 张单曲</span>
        <span>月薪 ¥{{ gs.totalMonthlySalary.toLocaleString() }}</span>
        <span>平均分成 {{ (gs.avgRevenueShare * 100).toFixed(1) }}%</span>
      </div>

      <div class="risk-counts">
        <span v-if="gs.riskCounts.critical > 0" class="risk critical">
          🔴 高危 {{ gs.riskCounts.critical }}
        </span>
        <span v-if="gs.riskCounts.high > 0" class="risk high">
          🟠 风险 {{ gs.riskCounts.high }}
        </span>
        <span v-if="gs.riskCounts.medium > 0" class="risk medium">
          🟡 关注 {{ gs.riskCounts.medium }}
        </span>
        <span v-if="gs.expiringCount > 0" class="expiring">
          ⚠️ {{ gs.expiringCount }} 人合约即将到期
        </span>
      </div>

      <div v-if="gs.expiringCount > 0 || showAllMembers[gs.groupId]" class="members-list">
        <div
          v-for="mc in gs.members"
          :key="mc.trainee.id"
          class="member-row"
          :class="{ expiring: mc.daysRemaining <= 30, negotiating: mc.hasPendingOffer }"
        >
          <div class="member-info">
            <span class="member-name">{{ mc.trainee.name }}</span>
            <span class="member-status" :class="mc.trainee.status">
              {{ mc.trainee.status === 'debuted' ? '已出道' : '练习生' }}
            </span>
          </div>

          <div class="member-contract">
            <div class="contract-detail">
              <span class="contract-label">剩余</span>
              <span
                class="contract-value"
                :class="{
                  danger: mc.daysRemaining <= 7,
                  warning: mc.daysRemaining <= 30 && mc.daysRemaining > 7,
                }"
              >
                {{ mc.daysRemaining }} 天
              </span>
            </div>
            <div class="contract-detail">
              <span class="contract-label">忠诚度</span>
              <div class="loyalty-bar">
                <div
                  class="loyalty-fill"
                  :class="loyaltyClass(mc.loyalty)"
                  :style="{ width: mc.loyalty + '%' }"
                ></div>
              </div>
              <span class="contract-value">{{ Math.round(mc.loyalty) }}</span>
            </div>
            <div class="contract-detail">
              <span class="contract-label">分成</span>
              <span class="contract-value">{{ (mc.revenueShare * 100).toFixed(1) }}%</span>
            </div>
          </div>

          <button
            v-if="mc.daysRemaining <= warningDays || mc.hasPendingOffer"
            class="btn sm"
            :class="mc.hasPendingOffer ? 'primary' : 'outline'"
            @click="$emit('negotiate', mc.trainee.id)"
          >
            {{ mc.hasPendingOffer ? '继续谈判' : '续约谈判' }}
          </button>
          <span v-else class="status-ok">✓ 正常</span>
        </div>
      </div>

      <div class="group-footer">
        <button
          v-if="gs.members.length > 0 && !showAllMembers[gs.groupId]"
          class="btn ghost sm toggle-btn"
          @click="toggleAllMembers(gs.groupId)"
        >
          展开全部成员合约
        </button>
        <button
          v-if="showAllMembers[gs.groupId]"
          class="btn ghost sm toggle-btn"
          @click="toggleAllMembers(gs.groupId)"
        >
          收起成员列表
        </button>
        <button
          class="btn primary sm release-btn"
          :disabled="money < singleCost"
          @click="$emit('release', gs.groupId)"
        >
          发行单曲 (¥{{ singleCost.toLocaleString() }})
        </button>
      </div>
    </div>

    <div v-if="groupStatus.length > 0" class="contract-summary">
      <h4>📊 经营概览</h4>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">月度总薪资</span>
          <span class="summary-value">¥{{ totalMonthlySalary.toLocaleString() }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">累计分成支出</span>
          <span class="summary-value">¥{{ totalSharePayout.toLocaleString() }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">平均忠诚度</span>
          <span class="summary-value">{{ avgLoyalty.toFixed(0) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">待处理谈判</span>
          <span class="summary-value highlight" v-if="pendingCount > 0">{{ pendingCount }}</span>
          <span class="summary-value" v-else>0</span>
        </div>
      </div>
    </div>

    <div v-if="recentHistory.length > 0" class="contract-history">
      <h4>📋 近期动态</h4>
      <div class="history-list">
        <div v-for="(item, idx) in recentHistory" :key="idx" class="history-item">
          <span class="history-day">第{{ item.day }}天</span>
          <span class="history-type" :class="item.type">{{ historyLabel(item) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  groups: Array,
  trainees: Array,
  money: Number,
  currentDay: { type: Number, default: 1 },
  groupStatus: { type: Array, default: () => [] },
  contractSummary: { type: Object, default: null },
})

defineEmits(['release', 'negotiate'])

const singleCost = GAME_CONFIG.single.creationCost
const warningDays = GAME_CONFIG.contract.warningDaysBeforeExpiry

const showAllMembers = ref({})

function toggleAllMembers(groupId) {
  showAllMembers.value = {
    ...showAllMembers.value,
    [groupId]: !showAllMembers.value[groupId],
  }
}

function getGroup(groupId) {
  return props.groups.find((g) => g.id === groupId) || {}
}

function highestRisk(gs) {
  if (gs.riskCounts.critical > 0) return 'critical'
  if (gs.riskCounts.high > 0) return 'high'
  if (gs.riskCounts.medium > 0) return 'medium'
  return 'low'
}

function riskLabel(risk) {
  const map = { low: '✓ 正常', medium: '需关注', high: '风险', critical: '高危' }
  return map[risk] || '正常'
}

function loyaltyClass(loyalty) {
  if (loyalty < 30) return 'danger'
  if (loyalty < 50) return 'warning'
  return 'good'
}

function historyLabel(item) {
  switch (item.type) {
    case 'renewal':
      return `${item.traineeName} 续约成功`
    case 'negotiation_failed':
      return `${item.traineeName} 谈判破裂`
    case 'departure':
      return `${item.traineeName} 已离队`
    case 'share_payout':
      return `${item.groupName} 分成支出 ¥${item.totalPayout.toLocaleString()}`
    default:
      return item.type
  }
}

const totalMonthlySalary = computed(() =>
  props.groupStatus.reduce((s, g) => s + g.totalMonthlySalary, 0)
)

const totalSharePayout = computed(() =>
  props.contractSummary?.totalSharePayout || 0
)

const avgLoyalty = computed(() =>
  props.contractSummary?.avgLoyalty || 0
)

const pendingCount = computed(() =>
  props.contractSummary?.pendingNegotiations || 0
)

const recentHistory = computed(() =>
  props.contractSummary?.recentHistory || []
)
</script>

<style scoped>
.groups-panel h3 {
  margin-bottom: 0.75rem;
}

.empty {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.group-item {
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 0.75rem;
}

.group-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.group-title {
  display: flex;
  flex-direction: column;
}

.group-title strong {
  font-size: 1rem;
}

.debut-day {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.group-risk-badge {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.group-risk-badge.low {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
}

.group-risk-badge.medium {
  background: rgba(255, 152, 0, 0.15);
  color: #ff9800;
}

.group-risk-badge.high {
  background: rgba(255, 87, 34, 0.15);
  color: #ff5722;
}

.group-risk-badge.critical {
  background: rgba(244, 67, 54, 0.15);
  color: #f44336;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.group-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.risk-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}

.risk {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}

.risk.critical {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}

.risk.high {
  background: rgba(255, 87, 34, 0.1);
  color: #ff5722;
}

.risk.medium {
  background: rgba(255, 152, 0, 0.1);
  color: #ff9800;
}

.expiring {
  background: rgba(255, 152, 0, 0.1);
  color: #ff9800;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}

.members-list {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--bg-primary);
  border-radius: 6px;
  margin-bottom: 0.4rem;
  transition: all 0.2s;
}

.member-row.expiring {
  border-left: 3px solid #ff9800;
}

.member-row.negotiating {
  border-left: 3px solid var(--accent);
  background: rgba(var(--accent-rgb), 0.05);
}

.member-info {
  display: flex;
  flex-direction: column;
  min-width: 70px;
}

.member-name {
  font-weight: 600;
  font-size: 0.85rem;
}

.member-status {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.member-status.debuted {
  color: var(--accent);
}

.member-contract {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  justify-content: center;
}

.contract-detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 55px;
}

.contract-label {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.contract-value {
  font-size: 0.75rem;
  font-weight: 600;
}

.contract-value.danger {
  color: #f44336;
}

.contract-value.warning {
  color: #ff9800;
}

.loyalty-bar {
  width: 50px;
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.loyalty-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

.loyalty-fill.good {
  background: #4caf50;
}

.loyalty-fill.warning {
  background: #ff9800;
}

.loyalty-fill.danger {
  background: #f44336;
}

.status-ok {
  font-size: 0.75rem;
  color: #4caf50;
  min-width: 60px;
  text-align: center;
}

.btn.outline {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
}

.btn.outline:hover {
  background: var(--accent-soft);
}

.group-footer {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.toggle-btn {
  flex: 1;
  font-size: 0.75rem;
}

.release-btn {
  flex: 1;
  font-size: 0.75rem;
}

.contract-summary {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.contract-summary h4 {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.summary-label {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.summary-value {
  font-size: 0.95rem;
  font-weight: 700;
}

.summary-value.highlight {
  color: var(--accent);
}

.contract-history {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.contract-history h4 {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 120px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
  padding: 0.25rem 0.4rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.history-day {
  color: var(--text-muted);
  min-width: 50px;
}

.history-type {
  flex: 1;
}

.history-type.renewal {
  color: #4caf50;
}

.history-type.negotiation_failed {
  color: #ff9800;
}

.history-type.departure {
  color: #f44336;
}

.history-type.share_payout {
  color: var(--accent);
}
</style>
