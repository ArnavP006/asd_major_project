import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, isoDate, todayISO } from '../../lib/format';
import { initialChat, reducer } from './reducer';

const future = addDays(todayISO(), 2);

let state;

const run = (action) => {
  state = reducer(state, action);
  return state;
};

const lastMessage = () => state.messages[state.messages.length - 1];

beforeEach(() => {
  state = reducer(initialChat('en'), { type: 'START' });
});

describe('start', () => {
  it('opens with the welcome prompt and main menu', () => {
    expect(state.step).toBe('start');
    expect(lastMessage().textKey).toBe('welcome');
    expect(state.currentOptions.map((option) => option.id)).toEqual(['book', 'info', 'cancel', 'language']);
  });
});

describe('booking flow', () => {
  it('walks entry -> date -> slot -> counts -> visitor -> summary -> pay', () => {
    run({ type: 'PICK', optionId: 'book' });
    expect(state.step).toBe('target');

    run({ type: 'PICK', optionId: 'entry' });
    expect(state.step).toBe('date');
    expect(state.booking.target).toBe('entry');

    run({ type: 'SET_DATE', value: future, display: future });
    expect(state.step).toBe('slot');
    expect(state.pending).toBe(true);
    expect(state.booking.date).toBe(future);

    run({
      type: 'LOADED',
      textKey: 'askSlot',
      options: [
        { id: 'slot:1', value: '1@date', meta: { label: '10:00 – 11:00', startTime: '10:00', remaining: 20, soldOut: false } },
        { id: 'slot:2', value: '2@date', meta: { label: '11:00 – 12:00', startTime: '11:00', remaining: 0, soldOut: true } },
      ],
    });
    expect(state.currentOptions).toHaveLength(2);

    run({ type: 'PICK', optionId: 'slot:2' });
    expect(state.step).toBe('slot');
    expect(lastMessage().textKey).toBe('slotSoldOut');

    run({ type: 'PICK', optionId: 'slot:1' });
    expect(state.step).toBe('counts');
    expect(state.booking.slotId).toBe('1@date');

    run({ type: 'SET_COUNTS', counts: { 1: 2, 2: 1 } });
    expect(state.step).toBe('visitor');

    run({ type: 'SET_VISITOR', visitor: { name: 'Asha Rao', email: 'asha@example.com', phone: '' } });
    expect(state.step).toBe('summary');
    expect(state.control).toBe('summary');

    run({ type: 'PICK', optionId: 'confirm' });
    expect(state.step).toBe('pay');
    expect(state.pending).toBe(true);
  });

  it('refuses counts of zero and invalid visitor details', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_COUNTS', counts: { 1: 0 } });
    expect(state.step).toBe('date');
    expect(lastMessage().textKey).toBe('invalidCounts');

    run({ type: 'SET_DATE', value: future });
    run({ type: 'LOADED', options: [{ id: 'slot:1', value: '1', meta: { soldOut: false } }] });
    run({ type: 'PICK', optionId: 'slot:1' });
    run({ type: 'SET_COUNTS', counts: { 1: 0 } });
    expect(state.step).toBe('counts');
    expect(lastMessage().textKey).toBe('invalidCounts');

    run({ type: 'SET_COUNTS', counts: { 1: 1 } });
    run({ type: 'SET_VISITOR', visitor: { name: 'A', email: '', phone: '123' } });
    expect(state.step).toBe('visitor');
    expect(lastMessage().textKey).toBe('invalidVisitor');
  });

  it('loads exhibition choices and keeps their names', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'exhibition' });
    expect(state.step).toBe('pickExhibition');
    expect(state.pending).toBe(true);

    run({
      type: 'LOADED',
      options: [
        { id: 'exhibitions:1', value: 1, label: 'Invention', labelHi: 'आविष्कार' },
        { id: 'exhibitions:2', value: 2, label: 'Human Biology', labelHi: 'मानव जीव विज्ञान' },
      ],
    });

    run({ type: 'PICK', optionId: 'exhibitions:2' });
    expect(state.step).toBe('date');
    expect(state.booking.refId).toBe(2);
    expect(state.booking.refName).toBe('Human Biology');
  });

  it('keeps the booking when the language changes', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_DATE', value: future });

    run({ type: 'PICK', optionId: 'language' });
    run({ type: 'PICK', optionId: 'hindi' });

    expect(state.lang).toBe('hi');
    expect(state.booking.target).toBe('entry');
    expect(state.booking.date).toBe(future);
  });

  it('marks a ticket ready after payment', () => {
    const ticket = { bookingCode: 'MX12345678', amount: 8000 };
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_DATE', value: future });
    run({ type: 'LOADED', options: [{ id: 'slot:1', value: '1', meta: { soldOut: false } }] });
    run({ type: 'PICK', optionId: 'slot:1' });
    run({ type: 'SET_COUNTS', counts: { 1: 1 } });
    run({ type: 'SET_VISITOR', visitor: { name: 'Asha', email: 'a@b.co', phone: '' } });
    run({ type: 'PICK', optionId: 'confirm' });
    run({ type: 'TICKET', ticket });

    expect(state.step).toBe('ticket');
    expect(state.ticket).toEqual(ticket);
    expect(lastMessage().ticket).toEqual(ticket);
  });
});

describe('Q-learning slot recommendation', () => {
  const nextWeekend = () => {
    const [year, month, day] = todayISO().split('-').map(Number);
    const date = new Date(year, month - 1, day);
    do {
      date.setDate(date.getDate() + 1);
    } while (date.getDay() !== 0 && date.getDay() !== 6);
    return isoDate(date);
  };

  const goToSlots = (options) => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_DATE', value: nextWeekend() });
    run({ type: 'LOADED', textKey: 'askSlot', options });
  };

  const crowdedSlots = [
    { id: 'slot:1', value: '1', meta: { label: '11:00 – 12:00', startTime: '11:00', remaining: 70, booked: 30, capacity: 100, soldOut: false } },
    { id: 'slot:2', value: '2', meta: { label: '13:00 – 14:00', startTime: '13:00', remaining: 8, booked: 92, capacity: 100, soldOut: false } },
    { id: 'slot:3', value: '3', meta: { label: '14:00 – 15:00', startTime: '14:00', remaining: 40, booked: 60, capacity: 100, soldOut: false } },
    { id: 'slot:4', value: '4', meta: { label: '15:00 – 16:00', startTime: '15:00', remaining: 20, booked: 80, capacity: 100, soldOut: false } },
  ];

  it('offers the nearest quieter slot in the learned direction', () => {
    goToSlots(crowdedSlots);
    run({ type: 'PICK', optionId: 'slot:2' });

    expect(state.step).toBe('recommend');
    expect(state.booking.slotId).toBe('2');
    expect(state.recommendation.action).toBe('later');
    expect(state.recommendation.slotId).toBe('3');
    expect(lastMessage().textKey).toBe('recommend');
    expect(lastMessage().params).toEqual({ alternative: '14:00 – 15:00' });
    expect(state.currentOptions.map((option) => option.id)).toEqual(['recommendAccept', 'recommendKeep']);
  });

  it('accept switches the booking slot and the summary follows it', () => {
    goToSlots(crowdedSlots);
    run({ type: 'PICK', optionId: 'slot:2' });
    run({ type: 'PICK', optionId: 'recommendAccept' });

    expect(state.step).toBe('counts');
    expect(state.booking.slotId).toBe('3');
    expect(state.booking.slotLabel).toBe('14:00 – 15:00');
    expect(state.recommendation).toBeNull();

    run({ type: 'SET_COUNTS', counts: { 1: 2 } });
    run({ type: 'SET_VISITOR', visitor: { name: 'Asha Rao', email: 'asha@example.com', phone: '' } });
    expect(state.step).toBe('summary');
    expect(state.booking.slotId).toBe('3');
    expect(state.booking.slotLabel).toBe('14:00 – 15:00');
  });

  it('keep preserves the originally selected slot', () => {
    goToSlots(crowdedSlots);
    run({ type: 'PICK', optionId: 'slot:2' });
    run({ type: 'PICK', optionId: 'recommendKeep' });

    expect(state.step).toBe('counts');
    expect(state.booking.slotId).toBe('2');
    expect(state.booking.slotLabel).toBe('13:00 – 14:00');
  });

  it('continues safely when no quieter slot exists', () => {
    goToSlots([
      crowdedSlots[1],
      { id: 'slot:3', value: '3', meta: { label: '14:00 – 15:00', startTime: '14:00', remaining: 5, booked: 95, capacity: 100, soldOut: false } },
      { id: 'slot:4', value: '4', meta: { label: '15:00 – 16:00', startTime: '15:00', remaining: 0, booked: 100, capacity: 100, soldOut: true } },
    ]);
    run({ type: 'PICK', optionId: 'slot:2' });

    expect(state.step).toBe('counts');
    expect(state.recommendation).toBeNull();
    expect(state.booking.slotId).toBe('2');
  });

  it('continues safely when occupancy data is missing', () => {
    goToSlots([{ id: 'slot:1', value: '1', meta: { label: '10:00 – 11:00', startTime: '10:00', soldOut: false } }]);
    run({ type: 'PICK', optionId: 'slot:1' });

    expect(state.step).toBe('counts');
    expect(state.recommendation).toBeNull();
    expect(state.booking.slotId).toBe('1');
  });
});

describe('date and typed input', () => {
  it('rejects dates in the past', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_DATE', value: '2020-01-01' });
    expect(state.step).toBe('date');
    expect(lastMessage().textKey).toBe('invalidDate');
  });

  it('accepts typed visitor details instead of the form', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_DATE', value: future });
    run({ type: 'LOADED', options: [{ id: 'slot:1', value: '1', meta: { soldOut: false } }] });
    run({ type: 'PICK', optionId: 'slot:1' });
    run({ type: 'SET_COUNTS', counts: { 1: 1 } });
    expect(state.step).toBe('visitor');

    run({ type: 'TEXT', text: 'Asha Rao, asha@example.com' });
    expect(state.step).toBe('summary');
    expect(state.booking.visitor).toEqual({ name: 'Asha Rao', email: 'asha@example.com', phone: '' });
  });

  it('keeps asking when typed visitor details have no name', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'SET_DATE', value: future });
    run({ type: 'LOADED', options: [{ id: 'slot:1', value: '1', meta: { soldOut: false } }] });
    run({ type: 'PICK', optionId: 'slot:1' });
    run({ type: 'SET_COUNTS', counts: { 1: 1 } });

    run({ type: 'TEXT', text: 'asha@example.com' });
    expect(state.step).toBe('visitor');
  });

  it('understands typed dates and counts', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'TEXT', text: 'tomorrow' });
    expect(state.step).toBe('slot');
    expect(state.booking.date).toBe(addDays(todayISO(), 1));

    run({ type: 'LOADED', options: [{ id: 'slot:1', value: '1', meta: { soldOut: false } }] });
    run({ type: 'PICK', optionId: 'slot:1' });
    run({ type: 'TEXT', text: '2 adults 1 child' });
    expect(state.step).toBe('visitor');
    expect(state.booking.counts).toEqual({ 1: 2, 2: 1 });
  });
});

describe('fallback', () => {
  it('offers a retry once and then returns to the main menu', () => {
    run({ type: 'TEXT', text: 'zzzz' });
    expect(state.step).toBe('start');
    expect(lastMessage().textKey).toBe('fallbackRetry');

    run({ type: 'TEXT', text: 'qqqq' });
    expect(state.step).toBe('start');
    expect(lastMessage().textKey).toBe('fallback');
    expect(state.messages.some((message) => message.textKey === 'welcome')).toBe(true);
    expect(state.currentOptions.map((option) => option.id)).toContain('book');
  });
});

describe('navigation', () => {
  it('goes back to the previous state', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'BACK' });
    expect(state.step).toBe('target');

    run({ type: 'BACK' });
    expect(state.step).toBe('start');
  });

  it('resets the booking on restart', () => {
    run({ type: 'PICK', optionId: 'book' });
    run({ type: 'PICK', optionId: 'entry' });
    run({ type: 'RESTART' });
    expect(state.step).toBe('start');
    expect(state.booking.target).toBeNull();
  });

  it('answers info topics', () => {
    run({ type: 'PICK', optionId: 'info' });
    run({ type: 'PICK', optionId: 'timings' });
    expect(state.step).toBe('infoAnswer');
    expect(state.infoKey).toBe('timings');

    run({ type: 'LOADED', textKey: 'info.timings', params: {} });
    expect(lastMessage().textKey).toBe('info.timings');
  });
});
