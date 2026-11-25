/**
 * Runtime policy module for the MuseumX Q-learning slot recommender.
 *
 * Loads the generated `qpolicy.json`, normalizes the day type and occupancy,
 * and returns the learned action for the current state. All helpers fall back
 * safely so a missing or malformed policy never breaks the booking flow.
 */

import policy from './qpolicy.json';

export const ACTIONS = ['keep', 'earlier', 'later'];
export const DAY_TYPES = ['weekday', 'weekend', 'holiday'];
export const LOAD_BUCKETS = ['low', 'medium', 'high'];

export const POLICY_META = policy?.metadata || {};
export const POLICY = policy?.policy || {};

// National holidays when the museum stays closed. Fixed dates are stored
// explicitly so day-type classification is deterministic for any future date.
const HOLIDAYS = new Set([
  '2026-01-26',
  '2026-08-15',
  '2026-10-02',
  '2027-01-26',
  '2027-08-15',
  '2027-10-02',
  '2028-01-26',
  '2028-08-15',
  '2028-10-02',
]);

/**
 * Classify an occupancy ratio into the buckets used during training.
 * Boundaries match `train.mjs`: low < 0.50, medium 0.50–0.80, high > 0.80.
 */
export function loadBucket(load) {
  if (load == null) return null;
  if (typeof load === 'string' && load.trim() === '') return null;
  const ratio = Number(load);
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  if (ratio < 0.5) return 'low';
  if (ratio <= 0.8) return 'medium';
  return 'high';
}

/** Ratio of booked places to capacity, or null when the data is unusable. */
export function occupancyOf(booked, capacity) {
  const bookedCount = Number(booked);
  const capacityCount = Number(capacity);
  if (!Number.isFinite(bookedCount) || !Number.isFinite(capacityCount)) return null;
  if (bookedCount < 0 || capacityCount <= 0) return null;
  return bookedCount / capacityCount;
}

/** Accept only the three supported day types. */
export function normalizeDayType(dayType) {
  return DAY_TYPES.includes(dayType) ? dayType : null;
}

/** Derive day type from an ISO date. Returns null for invalid dates. */
export function dayTypeOf(dateISO) {
  if (typeof dateISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  if (HOLIDAYS.has(dateISO)) return 'holiday';
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
}

export function stateKey(dayType, loadBucketValue) {
  return `${dayType}_${loadBucketValue}`;
}

/**
 * Look up the learned entry for a state.
 * Returns null when the policy is missing, the day type is unknown, the load
 * is invalid, or the state was not exported.
 */
export function getPolicyEntry({ dayType, load } = {}) {
  const normalizedDay = normalizeDayType(dayType);
  const bucket = loadBucket(load);
  if (!normalizedDay || !bucket) return null;

  const key = stateKey(normalizedDay, bucket);
  const entry = policy?.policy?.[key];
  if (!entry || !ACTIONS.includes(entry.action)) return null;

  return { ...entry, state: key, loadBucket: bucket, dayType: normalizedDay };
}

/**
 * Learned action for the current state: 'keep' | 'earlier' | 'later'.
 * Falls back to 'keep' whenever the policy cannot answer.
 */
export function recommend({ dayType, load } = {}) {
  return getPolicyEntry({ dayType, load })?.action || 'keep';
}

/**
 * Find the nearest slot in the policy's recommended direction whose
 * occupancy is strictly lower than the selected slot's occupancy.
 * Sold-out slots and slots without usable capacity data are ignored.
 */
export function findQuieterSlot({ slots, selected, action } = {}) {
  if (!Array.isArray(slots) || !selected) return null;
  if (action !== 'earlier' && action !== 'later') return null;

  const selectedLoad = occupancyOf(selected.booked, selected.capacity);
  if (selectedLoad == null || typeof selected.startTime !== 'string') return null;

  const candidates = slots
    .filter((slot) => slot && slot.id !== selected.id && !slot.soldOut)
    .filter((slot) => typeof slot.startTime === 'string')
    .filter((slot) =>
      action === 'earlier' ? slot.startTime < selected.startTime : slot.startTime > selected.startTime,
    )
    .map((slot) => ({ slot, load: occupancyOf(slot.booked, slot.capacity) }))
    .filter((row) => row.load != null && row.load < selectedLoad);

  if (!candidates.length) return null;

  candidates.sort((a, b) =>
    action === 'earlier'
      ? b.slot.startTime.localeCompare(a.slot.startTime)
      : a.slot.startTime.localeCompare(b.slot.startTime),
  );
  return candidates[0].slot;
}

export default { recommend, getPolicyEntry, findQuieterSlot, dayTypeOf, loadBucket, occupancyOf };
