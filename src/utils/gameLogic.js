import { GAME_CONFIG } from '../config/gameConfig'
import { randInt, randFloat, pickRandom, weightedPick, clamp, pairKey } from './random'

const CFG = GAME_CONFIG

export function createInitialGameState() {
  const names = [...CFG.names].sort(() => Math.random() - 0.5)
  const trainees = []
  for (let i = 0; i < CFG.initial.traineeCount; i++) {
    trainees.push(createTrainee(names[i], i))
  }
  return {
    day: 1,
    money: CFG.initial.money,
    fans: CFG.initial.fans,
    totalRevenue: 0,
    totalExpenses: 0,
    trainees,
    groups: [],
    relationships: initRelationships(trainees),
    schedule: {},
    logs: [{ day: 1, text: '事务所成立！五位练习生已就位，三年征途正式开始。' }],
    pendingEvent: null,
    pendingRating: false,
    gameStatus: 'playing',
    lastSingleDay: {},
  }
}

function createTrainee(name, index) {
  const stats = {}
  for (const key of CFG.stats) {
    stats[key] = randInt(CFG.initial.statMin, CFG.initial.statMax)
  }
  return {
    id: `t${index}_${Date.now()}`,
    name,
    stats,
    fatigue: CFG.initial.fatigue + randInt(-5, 5),
    stress: CFG.initial.stress + randInt(-3, 3),
    status: 'trainee',
    groupId: null,
    illnessDays: 0,
    poachResist: randInt(40, 70),
    fans: 0,
    singlesReleased: 0,
    contract: {
      startDay: 1,
      endDay: CFG.contract.initialTermDays,
      revenueShare: CFG.contract.baseRevenueShare,
      baseSalary: CFG.contract.traineeBaseSalary,
      loyalty: randInt(55, 80),
      negotiated: false,
      pendingOffer: null,
    },
  }
}

function initRelationships(trainees) {
  const rel = {}
  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      rel[pairKey(trainees[i].id, trainees[j].id)] = randInt(
        CFG.relationships.initialRange[0],
        CFG.relationships.initialRange[1]
      )
    }
  }
  return rel
}

export function calcTraineeScore(trainee) {
  const w = CFG.rating.scoreWeights
  let score = 0
  for (const key of CFG.stats) {
    score += trainee.stats[key] * w[key]
  }
  const fatiguePenalty = trainee.fatigue > CFG.thresholds.fatigueExhausted ? 0.85 : 1
  const stressPenalty = trainee.stress > CFG.thresholds.stressHigh ? 0.9 : 1
  return Math.round(score * fatiguePenalty * stressPenalty)
}

export function getRelationship(relationships, idA, idB) {
  return relationships[pairKey(idA, idB)] ?? 0
}

export function setRelationship(relationships, idA, idB, value) {
  relationships[pairKey(idA, idB)] = clamp(
    value,
    CFG.relationships.min,
    CFG.relationships.max
  )
}

export function getActiveTrainees(state) {
  return state.trainees.filter((t) => t.status !== 'left')
}

export function getDebutedTrainees(state) {
  return state.trainees.filter((t) => t.status === 'debuted')
}

export function calcProfit(state) {
  return state.totalRevenue - state.totalExpenses
}

export function checkVictory(state) {
  const profit = calcProfit(state)
  const groups = state.groups.length
  const goalsMet =
    groups >= CFG.victory.targetGroups &&
    (!CFG.victory.requirePositiveProfit || profit > 0)

  if (goalsMet) return 'won'

  if (state.day > CFG.victory.totalDays) {
    if (groups < CFG.victory.targetGroups) return 'lost_groups'
    if (CFG.victory.requirePositiveProfit && profit <= 0) return 'lost_profit'
  }
  if (state.money < -20000) return 'lost_bankrupt'
  const active = getActiveTrainees(state)
  if (active.length === 0 && state.groups.length === 0) return 'lost_empty'
  return null
}

function applyRange(val, range, mult = 1) {
  if (!range || range.length < 2) return val
  return val + randInt(Math.round(range[0] * mult), Math.round(range[1] * mult))
}

function getTrainingMultiplier(trainee, partners, relationships) {
  let mult = 1
  if (trainee.fatigue >= CFG.thresholds.fatigueExhausted) mult *= 0.5
  if (trainee.stress >= CFG.thresholds.stressHigh) mult *= 0.8
  if (trainee.stress >= CFG.thresholds.stressBreakdown) mult *= 0

  let synergyCount = 0
  for (const p of partners) {
    const rel = getRelationship(relationships, trainee.id, p.id)
    if (rel >= CFG.relationships.synergyThreshold) synergyCount++
  }
  if (synergyCount > 0) {
    mult *= 1 + CFG.relationships.synergyBonus * Math.min(synergyCount, 2)
  }
  return mult
}

export function processDay(state) {
  const logs = []
  let money = state.money
  let fans = state.fans
  let totalExpenses = state.totalExpenses
  const relationships = { ...state.relationships }
  const trainees = state.trainees.map((t) => ({
    ...t,
    stats: { ...t.stats },
    contract: { ...t.contract, pendingOffer: t.contract?.pendingOffer ? { ...t.contract.pendingOffer } : null },
  }))
  const schedule = state.schedule

  const activityGroups = {}
  for (const [traineeId, activity] of Object.entries(schedule)) {
    if (!activityGroups[activity]) activityGroups[activity] = []
    activityGroups[activity].push(traineeId)
  }

  for (const trainee of trainees) {
    if (trainee.status === 'left') continue

    if (trainee.illnessDays > 0) {
      trainee.illnessDays--
      trainee.fatigue = clamp(trainee.fatigue - 5, 0, 100)
      logs.push({ day: state.day, text: `${trainee.name} 仍在休养中（剩余 ${trainee.illnessDays} 天）。` })
      continue
    }

    if (trainee.fatigue >= CFG.thresholds.fatigueCollapse) {
      trainee.fatigue = applyRange(trainee.fatigue, CFG.activities.rest.fatigue)
      trainee.stress = applyRange(trainee.stress, CFG.activities.rest.stress)
      logs.push({ day: state.day, text: `${trainee.name} 过度疲劳，被迫休息。` })
      continue
    }

    const activityKey = schedule[trainee.id]
    if (!activityKey) {
      logs.push({ day: state.day, text: `${trainee.name} 今日未安排日程。` })
      continue
    }

    const activity = CFG.activities[activityKey]
    if (!activity) continue

    money -= activity.moneyCost
    totalExpenses += activity.moneyCost

    const partners = (activityGroups[activityKey] || [])
      .filter((id) => id !== trainee.id)
      .map((id) => trainees.find((t) => t.id === id))
      .filter(Boolean)

    const mult = getTrainingMultiplier(trainee, partners, relationships)

    if (activity.requiresTraining && trainee.stress >= CFG.thresholds.stressBreakdown) {
      logs.push({ day: state.day, text: `${trainee.name} 压力过大，无法集中精力训练。` })
      trainee.stress = clamp(trainee.stress + randInt(2, 5), 0, 100)
      continue
    }

    for (const [stat, range] of Object.entries(activity.statGain || {})) {
      const gain = randInt(range[0], range[1])
      trainee.stats[stat] = clamp(
        trainee.stats[stat] + Math.round(gain * mult),
        0,
        CFG.thresholds.statCap
      )
    }

    trainee.fatigue = clamp(applyRange(trainee.fatigue, activity.fatigue), 0, 100)
    trainee.stress = clamp(applyRange(trainee.stress, activity.stress), 0, 100)

    if (activity.fansGain) {
      const gained = randInt(activity.fansGain[0], activity.fansGain[1])
      fans += gained
      trainee.fans += Math.round(gained * 0.3)
      logs.push({ day: state.day, text: `${trainee.name} 参与公关，粉丝 +${gained}。` })
    }

    for (const p of partners) {
      const cur = getRelationship(relationships, trainee.id, p.id)
      setRelationship(
        relationships,
        trainee.id,
        p.id,
        cur + randInt(CFG.relationships.trainingTogether[0], CFG.relationships.trainingTogether[1])
      )
    }
  }

  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      const a = trainees[i]
      const b = trainees[j]
      if (a.status === 'left' || b.status === 'left') continue

      const key = pairKey(a.id, b.id)
      let rel = relationships[key] ?? 0
      rel += randInt(CFG.relationships.dailyDrift[0], CFG.relationships.dailyDrift[1])
      rel = clamp(rel, CFG.relationships.min, CFG.relationships.max)

      const maxStat = (t) => Math.max(...CFG.stats.map((s) => t.stats[s]))
      const gap = Math.abs(maxStat(a) - maxStat(b))
      if (gap >= CFG.relationships.statGapCompetition) {
        rel -= randInt(2, 6)
        const weaker = maxStat(a) < maxStat(b) ? a : b
        weaker.stress = clamp(
          weaker.stress + randInt(CFG.relationships.competitionStress[0], CFG.relationships.competitionStress[1]),
          0,
          100
        )
        if (rel <= CFG.relationships.competitionThreshold) {
          logs.push({
            day: state.day,
            text: `${weaker.name} 感受到来自 ${weaker === a ? b.name : a.name} 的竞争压力！`,
          })
        }
      }

      relationships[key] = rel
    }
  }

  const dailyCost =
    CFG.dailyCosts.baseOperatingCost +
    trainees.filter((t) => t.status === 'trainee').length * CFG.dailyCosts.perTraineeCost +
    trainees.filter((t) => t.status === 'debuted').length * CFG.dailyCosts.perDebutedCost +
    state.groups.length * CFG.dailyCosts.perGroupCost

  money -= dailyCost
  totalExpenses += dailyCost

  const contractLogs = processDailyContracts(trainees, state.day, money, totalExpenses)
  logs.push(...contractLogs.logs)
  money = contractLogs.money
  totalExpenses = contractLogs.totalExpenses

  const newDay = state.day + 1
  const pendingRating = state.day % CFG.rating.interval === 0

  let pendingEvent = null
  if (Math.random() < CFG.events.dailyChance) {
    pendingEvent = generateRandomEvent(trainees, state.day)
    if (pendingEvent.type === 'fan_surge') {
      fans += pendingEvent.fansGain
      logs.push({ day: state.day, text: `【${pendingEvent.label}】粉丝 +${pendingEvent.fansGain}！` })
      pendingEvent = null
    } else if (pendingEvent.type === 'inspiration') {
      const target = pendingEvent.target
      const stat = pickRandom(CFG.stats)
      target.stats[stat] = clamp(target.stats[stat] + pendingEvent.statBoost, 0, CFG.thresholds.statCap)
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】${target.name} 的${CFG.statLabels[stat]} +${pendingEvent.statBoost}！`,
      })
      pendingEvent = null
    } else if (pendingEvent.type === 'negative_news') {
      fans = Math.max(0, fans - pendingEvent.fansLoss)
      for (const t of trainees) {
        if (t.status !== 'left') {
          t.stress = clamp(t.stress + pendingEvent.stressGain, 0, 100)
        }
      }
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】粉丝 -${pendingEvent.fansLoss}，全员压力上升。`,
      })
      pendingEvent = null
    } else if (pendingEvent.type === 'illness') {
      pendingEvent.target.illnessDays = pendingEvent.duration
      pendingEvent.target.stress = clamp(
        pendingEvent.target.stress + pendingEvent.stressGain,
        0,
        100
      )
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】${pendingEvent.target.name} 需要休养 ${pendingEvent.duration} 天。`,
      })
      pendingEvent = null
    }
  }

  const nextState = {
    ...state,
    day: newDay,
    money,
    fans,
    totalExpenses,
    trainees,
    relationships,
    schedule: {},
    logs: [...state.logs, ...logs],
    pendingEvent,
    pendingRating,
  }

  const result = checkVictory(nextState)
  if (result) nextState.gameStatus = result

  return nextState
}

function generateRandomEvent(trainees, day) {
  const active = trainees.filter((t) => t.status !== 'left' && t.illnessDays === 0)
  if (active.length === 0) return null

  const types = Object.entries(CFG.events.types).map(([key, val]) => ({
    key,
    ...val,
  }))
  const picked = weightedPick(types)
  const target = pickRandom(active)

  const event = {
    type: picked.key,
    label: picked.label,
    description: picked.description,
    day,
    target,
    resolved: false,
  }

  switch (picked.key) {
    case 'poaching':
      event.successChance = picked.successChance
      break
    case 'illness':
      event.duration = randInt(picked.duration[0], picked.duration[1])
      event.stressGain = randInt(picked.stressGain[0], picked.stressGain[1])
      break
    case 'inspiration':
      event.statBoost = randInt(picked.statBoost[0], picked.statBoost[1])
      break
    case 'negative_news':
      event.fansLoss = randInt(picked.fansLoss[0], picked.fansLoss[1])
      event.stressGain = randInt(picked.stressGain[0], picked.stressGain[1])
      break
    case 'fan_surge':
      event.fansGain = randInt(picked.fansGain[0], picked.fansGain[1])
      break
  }

  return event
}

export function resolvePoachingEvent(state, keepTrainee) {
  const event = state.pendingEvent
  if (!event || event.type !== 'poaching') return state

  const logs = [...state.logs]
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))
  const target = trainees.find((t) => t.id === event.target.id)

  if (keepTrainee) {
    const cost = randInt(8000, 15000)
    logs.push({
      day: state.day,
      text: `【挖角危机】你花费 ¥${cost} 成功挽留 ${target.name}！`,
    })
    target.stress = clamp(target.stress + randInt(5, 12), 0, 100)
    return {
      ...state,
      money: state.money - cost,
      totalExpenses: state.totalExpenses + cost,
      trainees,
      logs,
      pendingEvent: null,
    }
  }

  const roll = Math.random()
  const resist = target.poachResist / 100
  if (roll > event.successChance * (1 - resist * 0.5)) {
    logs.push({ day: state.day, text: `【挖角危机】${target.name} 决定留在事务所。` })
    return { ...state, trainees, logs, pendingEvent: null }
  }

  target.status = 'left'
  logs.push({ day: state.day, text: `【挖角危机】${target.name} 被竞争对手挖走，离开了事务所！` })
  const result = checkVictory({ ...state, trainees })
  return {
    ...state,
    trainees,
    logs,
    pendingEvent: null,
    gameStatus: result || state.gameStatus,
  }
}

export function debutGroup(state, memberIds, groupName) {
  const members = state.trainees.filter((t) => memberIds.includes(t.id))
  if (members.length < CFG.rating.minGroupSize || members.length > CFG.rating.maxGroupSize) {
    return { success: false, message: `出道人数需在 ${CFG.rating.minGroupSize}-${CFG.rating.maxGroupSize} 人之间` }
  }

  for (const m of members) {
    if (m.status !== 'trainee') return { success: false, message: `${m.name} 无法出道` }
    if (calcTraineeScore(m) < CFG.rating.debutScoreThreshold) {
      return { success: false, message: `${m.name} 综合评分未达标（需 ≥${CFG.rating.debutScoreThreshold}）` }
    }
  }

  const groupId = `g_${Date.now()}`
  const trainees = state.trainees.map((t) => {
    if (memberIds.includes(t.id)) {
      return {
        ...t,
        status: 'debuted',
        groupId,
        contract: {
          ...t.contract,
          baseSalary: CFG.contract.debutedBaseSalary,
          revenueShare: clamp(
            CFG.contract.baseRevenueShare + calcTraineeScore(t) * CFG.contract.statShareFactor,
            CFG.contract.minRevenueShare,
            CFG.contract.maxRevenueShare
          ),
        },
      }
    }
    return t
  })

  const avgStats = {}
  for (const key of CFG.stats) {
    avgStats[key] = Math.round(members.reduce((s, m) => s + m.stats[key], 0) / members.length)
  }

  const groups = [
    ...state.groups,
    {
      id: groupId,
      name: groupName || `${members.map((m) => m.name[0]).join('')}组`,
      memberIds: [...memberIds],
      debutedDay: state.day,
      avgStats,
      totalSales: 0,
      singles: [],
    },
  ]

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `🎉 组合「${groupName || groups[groups.length - 1].name}」正式出道！成员：${members.map((m) => m.name).join('、')}`,
    },
  ]

  return {
    success: true,
    state: { ...state, trainees, groups, logs, pendingRating: false },
  }
}

export function releaseSingle(state, groupId) {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return { success: false, message: '组合不存在' }

  const lastDay = state.lastSingleDay[groupId] || 0
  if (state.day - lastDay < CFG.single.cooldownDays) {
    return {
      success: false,
      message: `距上次发歌还需 ${CFG.single.cooldownDays - (state.day - lastDay)} 天`,
    }
  }

  if (state.money < CFG.single.creationCost) {
    return { success: false, message: '资金不足' }
  }

  const members = state.trainees.filter((t) => group.memberIds.includes(t.id))
  const statAvg =
    CFG.stats.reduce((s, k) => s + group.avgStats[k], 0) / CFG.stats.length
  const charmAvg = group.avgStats.charm
  const popularity = state.fans + members.reduce((s, m) => s + m.fans, 0)

  const sales = Math.round(
    CFG.single.baseSales +
      statAvg * CFG.single.statWeight * 50 +
      popularity * CFG.single.fansWeight * 0.08 +
      charmAvg * CFG.single.charmWeight * 30 +
      randInt(-200, 400)
  )

  const revenue = sales * CFG.single.revenuePerSale

  let totalSharePayout = 0
  const trainees = state.trainees.map((t) => {
    if (!group.memberIds.includes(t.id)) return t
    const shareAmount = Math.round(revenue * t.contract.revenueShare)
    totalSharePayout += shareAmount
    return {
      ...t,
      singlesReleased: t.singlesReleased + 1,
      fans: t.fans + Math.round(sales * 0.05),
      contract: {
        ...t.contract,
        loyalty: clamp(t.contract.loyalty + 2, 0, 100),
      },
    }
  })

  const companyRevenue = revenue - totalSharePayout

  const groups = state.groups.map((g) => {
    if (g.id !== groupId) return g
    return {
      ...g,
      totalSales: g.totalSales + sales,
      singles: [
        ...g.singles,
        { day: state.day, sales, revenue: companyRevenue, title: `单曲 Vol.${g.singles.length + 1}` },
      ],
    }
  })

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `💿 ${group.name} 发行新单曲，销量 ${sales.toLocaleString()}，总收入 ¥${revenue.toLocaleString()}，分成支出 ¥${totalSharePayout.toLocaleString()}，公司净收入 ¥${companyRevenue.toLocaleString()}！`,
    },
  ]

  return {
    success: true,
    state: {
      ...state,
      money: state.money - CFG.single.creationCost + companyRevenue,
      totalRevenue: state.totalRevenue + companyRevenue,
      totalExpenses: state.totalExpenses + CFG.single.creationCost + totalSharePayout,
      fans: state.fans + Math.round(sales * 0.02),
      groups,
      trainees,
      logs,
      lastSingleDay: { ...state.lastSingleDay, [groupId]: state.day },
    },
    sales,
    revenue: companyRevenue,
  }
}

export function getRatingResults(state) {
  return getActiveTrainees(state)
    .filter((t) => t.status === 'trainee')
    .map((t) => ({
      ...t,
      score: calcTraineeScore(t),
      canDebut: calcTraineeScore(t) >= CFG.rating.debutScoreThreshold,
    }))
    .sort((a, b) => b.score - a.score)
}

function processDailyContracts(trainees, day, money, totalExpenses) {
  const logs = []

  for (const trainee of trainees) {
    if (trainee.status === 'left') continue

    trainee.contract.loyalty = clamp(
      trainee.contract.loyalty - CFG.contract.loyaltyDecayPerDay + randFloat(-0.05, 0.05),
      0,
      100
    )

    const daysRemaining = trainee.contract.endDay - day
    if (daysRemaining === CFG.contract.warningDaysBeforeExpiry) {
      logs.push({
        day,
        text: `⚠️ ${trainee.name} 的合约还有 ${CFG.contract.warningDaysBeforeExpiry} 天到期，需要尽快续约！`,
      })
    }

    if (daysRemaining <= 0 && !trainee.contract.pendingOffer) {
      const departureChance = (100 - trainee.contract.loyalty) / 100
      if (Math.random() < departureChance * 0.3) {
        trainee.status = 'left'
        logs.push({
          day,
          text: `💔 ${trainee.name} 因合约到期未续约，离开了事务所！`,
        })
      }
    }
  }

  if (day % 30 === 0) {
    let totalSalary = 0
    for (const trainee of trainees) {
      if (trainee.status === 'left') continue
      totalSalary += trainee.contract.baseSalary
    }
    money -= totalSalary
    totalExpenses += totalSalary
    logs.push({
      day,
      text: `💰 月度薪资支出：¥${totalSalary.toLocaleString()}`,
    })
  }

  return { logs, money, totalExpenses }
}

export function getExpiringContracts(state) {
  const active = getActiveTrainees(state)
  return active
    .filter((t) => {
      const daysLeft = t.contract.endDay - state.day
      return daysLeft <= CFG.contract.warningDaysBeforeExpiry
    })
    .map((t) => ({
      ...t,
      daysRemaining: t.contract.endDay - state.day,
      score: calcTraineeScore(t),
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export function calculateDesiredShare(trainee) {
  const score = calcTraineeScore(trainee)
  const fameFactor = trainee.fans * CFG.contract.fameShareFactor
  const scoreFactor = score * CFG.contract.statShareFactor
  const base = CFG.contract.baseRevenueShare

  let desired = base + fameFactor + scoreFactor
  if (trainee.status === 'debuted') desired += 0.05

  const loyaltyMod = (50 - trainee.contract.loyalty) * 0.002
  desired += loyaltyMod

  return clamp(desired, CFG.contract.minRevenueShare, CFG.contract.maxRevenueShare)
}

export function calculateDesiredSalary(trainee) {
  const base =
    trainee.status === 'debuted'
      ? CFG.contract.debutedBaseSalary
      : CFG.contract.traineeBaseSalary
  const scoreBonus = calcTraineeScore(trainee) * 80
  const fameBonus = Math.round(trainee.fans * 0.5)
  return base + scoreBonus + fameBonus
}

export function generateInitialOffer(trainee, termDays = 365) {
  const desiredShare = calculateDesiredShare(trainee)
  const desiredSalary = calculateDesiredSalary(trainee)
  const minAcceptableShare = desiredShare * 0.85
  const minAcceptableSalary = Math.round(desiredSalary * 0.8)

  return {
    traineeId: trainee.id,
    traineeName: trainee.name,
    termDays,
    offeredShare: CFG.contract.baseRevenueShare,
    offeredSalary:
      trainee.status === 'debuted'
        ? CFG.contract.debutedBaseSalary
        : CFG.contract.traineeBaseSalary,
    desiredShare,
    desiredSalary,
    minAcceptableShare,
    minAcceptableSalary,
    roundsRemaining: CFG.contract.negotiationRounds,
    traineeMood: 'neutral',
  }
}

export function negotiateContract(state, traineeId, offerShare, offerSalary, termDays) {
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats }, contract: { ...t.contract } }))
  const trainee = trainees.find((t) => t.id === traineeId)
  if (!trainee || trainee.status === 'left') {
    return { success: false, message: '练习生不存在' }
  }

  const offer = trainee.contract.pendingOffer || generateInitialOffer(trainee, termDays)
  offer.roundsRemaining -= 1

  const shareGap = offer.desiredShare - offerShare
  const salaryGap = offer.desiredSalary - offerSalary

  let moodChange = 0
  if (shareGap <= 0 && salaryGap <= 0) {
    offer.traineeMood = 'happy'
    moodChange = 5
  } else if (shareGap < 0.05 && salaryGap < offer.desiredSalary * 0.1) {
    offer.traineeMood = 'neutral'
    moodChange = 0
  } else if (shareGap < 0.1 && salaryGap < offer.desiredSalary * 0.2) {
    offer.traineeMood = 'unhappy'
    moodChange = -3
  } else {
    offer.traineeMood = 'angry'
    moodChange = -8
  }

  trainee.contract.loyalty = clamp(trainee.contract.loyalty + moodChange, 0, 100)
  offer.offeredShare = offerShare
  offer.offeredSalary = offerSalary

  if (
    offerShare >= offer.minAcceptableShare &&
    offerSalary >= offer.minAcceptableSalary &&
    (trainee.contract.loyalty > 30 || offer.roundsRemaining > 0)
  ) {
    offer.canAccept = true
  } else {
    offer.canAccept = false
  }

  if (offer.roundsRemaining <= 0 && !offer.canAccept) {
    offer.negotiationFailed = true
  }

  trainee.contract.pendingOffer = offer

  return {
    success: true,
    offer,
    state: { ...state, trainees },
  }
}

export function acceptContract(state, traineeId) {
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats }, contract: { ...t.contract } }))
  const logs = [...state.logs]
  const trainee = trainees.find((t) => t.id === traineeId)

  if (!trainee || !trainee.contract.pendingOffer) {
    return { success: false, message: '没有待处理的合约' }
  }

  const offer = trainee.contract.pendingOffer

  trainee.contract.startDay = state.day
  trainee.contract.endDay = state.day + offer.termDays
  trainee.contract.revenueShare = offer.offeredShare
  trainee.contract.baseSalary = offer.offeredSalary
  trainee.contract.loyalty = clamp(
    trainee.contract.loyalty + CFG.contract.loyaltyGainOnRenew,
    0,
    100
  )
  trainee.contract.pendingOffer = null
  trainee.contract.negotiated = true

  trainee.stress = clamp(trainee.stress - CFG.contract.moraleImpactOnAccept, 0, 100)

  logs.push({
    day: state.day,
    text: `📝 ${trainee.name} 续约成功！新合约期限 ${offer.termDays} 天，分成 ${(offer.offeredShare * 100).toFixed(1)}%，月薪 ¥${offer.offeredSalary.toLocaleString()}。`,
  })

  return {
    success: true,
    state: { ...state, trainees, logs },
  }
}

export function rejectContract(state, traineeId) {
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats }, contract: { ...t.contract } }))
  const logs = [...state.logs]
  const trainee = trainees.find((t) => t.id === traineeId)

  if (!trainee || !trainee.contract.pendingOffer) {
    return { success: false, message: '没有待处理的合约' }
  }

  trainee.contract.pendingOffer = null
  trainee.contract.loyalty = clamp(
    trainee.contract.loyalty - CFG.contract.moraleImpactOnReject * 2,
    0,
    100
  )
  trainee.stress = clamp(trainee.stress + CFG.contract.moraleImpactOnReject, 0, 100)

  logs.push({
    day: state.day,
    text: `😤 ${trainee.name} 对谈判结果不满，谈判破裂！忠诚度下降。`,
  })

  const daysLeft = trainee.contract.endDay - state.day
  if (daysLeft <= 0 && trainee.contract.loyalty < CFG.contract.departureRiskThreshold) {
    trainee.status = 'left'
    logs.push({
      day: state.day,
      text: `💔 ${trainee.name} 因谈判破裂且忠诚度过低，离开了事务所！`,
    })
  }

  const result = checkVictory({ ...state, trainees })

  return {
    success: true,
    state: {
      ...state,
      trainees,
      logs,
      gameStatus: result || state.gameStatus,
    },
  }
}

export function startContractNegotiation(state, traineeId) {
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats }, contract: { ...t.contract } }))
  const trainee = trainees.find((t) => t.id === traineeId)

  if (!trainee || trainee.status === 'left') {
    return { success: false, message: '练习生不存在' }
  }

  if (trainee.contract.pendingOffer) {
    return { success: false, message: '已有进行中的谈判' }
  }

  const offer = generateInitialOffer(trainee)
  trainee.contract.pendingOffer = offer

  return {
    success: true,
    offer,
    state: { ...state, trainees },
  }
}

export function getContractDepartureRisk(trainee, currentDay) {
  const daysLeft = trainee.contract.endDay - currentDay
  if (daysLeft > CFG.contract.warningDaysBeforeExpiry) return 'low'

  const loyalty = trainee.contract.loyalty
  if (daysLeft <= 0 && loyalty < CFG.contract.departureRiskThreshold) return 'critical'
  if (daysLeft <= 0) return 'high'
  if (loyalty < 40) return 'high'
  if (loyalty < 60) return 'medium'
  return 'low'
}
