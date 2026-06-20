<template>
  <div class="game-view">
    <GameHeader
      :state="state"
      :days-left="daysLeft"
      :profit="profit"
      :theme="theme"
      @back="$emit('back')"
      @toggle-theme="$emit('toggle-theme')"
    />

    <div class="game-body">
      <aside class="sidebar">
        <div class="trainee-grid">
          <TraineeCard
            v-for="t in activeTrainees"
            :key="t.id"
            :trainee="t"
            :score="calcScore(t)"
            :current-day="state.day"
            @negotiate="openNegotiation"
          />
        </div>
      </aside>

      <main class="main-panel">
        <SchedulePanel
          :trainees="activeTrainees"
          :schedule="state.schedule"
          :can-end="canEndDay"
          @set="(id, act) => $emit('set-schedule', id, act)"
          @clear="$emit('clear-schedule')"
          @end-day="$emit('end-day')"
        />
        <DayLog :logs="state.logs" />
      </main>

      <aside class="right-panel">
        <GroupsPanel
          :groups="state.groups"
          :trainees="state.trainees"
          :money="state.money"
          :current-day="state.day"
          @release="(id) => $emit('release-single', id)"
        />
        <RelationshipPanel
          :trainees="state.trainees"
          :relationships="state.relationships"
        />
      </aside>
    </div>

    <RatingModal
      v-if="state.pendingRating && state.gameStatus === 'playing'"
      :results="ratingResults"
      @close="$emit('dismiss-rating')"
      @debut="showDebut = true"
    />

    <DebutModal
      v-if="showDebut"
      :candidates="ratingResults"
      @close="showDebut = false"
      @confirm="onDebut"
    />

    <EventModal
      v-if="state.pendingEvent"
      :event="state.pendingEvent"
      @resolve="(keep) => $emit('resolve-poaching', keep)"
    />

    <ContractNegotiationModal
      v-if="negotiatingTrainee"
      :trainee="negotiatingTrainee"
      :offer="negotiatingTrainee.contract.pendingOffer"
      :current-day="state.day"
      :score="calcScore(negotiatingTrainee)"
      @close="negotiatingTrainee = null"
      @negotiate="handleNegotiate"
      @accept="handleAcceptContract"
      @reject="handleRejectContract"
    />

    <GameOverModal
      v-if="state.gameStatus !== 'playing'"
      :status="state.gameStatus"
      :state="state"
      :profit="profit"
      @back="$emit('back')"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import GameHeader from './GameHeader.vue'
import TraineeCard from './TraineeCard.vue'
import SchedulePanel from './SchedulePanel.vue'
import DayLog from './DayLog.vue'
import GroupsPanel from './GroupsPanel.vue'
import RelationshipPanel from './RelationshipPanel.vue'
import RatingModal from './RatingModal.vue'
import DebutModal from './DebutModal.vue'
import EventModal from './EventModal.vue'
import ContractNegotiationModal from './ContractNegotiationModal.vue'
import GameOverModal from './GameOverModal.vue'

const props = defineProps({
  state: Object,
  activeTrainees: Array,
  daysLeft: Number,
  profit: Number,
  theme: String,
  canEndDay: Boolean,
  ratingResults: Array,
  calcScore: Function,
})

const emit = defineEmits([
  'back',
  'toggle-theme',
  'set-schedule',
  'clear-schedule',
  'end-day',
  'dismiss-rating',
  'debut',
  'resolve-poaching',
  'release-single',
  'start-negotiation',
  'negotiate-contract',
  'accept-contract',
  'reject-contract',
])

const showDebut = ref(false)
const toast = ref('')
const negotiatingTraineeId = ref(null)

const negotiatingTrainee = computed(() => {
  if (!negotiatingTraineeId.value || !props.state) return null
  return props.state.trainees.find((t) => t.id === negotiatingTraineeId.value)
})

function openNegotiation(traineeId) {
  const trainee = props.state.trainees.find((t) => t.id === traineeId)
  if (!trainee) return
  if (!trainee.contract?.pendingOffer) {
    emit('start-negotiation', traineeId, (result) => {
      if (result?.success) {
        negotiatingTraineeId.value = traineeId
      } else if (result?.message) {
        showToast(result.message)
      }
    })
  } else {
    negotiatingTraineeId.value = traineeId
  }
}

function handleNegotiate(share, salary, term) {
  if (!negotiatingTraineeId.value) return
  emit('negotiate-contract', negotiatingTraineeId.value, share, salary, term, (result) => {
    if (result?.success) {
      if (result.offer?.negotiationFailed) {
        showToast('谈判破裂！对方已失去耐心。')
      }
    } else if (result?.message) {
      showToast(result.message)
    }
  })
}

function handleAcceptContract() {
  if (!negotiatingTraineeId.value) return
  emit('accept-contract', negotiatingTraineeId.value, (result) => {
    if (result?.success) {
      showToast('🎉 签约成功！')
      setTimeout(() => { negotiatingTraineeId.value = null }, 500)
    } else if (result?.message) {
      showToast(result.message)
    }
  })
}

function handleRejectContract() {
  if (!negotiatingTraineeId.value) return
  emit('reject-contract', negotiatingTraineeId.value, (result) => {
    if (result?.success) {
      showToast('谈判终止')
      negotiatingTraineeId.value = null
    } else if (result?.message) {
      showToast(result.message)
    }
  })
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2500)
}

function onDebut(memberIds, groupName) {
  emit('debut', memberIds, groupName, (result) => {
    if (result?.success) {
      showDebut.value = false
      showToast('出道成功！')
    } else if (result?.message) {
      showToast(result.message)
    }
  })
}
</script>

<style scoped>
.game-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.game-body {
  display: grid;
  grid-template-columns: 1fr 1.1fr 0.9fr;
  gap: 1rem;
  padding: 1rem;
  flex: 1;
}

@media (max-width: 1100px) {
  .game-body {
    grid-template-columns: 1fr;
  }
}

.sidebar .trainee-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.main-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  border: 1px solid var(--accent);
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  z-index: 200;
  box-shadow: var(--shadow);
}
</style>
