
import { flow } from './flow';
import * as nlu from './nlu';
import { todayISO } from '../../lib/format';
import { dayTypeOf, findQuieterSlot, occupancyOf, recommend } from '../../ml/usePolicy';

let sequence = 0;
const nextId = () => `msg-${++sequence}`;

export function emptyVisitor() {
  return { name: '', email: '', phone: '' };
}

export function emptyBooking() {
  return {
    target: null,
    refId: null,
    refName: '',
    refNameHi: '',
    date: null,
    slotId: null,
    slotLabel: null,
    counts: {},
    visitor: emptyVisitor(),
  };
}

export function initialChat(lang = 'en') {
  return {
    lang,
    step: 'start',
    booking: emptyBooking(),
    messages: [],
    currentOptions: [],
    control: null,
    retries: 0,
    pending: false,
    history: [],
    ticket: null,
    infoKey: null,
    failedStep: null,
    entryId: 0,
    errorKey: null,
    errorMessage: null,
    recommendation: null,
  };
}

export function normalizeOptions(options) {
  return (options || []).map((option) =>
    typeof option === 'string' ? { id: option, labelKey: `option.${option}` } : option,
  );
}

const bot = (textKey, extra = {}) => ({ id: nextId(), from: 'bot', textKey, ...extra });
const user = (textKey, extra = {}) => ({ id: nextId(), from: 'user', textKey, ...extra });

function addBot(state, textKey, extra = {}) {
  return { ...state, messages: [...state.messages, bot(textKey, extra)] };
}

function addUser(state, textKey, extra = {}) {
  return { ...state, messages: [...state.messages, user(textKey, extra)] };
}

export function enterStep(
  state,
  stepId,
  { options, params, textKey, ticket, errorKey, errorMessage, infoKey, append = true, pushHistory = true } = {},
) {
  const definition = flow[stepId];
  if (!definition) return state;

  const resolvedOptions = normalizeOptions(options ?? definition.options);
  const isAsync = Boolean(definition.load || definition.action);
  const nextState = {
    ...state,
    step: stepId,
    history: (pushHistory ? [...state.history, state.step] : state.history).slice(-25),
    currentOptions: resolvedOptions,
    control: definition.control || null,
    retries: 0,
    pending: isAsync,
    entryId: state.entryId + 1,
    ticket: ticket ?? state.ticket,
    infoKey: infoKey ?? null,
    errorKey: errorKey || null,
    errorMessage: errorMessage || null,
  };

  if (!append || definition.load || definition.action) return nextState;

  const key = textKey || definition.say;
  if (!key) return nextState;

  return {
    ...nextState,
    messages: [
      ...state.messages,
      bot(key, {
        params,
        options: resolvedOptions,
        control: definition.control || null,
        ticket,
        errorKey,
        errorMessage,
      }),
    ],
  };
}

function promptOptions(state) {
  return { options: state.currentOptions, control: state.control };
}

function retry(state, typedText) {
  const retries = state.retries + 1;
  const base = typedText ? addUser(state, undefined, { text: typedText }) : state;

  if (retries >= 2) {
    const options = normalizeOptions(flow.start.options);
    return {
      ...addBot(base, 'fallback', { options }),
      step: 'start',
      currentOptions: options,
      control: null,
      retries: 0,
      pending: false,
      history: [...state.history, state.step].slice(-25),
      entryId: state.entryId + 1,
      infoKey: null,
    };
  }

  return addBot({ ...base, retries }, 'fallbackRetry', {
    ...promptOptions(state),
    params: { remaining: 2 - retries },
  });
}

function resetForNewBooking(state) {
  return {
    ...state,
    booking: { ...emptyBooking(), visitor: state.booking.visitor },
    recommendation: null,
  };
}

/**
 * After a slot is picked, evaluate its occupancy with the trained policy and
 * look for the nearest quieter slot in the recommended direction.
 * Returns null (keep the flow unchanged) whenever anything is missing.
 */
function buildRecommendation(state, option) {
  try {
    const meta = option.meta || {};
    const load = occupancyOf(meta.booked, meta.capacity);
    if (load == null) return null;

    const dayType = dayTypeOf(state.booking.date);
    if (!dayType) return null;

    const action = recommend({ dayType, load });
    if (action !== 'earlier' && action !== 'later') return null;

    const selected = {
      id: option.value,
      startTime: meta.startTime,
      booked: meta.booked,
      capacity: meta.capacity,
    };
    const slots = state.currentOptions.map((row) => ({
      id: row.value,
      startTime: row.meta?.startTime,
      booked: row.meta?.booked,
      capacity: row.meta?.capacity,
      soldOut: row.meta?.soldOut,
    }));

    const alternative = findQuieterSlot({ slots, selected, action });
    if (!alternative) return null;

    const altOption = state.currentOptions.find((row) => row.value === alternative.id);
    return {
      action,
      dayType,
      load,
      slotId: alternative.id,
      slotLabel: altOption?.meta?.label || altOption?.label || '',
    };
  } catch {
    return null;
  }
}

function back(state) {
  if (state.history.length === 0) return enterStep(state, 'start');
  const history = [...state.history];
  const previous = history.pop();
  if (!flow[previous]) return enterStep({ ...state, history }, 'start');
  return enterStep({ ...state, history }, previous, { pushHistory: false });
}

export function pick(state, optionId) {
  const definition = flow[state.step];
  if (!definition) return state;

  const option = state.currentOptions.find((row) => row.id === optionId);
  const label = option ? { text: option.label, textKey: option.labelKey } : { textKey: `option.${optionId}` };
  const base = addUser(state, label.textKey, { text: label.text });

  if (optionId === 'menu') return enterStep(base, 'start');
  if (optionId === 'back') return back(base);
  if (optionId === 'restart') return enterStep(resetForNewBooking(base), 'start');
  if (optionId === 'help') return enterStep(base, 'help');
  if (optionId === 'language') return enterStep(base, 'language');
  if (optionId === 'english' || optionId === 'hindi') {
    return enterStep({ ...base, lang: optionId === 'hindi' ? 'hi' : 'en' }, 'start');
  }
  if (optionId === 'retryLoad') return enterStep(base, state.failedStep || 'start');
  if (optionId === 'retryCancel') return enterStep(base, 'cancelAsk');

  if (state.step === 'pickExhibition' || state.step === 'pickShow') {
    if (!option) return retry(state);
    return enterStep(
      {
        ...base,
        booking: {
          ...state.booking,
          refId: option.value,
          refName: option.label,
          refNameHi: option.labelHi || option.label,
        },
      },
      definition.next,
    );
  }

  if (state.step === 'slot') {
    if (!option) return retry(state);
    if (option.meta?.soldOut) return addBot(base, 'slotSoldOut', promptOptions(state));
    const booking = { ...state.booking, slotId: option.value, slotLabel: option.meta?.label || '' };
    const recommendation = buildRecommendation(state, option);
    if (!recommendation) return enterStep({ ...base, booking, recommendation: null }, 'counts');
    return enterStep(
      { ...base, booking, recommendation },
      'recommend',
      { params: { alternative: recommendation.slotLabel } },
    );
  }

  if (state.step === 'recommend') {
    if (optionId === 'recommendAccept' && state.recommendation) {
      return enterStep(
        {
          ...base,
          recommendation: null,
          booking: {
            ...state.booking,
            slotId: state.recommendation.slotId,
            slotLabel: state.recommendation.slotLabel,
          },
        },
        'counts',
      );
    }
    if (optionId === 'recommendKeep') return enterStep({ ...base, recommendation: null }, 'counts');
    return retry(state);
  }

  if (state.step === 'date' || state.step === 'counts' || state.step === 'visitor' || state.step === 'cancelAsk') {
    return state;
  }

  const transition = definition.next?.[optionId];
  if (!transition) return state;
  const target = typeof transition === 'string' ? transition : transition.step;
  const infoKey = typeof transition === 'object' ? transition.infoKey : null;

  let nextState = base;
  if (state.step === 'target') {
    nextState = {
      ...nextState,
      booking: {
        ...state.booking,
        target: optionId,
        refId: optionId === 'entry' ? null : state.booking.refId,
        refName: optionId === 'entry' ? '' : state.booking.refName,
        refNameHi: optionId === 'entry' ? '' : state.booking.refNameHi,
      },
    };
  }
  if (optionId === 'cancelBooking') nextState = resetForNewBooking(base);
  if (state.step === 'ticket' && optionId === 'newBooking') nextState = resetForNewBooking(base);
  if (state.step === 'slotEmpty' && optionId === 'changeDate') {
    nextState = { ...base, booking: { ...state.booking, slotId: null, slotLabel: null } };
  }
  if (state.step === 'start' && optionId === 'book') nextState = resetForNewBooking(base);

  return enterStep(nextState, target, { infoKey });
}

function setDate(state, value, display) {
  if (!value || value < todayISO()) {
    return addBot(state, 'invalidDate', { control: 'date' });
  }
  const base = addUser(state, undefined, { text: display || value });
  return enterStep(
    { ...base, recommendation: null, booking: { ...state.booking, date: value, slotId: null, slotLabel: null } },
    'slot',
  );
}

function setCounts(state, counts, display) {
  const total = Object.values(counts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (total === 0) return addBot(state, 'invalidCounts', { control: 'counts' });
  const base = addUser(state, undefined, { text: display || String(total) });
  return enterStep({ ...base, booking: { ...state.booking, counts } }, 'visitor');
}

function setVisitor(state, visitor, display) {
  const name = String(visitor?.name || '').trim();
  const email = String(visitor?.email || '').trim();
  const phone = String(visitor?.phone || '').trim();

  const invalid = !name || (!email && !phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (!email && phone.replace(/\D/g, '').length < 10);
  if (invalid) return addBot(state, 'invalidVisitor', { control: 'visitor' });

  const base = addUser(state, undefined, { text: name });
  return enterStep({ ...base, booking: { ...state.booking, visitor: { name, email, phone } } }, 'summary');
}

function text(state, value) {
  const raw = String(value || '').trim();
  if (!raw) return state;
  const normalized = nlu.normalize(raw);

  if (/^\d{1,2}$/.test(normalized)) {
    const option = state.currentOptions[Number(normalized) - 1];
    if (option) {
      if (option.meta?.soldOut) return addBot(state, 'slotSoldOut', promptOptions(state));
      return pick(state, option.id);
    }
  }

  const global = nlu.matchGlobal(normalized);
  if (global) return pick(state, global);

  if (state.step === 'date') {
    const iso = nlu.parseDate(raw);
    if (iso) return setDate(state, iso, raw);
  }

  if (state.step === 'counts') {
    const parsed = nlu.parseCounts(raw);
    if (parsed) {
      const mapped = {};
      Object.entries(parsed).forEach(([key, quantity]) => {
        const id = { adult: 1, child: 2, student: 3 }[key];
        if (id) mapped[id] = quantity;
      });
      if (Object.keys(mapped).length) return setCounts(state, mapped, raw);
    }
  }

  if (state.step === 'visitor') {
    const visitor = nlu.parseVisitor(raw);
    if (visitor) return setVisitor(state, visitor, raw);
  }

  const matched = nlu.matchOption(raw, state.currentOptions);
  if (matched) {
    const option = state.currentOptions.find((row) => row.id === matched);
    if (option?.meta?.soldOut) return addBot(state, 'slotSoldOut', promptOptions(state));
    return pick(state, matched);
  }

  if (state.step === 'slot') {
    const slotId = nlu.matchSlot(raw, state.currentOptions);
    if (slotId) return pick(state, slotId);
  }

  return retry(state, raw);
}

export function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return enterStep({ ...state, messages: [] }, 'start');
    case 'REQUIRE_AUTH': {
      const base = action.text ? addUser(state, undefined, { text: action.text }) : state;
      return enterStep(base, 'authRequired');
    }
    case 'PICK':
      return pick(state, action.optionId);
    case 'TEXT':
      return text(state, action.text);
    case 'SET_DATE':
      return setDate(state, action.value, action.display);
    case 'SET_COUNTS':
      return setCounts(state, action.counts, action.display);
    case 'SET_VISITOR':
      return setVisitor(state, action.visitor, action.display);
    case 'LOADED': {
      const key = action.textKey || flow[state.step]?.say;
      const options = normalizeOptions(action.options ?? state.currentOptions);
      const loaded = {
        ...state,
        pending: false,
        currentOptions: options,
        control: action.control ?? state.control,
      };
      if (!key) return loaded;
      return {
        ...loaded,
        messages: [
          ...state.messages,
          bot(key, { params: action.params, options, control: loaded.control }),
        ],
      };
    }
    case 'LOAD_ERROR':
      return enterStep({ ...state, pending: false, failedStep: state.step }, 'loadFailed', {
        errorKey: action.errorKey,
        errorMessage: action.errorMessage,
      });
    case 'SLOT_EMPTY':
      return enterStep({ ...state, pending: false }, 'slotEmpty');
    case 'SOLD_OUT': {
      const base = addBot(state, 'slotConflict', { options: [] });
      return enterStep({ ...base, booking: { ...state.booking, slotId: null, slotLabel: null } }, 'slot');
    }
    case 'TICKET':
      return enterStep({ ...state, pending: false, ticket: action.ticket }, 'ticket', { ticket: action.ticket });
    case 'PAY_FAILED':
      return enterStep({ ...state, pending: false }, 'payFailed', {
        textKey: action.textKey,
        errorKey: action.errorKey,
        errorMessage: action.errorMessage,
      });
    case 'CANCEL_DONE':
      return enterStep(addUser(state, undefined, { text: action.booking?.bookingCode || '' }), 'cancelResult', {
        textKey: 'cancelSuccess',
        params: { code: action.booking?.bookingCode },
      });
    case 'CANCEL_FAILED':
      return enterStep(addUser(state, undefined, { text: action.bookingCode || '' }), 'cancelResult', {
        textKey: 'cancelFailed',
        errorKey: action.errorKey,
        errorMessage: action.errorMessage,
      });
    case 'SET_LANG':
      return { ...state, lang: action.lang };
    case 'RESTART':
      return enterStep(resetForNewBooking(state), 'start');
    case 'BACK':
      return back(state);
    default:
      return state;
  }
}
