import { describe, expect, it } from 'vitest';
import policyFile from './qpolicy.json';
import {
  ACTIONS,
  DAY_TYPES,
  LOAD_BUCKETS,
  dayTypeOf,
  findQuieterSlot,
  getPolicyEntry,
  loadBucket,
  occupancyOf,
  recommend,
  stateKey,
} from './usePolicy';

describe('loadBucket', () => {
  it('matches the training boundaries', () => {
    expect(loadBucket(0)).toBe('low');
    expect(loadBucket(0.49)).toBe('low');
    expect(loadBucket(0.5)).toBe('medium');
    expect(loadBucket(0.8)).toBe('medium');
    expect(loadBucket(0.81)).toBe('high');
    expect(loadBucket(1)).toBe('high');
  });

  it('rejects missing and invalid values', () => {
    expect(loadBucket(undefined)).toBeNull();
    expect(loadBucket(null)).toBeNull();
    expect(loadBucket('nope')).toBeNull();
    expect(loadBucket(-0.1)).toBeNull();
    expect(loadBucket(Number.NaN)).toBeNull();
  });
});

describe('occupancyOf', () => {
  it('divides booked by capacity', () => {
    expect(occupancyOf(40, 100)).toBeCloseTo(0.4);
    expect(occupancyOf('25', '50')).toBeCloseTo(0.5);
  });

  it('returns null for unusable data', () => {
    expect(occupancyOf(10, 0)).toBeNull();
    expect(occupancyOf(10, -5)).toBeNull();
    expect(occupancyOf(-1, 100)).toBeNull();
    expect(occupancyOf(undefined, 100)).toBeNull();
    expect(occupancyOf(10, 'many')).toBeNull();
  });
});

describe('dayTypeOf', () => {
  it('classifies weekdays and weekends', () => {
    expect(dayTypeOf('2026-11-25')).toBe('weekday');
    expect(dayTypeOf('2026-11-28')).toBe('weekend');
    expect(dayTypeOf('2026-11-29')).toBe('weekend');
  });

  it('classifies configured holidays before weekdays', () => {
    expect(dayTypeOf('2027-01-26')).toBe('holiday');
    expect(dayTypeOf('2026-10-02')).toBe('holiday');
  });

  it('rejects invalid dates', () => {
    expect(dayTypeOf('2026-02-31')).toBeNull();
    expect(dayTypeOf('not-a-date')).toBeNull();
    expect(dayTypeOf(undefined)).toBeNull();
  });
});

describe('generated policy', () => {
  it('contains every supported state with valid actions and Q-values', () => {
    for (const dayType of DAY_TYPES) {
      for (const bucket of LOAD_BUCKETS) {
        const key = stateKey(dayType, bucket);
        const entry = policyFile.policy[key];
        expect(entry, key).toBeTruthy();
        expect(ACTIONS, key).toContain(entry.action);
        for (const action of ACTIONS) {
          expect(typeof entry.qValues[action], `${key}/${action}`).toBe('number');
        }
      }
    }
  });

  it('looks up the learned action for every state', () => {
    const loads = { low: 0.2, medium: 0.65, high: 0.95 };
    for (const dayType of DAY_TYPES) {
      for (const bucket of LOAD_BUCKETS) {
        const entry = getPolicyEntry({ dayType, load: loads[bucket] });
        expect(entry?.state).toBe(stateKey(dayType, bucket));
        expect(entry?.action).toBe(policyFile.policy[stateKey(dayType, bucket)].action);
        expect(recommend({ dayType, load: loads[bucket] })).toBe(entry?.action);
      }
    }
  });

  it('falls back to keep when the state cannot be resolved', () => {
    expect(recommend({ dayType: 'someday', load: 0.95 })).toBe('keep');
    expect(recommend({ dayType: 'weekday', load: undefined })).toBe('keep');
    expect(recommend({})).toBe('keep');
    expect(getPolicyEntry({ dayType: 'weekday', load: -1 })).toBeNull();
  });
});

describe('findQuieterSlot', () => {
  const selected = { id: '2', startTime: '13:00', booked: 92, capacity: 100 };

  const slots = [
    { id: '1', startTime: '11:00', booked: 30, capacity: 100 },
    { id: '2', startTime: '13:00', booked: 92, capacity: 100 },
    { id: '3', startTime: '14:00', booked: 60, capacity: 100 },
    { id: '4', startTime: '15:00', booked: 70, capacity: 100 },
    { id: '5', startTime: '16:00', booked: 10, capacity: 100, soldOut: true },
  ];

  it('picks the nearest quieter slot in the recommended direction', () => {
    expect(findQuieterSlot({ slots, selected, action: 'later' })?.id).toBe('3');
    expect(findQuieterSlot({ slots, selected, action: 'earlier' })?.id).toBe('1');
  });

  it('ignores sold-out slots', () => {
    const onlySoldOut = [
      selected,
      { id: '3', startTime: '14:00', booked: 10, capacity: 100, soldOut: true },
    ];
    expect(findQuieterSlot({ slots: onlySoldOut, selected, action: 'later' })).toBeNull();
  });

  it('returns null when nothing is quieter or the action is keep', () => {
    const busier = [
      selected,
      { id: '3', startTime: '14:00', booked: 95, capacity: 100 },
      { id: '4', startTime: '15:00', booked: 100, capacity: 100 },
    ];
    expect(findQuieterSlot({ slots: busier, selected, action: 'later' })).toBeNull();
    expect(findQuieterSlot({ slots, selected, action: 'keep' })).toBeNull();
  });

  it('returns null for unusable slot data', () => {
    expect(findQuieterSlot({ slots, selected: { ...selected, capacity: 0 }, action: 'later' })).toBeNull();
    expect(findQuieterSlot({ slots: null, selected, action: 'later' })).toBeNull();
  });
});
