#!/usr/bin/env node
/**
 * MuseumX Q-learning slot recommender — training script.
 *
 * Trains a tabular Q-learning agent over the state space
 * (day type × requested-slot load bucket) and writes the learned policy to
 * `qpolicy.json` next to this file.
 *
 * Run from anywhere:
 *   node client/src/ml/train.mjs
 *
 * Reward design (see PRD §6):
 *   Keep at low load                                  +1
 *   Keep at high load                                 -1
 *   Suggest at high load, alternative has lower load  +1
 *   Suggest at low load                               -0.5
 *   Suggested alternative is also high load           -1
 *
 * Medium-load handling is defined explicitly below and documented in the
 * exported metadata so runtime behaviour stays consistent with the policy:
 *   Keep at medium load                               +0.2
 *   Suggest at medium load, alternative lower         +0.5
 *   Suggest at medium load, alternative not lower     -0.5
 *   No alternative slot available                     -0.2
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const ACTIONS = ['keep', 'earlier', 'later'];
const DAY_TYPES = ['weekday', 'weekend', 'holiday'];
const LOAD_BUCKETS = ['low', 'medium', 'high'];

const CONFIG = {
  algorithm: 'tabular-q-learning',
  learningRate: 0.1,
  discountFactor: 0.9,
  episodes: 4000,
  seed: 20261125,
  epsilonStart: 1,
  epsilonEnd: 0.05,
  epsilonDecayEpisodes: 2500,
};

// Museum opening hours 10:00–18:00, one entry slot per hour.
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17];

// Demand curves as a fraction of slot capacity, by hour index (10:00 → 17:00).
// Midday peaks (12:00–14:00) and louder weekends/holidays emerge from these.
const DEMAND = {
  weekday: [0.3, 0.38, 0.66, 0.78, 0.84, 0.6, 0.42, 0.3],
  weekend: [0.4, 0.55, 0.78, 0.92, 0.85, 0.68, 0.52, 0.4],
  holiday: [0.48, 0.64, 0.86, 0.95, 0.88, 0.72, 0.56, 0.45],
};

// Training must expose the agent to every supported state. If a bucket is
// sampled too rarely the learned Q-values for it stay close to zero, so we
// fail loudly rather than shipping an untrained policy.
const MIN_SAMPLES_PER_STATE = 20;

const DAY_TYPE_WEIGHTS = { weekday: 0.5, weekend: 0.36, holiday: 0.14 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(CONFIG.seed);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Same bucket boundaries as client/src/ml/usePolicy.js. */
export function loadBucket(load) {
  if (load == null) return null;
  if (typeof load === 'string' && load.trim() === '') return null;
  const ratio = Number(load);
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  if (ratio < 0.5) return 'low';
  if (ratio <= 0.8) return 'medium';
  return 'high';
}

function sampleDayType() {
  const roll = rand();
  let cumulative = 0;
  for (const dayType of DAY_TYPES) {
    cumulative += DAY_TYPE_WEIGHTS[dayType];
    if (roll <= cumulative) return dayType;
  }
  return DAY_TYPES[0];
}

function sampleHour() {
  return HOURS[Math.floor(rand() * HOURS.length)];
}

/** Simulated occupancy ratio for a slot, with noise around the demand curve. */
function sampleLoad(dayType, hour) {
  const index = HOURS.indexOf(hour);
  const base = DEMAND[dayType][index] ?? 0.3;
  const noise = (rand() - 0.5) * 0.12;
  return clamp(base + noise, 0.02, 1);
}

function sampleState() {
  const dayType = sampleDayType();
  const hour = sampleHour();
  const load = sampleLoad(dayType, hour);
  return { dayType, hour, load, bucket: loadBucket(load) };
}

const stateKey = (dayType, bucket) => `${dayType}_${bucket}`;

function emptyQTable() {
  const table = {};
  for (const dayType of DAY_TYPES) {
    for (const bucket of LOAD_BUCKETS) {
      table[stateKey(dayType, bucket)] = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
    }
  }
  return table;
}

function maxQ(qValues) {
  return Math.max(...ACTIONS.map((action) => qValues[action]));
}

function greedyAction(qValues) {
  let best = ACTIONS[0];
  for (const action of ACTIONS) {
    if (qValues[action] > qValues[best]) best = action;
  }
  return best;
}

function epsilonAt(episode) {
  const progress = Math.min(1, episode / CONFIG.epsilonDecayEpisodes);
  return CONFIG.epsilonStart + (CONFIG.epsilonEnd - CONFIG.epsilonStart) * progress;
}

function chooseAction(qValues, epsilon) {
  if (rand() < epsilon) return ACTIONS[Math.floor(rand() * ACTIONS.length)];
  return greedyAction(qValues);
}

/**
 * Load of the slot the visitor would be moved to when following `action`.
 * Returns null when there is no neighbouring slot in that direction.
 */
function sampleAlternativeLoad(dayType, hour, action) {
  const index = HOURS.indexOf(hour);
  const neighbourIndex = action === 'earlier' ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= HOURS.length) return null;
  return sampleLoad(dayType, HOURS[neighbourIndex]);
}

/**
 * Reward for a (state, action) pair. `state.bucket` is the requested slot.
 * Medium-load cases and the no-alternative case are defined here explicitly.
 */
function rewardFor(state, action) {
  const { bucket, dayType, hour } = state;

  if (action === 'keep') {
    if (bucket === 'low') return 1;
    if (bucket === 'medium') return 0.2;
    return -1; // high
  }

  // Suggesting an earlier or later slot.
  const alternativeLoad = sampleAlternativeLoad(dayType, hour, action);
  if (alternativeLoad == null) return -0.2; // no slot in that direction

  const alternativeBucket = loadBucket(alternativeLoad);
  const alternativeIsHigh = alternativeBucket === 'high';
  const laterIsQuieter = alternativeLoad < state.load;
  const sameBucket = alternativeBucket === bucket;

  if (bucket === 'low') return -0.5; // suggesting at low load is unnecessary
  if (alternativeIsHigh && !laterIsQuieter) return -1;

  if (bucket === 'high') return laterIsQuieter ? 1 : sameBucket ? -1 : -0.5;
  // medium
  return laterIsQuieter ? 0.5 : -0.5;
}

function train() {
  const qTable = emptyQTable();
  const stateCounts = Object.fromEntries(
    DAY_TYPES.flatMap((dayType) => LOAD_BUCKETS.map((bucket) => [stateKey(dayType, bucket), 0])),
  );

  for (let episode = 0; episode < CONFIG.episodes; episode += 1) {
    const state = sampleState();
    const key = stateKey(state.dayType, state.bucket);
    stateCounts[key] += 1;

    const epsilon = epsilonAt(episode);
    const action = chooseAction(qTable[key], epsilon);
    const reward = rewardFor(state, action);

    const next = sampleState();
    const nextKey = stateKey(next.dayType, next.bucket);
    const target = reward + CONFIG.discountFactor * maxQ(qTable[nextKey]);
    const current = qTable[key][action];

    qTable[key][action] = current + CONFIG.learningRate * (target - current);
  }

  return { qTable, stateCounts };
}

function assertCoverage(stateCounts) {
  const uncovered = Object.entries(stateCounts).filter(([, count]) => count < MIN_SAMPLES_PER_STATE);
  if (uncovered.length) {
    const detail = uncovered.map(([key, count]) => `${key}(${count})`).join(', ');
    throw new Error(`Training did not sample every state enough times: ${detail}`);
  }
}

function exportPolicy(qTable) {
  const policy = {};
  for (const dayType of DAY_TYPES) {
    for (const bucket of LOAD_BUCKETS) {
      const key = stateKey(dayType, bucket);
      const qValues = qTable[key];
      policy[key] = {
        dayType,
        loadBucket: bucket,
        action: greedyAction(qValues),
        qValues: Object.fromEntries(ACTIONS.map((action) => [action, Number(qValues[action].toFixed(4))])),
      };
    }
  }

  return {
    metadata: {
      algorithm: CONFIG.algorithm,
      learningRate: CONFIG.learningRate,
      discountFactor: CONFIG.discountFactor,
      episodes: CONFIG.episodes,
      seed: CONFIG.seed,
      epsilon: {
        start: CONFIG.epsilonStart,
        end: CONFIG.epsilonEnd,
        decayEpisodes: CONFIG.epsilonDecayEpisodes,
      },
      actions: ACTIONS,
      dayTypes: DAY_TYPES,
      loadBuckets: {
        low: 'load < 0.50',
        medium: '0.50 <= load <= 0.80',
        high: 'load > 0.80',
      },
      rewardDesign: {
        keepLow: 1,
        keepMedium: 0.2,
        keepHigh: -1,
        suggestHighLower: 1,
        suggestLow: -0.5,
        suggestAlternativeHigh: -1,
        suggestMediumLower: 0.5,
        suggestMediumNotLower: -0.5,
        noAlternative: -0.2,
      },
      demandPeaks: 'midday on weekdays, louder weekends and holidays',
    },
    policy,
  };
}

function validate(output) {
  const keys = DAY_TYPES.flatMap((dayType) => LOAD_BUCKETS.map((bucket) => stateKey(dayType, bucket)));
  for (const key of keys) {
    const entry = output.policy[key];
    if (!entry) throw new Error(`Policy is missing state ${key}`);
    if (!ACTIONS.includes(entry.action)) throw new Error(`Invalid action for ${key}: ${entry.action}`);
    for (const action of ACTIONS) {
      if (typeof entry.qValues[action] !== 'number' || Number.isNaN(entry.qValues[action])) {
        throw new Error(`Missing Q-value ${key}/${action}`);
      }
    }
  }
}

const { qTable, stateCounts } = train();
assertCoverage(stateCounts);
const output = exportPolicy(qTable);
validate(output);

const target = resolve(HERE, 'qpolicy.json');
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`Trained ${CONFIG.episodes} episodes (${CONFIG.algorithm}).`);
console.log(`States: ${Object.keys(output.policy).length}`);
for (const [key, entry] of Object.entries(output.policy)) {
  const q = ACTIONS.map((action) => `${action}: ${entry.qValues[action].toFixed(2)}`).join('  ');
  console.log(`  ${key.padEnd(14)} -> ${entry.action.padEnd(7)}  ${q}`);
}
console.log(`Wrote ${target}`);
