const $ = id => document.getElementById(id);
const form = $('tripForm');

const CACHE_PREFIX = 'trackworld-itinerary-v4:';
const LEGACY_CACHE_PREFIX = 'trackworld-itinerary-v3:';
const METRICS_KEY = 'trackworld-module1-metrics-v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;

let tripType = 'International';
let generatedTrip = null;
let appointmentRequest = '';
let serverStatus = {
  mode: 'mock',
  itinerarySchemaVersion: 4
};

let loadingTimer = null;
let dayObserver = null;

const sessionMetrics = {
  sessionId:
    crypto.randomUUID?.() ||
    `session-${Date.now()}`,

  module: 'dashboard',
  startedAt: new Date().toISOString(),
  firstInteractionAt: null,
  submittedAt: null,
  completedAt: null,
  completionTimeMs: null,
  generationTimeMs: null,
  interactions: 0,
  changedFields: [],
  activityChanges: 0,
  resultSource: null,
  requestId: null,
  successful: false,
  satisfaction: null
};

const touchedFields = new Set();

const interests = [
  'Culture & history',
  'Nature & scenery',
  'Food & flavours',
  'Adventure',
  'Shopping',
  'Beach & relaxation'
];

const services = [
  'Flights',
  'Hotels',
  'Airport transfers',
  'Visa assistance',
  'Travel insurance',
  'Forex'
];

const activityTypes = [
  {
    type: 'preparation',
    label: 'Start comfortably',
    icon: '☕'
  },
  {
    type: 'morning',
    label: 'Morning experience',
    icon: '☀'
  },
  {
    type: 'midday',
    label: 'Lunch & pause',
    icon: '◐'
  },
  {
    type: 'afternoon',
    label: 'Afternoon discovery',
    icon: '✦'
  },
  {
    type: 'evening',
    label: 'Evening & dinner',
    icon: '☾'
  }
];

const loadingStages = [
  'Understanding your travel preferences',
  'Balancing experiences, meals and rest',
  'Arranging a comfortable day-by-day flow',
  'Preparing recommendations for expert review'
];

const selectedPlaces = {
  origin: null,
  destination: null
};

function clearSelectedPlace(id) {
  selectedPlaces[id] = null;
}

function setSelectedPlace(
  id,
  place
) {
  selectedPlaces[id] = place;
}

function isSelectedIndianPlace(id) {
  const input = $(id);
  const place =
    selectedPlaces[id];

  return Boolean(
    place &&
    place.countryCode === 'IN' &&
    normalize(place.name) ===
      normalize(input.value)
  );
}

function createChips(
  id,
  values,
  selectedValues
) {
  const container = $(id);

  if (!container) {
    return;
  }

  container.replaceChildren();

  values.forEach(value => {
    const label =
      document.createElement('label');

    label.className = 'chip';

    const input =
      document.createElement('input');

    input.type = 'checkbox';
    input.name = id;
    input.value = value;

    input.checked =
      selectedValues.includes(value);

    const text =
      document.createElement('span');

    text.textContent = value;

    label.append(input, text);
    container.append(label);
  });
}

function localDate(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      date.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const [
    year,
    month,
    day
  ] =
    value
      .split('-')
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    12
  );
}

function addDays(
  value,
  numberOfDays
) {
  const date =
    parseDate(value);

  if (!date) {
    return null;
  }

  date.setDate(
    date.getDate() +
    numberOfDays
  );

  return date;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .trim();
}


function getChecked(name) {
  return [
    ...document.querySelectorAll(
      `input[name="${name}"]:checked`
    )
  ].map(input => input.value);
}

function getTrip() {
  return {
    type: tripType,

    origin:
      $('origin').value.trim(),

    destination:
      $('destination').value.trim(),

    start:
      $('start').value,

    end:
      $('end').value,

    adults:
      Number(
        $('adults').value
      ),

    children:
      Number(
        $('children').value
      ),

    budget:
      Number(
        $('budget').value
      ),

    budgetType:
      $('budgetType').value,

    occasion:
      $('occasion').value,

    hotel:
      $('hotel').value,

    pace:
      $('pace').value,

    interests:
      getChecked(
        'interests'
      ),

    services:
      getChecked(
        'services'
      ),

    comments:
      $('comments')
        .value
        .trim()
  };
}

function tripDays(trip) {
  const start =
    parseDate(trip.start);

  const end =
    parseDate(trip.end);

  if (!start || !end) {
    return 0;
  }

  return Math.round(
    (end - start) /
      86400000
  ) + 1;
}

function formatCurrency(value) {
  const amount =
    Number.isFinite(
      Number(value)
    )
      ? Math.round(
          Number(value)
        )
      : 0;

  return `₹${amount.toLocaleString(
    'en-IN'
  )}`;
}

function formatDate(
  value,
  includeYear = false
) {
  const date =
    typeof value === 'string'
      ? parseDate(value)
      : value;

  if (!date) {
    return '';
  }

  return date.toLocaleDateString(
    'en-GB',
    {
      day: 'numeric',
      month: 'short',

      ...(includeYear
        ? {
            year: 'numeric'
          }
        : {})
    }
  );
}

function formatDayHeading(date) {
  if (!date) {
    return '';
  }

  return date
    .toLocaleDateString(
      'en-GB',
      {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      }
    )
    .toUpperCase();
}

function showError(message) {
  if ($('error')) {
    $('error').textContent =
      message || '';
  }
}

function noteInteraction(
  fieldName
) {
  sessionMetrics.interactions += 1;

  if (
    !sessionMetrics
      .firstInteractionAt
  ) {
    sessionMetrics
      .firstInteractionAt =
        new Date().toISOString();
  }

  if (
    fieldName &&
    !touchedFields.has(
      fieldName
    )
  ) {
    touchedFields.add(
      fieldName
    );

    sessionMetrics.changedFields =
      [...touchedFields];
  }
}

function clearDomesticValidity() {
  $('origin')
    .setCustomValidity('');

  $('destination')
    .setCustomValidity('');
}

function validateDomesticField(
  id,
  displayMessage = false
) {
  const input = $(id);

  if (
    tripType !== 'Domestic' ||
    !input.value.trim()
  ) {
    input.setCustomValidity('');
    return true;
  }

  if (
    isSelectedIndianPlace(id)
  ) {
    input.setCustomValidity('');

    if (
      $('error')?.dataset
        .locationError ===
      'true'
    ) {
      showError('');

      delete $('error')
        .dataset
        .locationError;
    }

    return true;
  }

  const fieldName =
    id === 'origin'
      ? 'departure city'
      : 'destination';

  input.setCustomValidity(
    `Select an Indian ${fieldName} from the dropdown or switch to International.`
  );

  if (displayMessage) {
    showError(
      `${input.value.trim()} cannot be used in Domestic mode. Select an Indian ${fieldName} from the dropdown, or switch to International.`
    );

    $('error').dataset
      .locationError =
        'true';
  }

  return false;
}

function validateTrip(trip) {
  const days =
    tripDays(trip);

  if (
    !trip.origin ||
    !trip.destination
  ) {
    throw new Error(
      'Please enter both your departure city and destination.'
    );
  }

  if (
    trip.type ===
      'Domestic' &&
    (
      !isSelectedIndianPlace(
        'origin'
      ) ||
      !isSelectedIndianPlace(
        'destination'
      )
    )
  ) {
    throw new Error(
      'Domestic trips require Indian locations in both boxes. Select them from the dropdown or switch to International.'
    );
  }

  if (
    !trip.start ||
    !trip.end
  ) {
    throw new Error(
      'Please select your travel dates.'
    );
  }

  if (days < 1) {
    throw new Error(
      'The return date must be the same as or later than the departure date.'
    );
  }

  if (days > 30) {
    throw new Error(
      'This planner supports trips of up to 30 days.'
    );
  }

  if (
    !Number.isInteger(
      trip.adults
    ) ||
    trip.adults < 1
  ) {
    throw new Error(
      'At least one adult is required.'
    );
  }

  if (
    !Number.isInteger(
      trip.children
    ) ||
    trip.children < 0
  ) {
    throw new Error(
      'Enter a valid number of children.'
    );
  }

  if (
    !Number.isFinite(
      trip.budget
    ) ||
    trip.budget < 1000
  ) {
    throw new Error(
      'Enter a budget of at least ₹1,000.'
    );
  }
}

function updateSummary() {
  const trip =
    getTrip();

  const travellers =
    Math.max(
      0,
      trip.adults +
        trip.children
    );

  const totalBudget =
    trip.budgetType ===
      'person'
      ? trip.budget *
        travellers
      : trip.budget;

  const days =
    tripDays(trip);

  if ($('sumDestination')) {
    $('sumDestination')
      .textContent =
        trip.destination ||
        'Choose a destination';
  }

  if ($('sumOrigin')) {
    $('sumOrigin')
      .textContent =
        trip.origin ||
        'Choose a city';
  }

  if ($('sumDates')) {
    $('sumDates')
      .textContent =
        trip.start &&
        trip.end
          ? `${formatDate(
              trip.start
            )} – ${formatDate(
              trip.end,
              true
            )}`
          : 'Choose dates';
  }

  if ($('sumTravellers')) {
    $('sumTravellers')
      .textContent =
        `${trip.adults || 0} adult${
          trip.adults === 1
            ? ''
            : 's'
        }` +
        (
          trip.children
            ? ` · ${trip.children} ${
                trip.children === 1
                  ? 'child'
                  : 'children'
              }`
            : ''
        );
  }

  if ($('sumStyle')) {
    $('sumStyle')
      .textContent =
        `${trip.occasion} · ${trip.pace}`;
  }

  if ($('sumNights')) {
    $('sumNights')
      .textContent =
        days > 0
          ? `${Math.max(
              0,
              days - 1
            )} night${
              days - 1 === 1
                ? ''
                : 's'
            }`
          : '';
  }

  if ($('sumBudget')) {
    $('sumBudget')
      .textContent =
        formatCurrency(
          totalBudget
        );
  }

  if ($('sumPerPerson')) {
    $('sumPerPerson')
      .textContent =
        travellers > 0
          ? `${formatCurrency(
              totalBudget /
                travellers
            )} per traveller · budget target, not a quote`
          : 'Budget target, not a quote';
  }

  $('end').min =
    trip.start ||
    localDate(
      new Date()
    );

  if ($('commentCount')) {
    $('commentCount')
      .textContent =
        `${
          $('comments')
            .value
            .length
        } / 2000`;
  }
}

function setTripType(type) {
  tripType = type;

  document
    .querySelectorAll(
      '[data-type]'
    )
    .forEach(button => {
      const selected =
        button.dataset.type ===
        type;

      button.classList.toggle(
        'selected',
        selected
      );

      button.setAttribute(
        'aria-pressed',
        String(selected)
      );
    });

  clearDomesticValidity();
  showError('');

  if (type === 'Domestic') {
    if (
      !isSelectedIndianPlace(
        'origin'
      )
    ) {
      $('origin').value =
        'New Delhi';

      setSelectedPlace(
        'origin',
        {
          id: 1261481,
          name: 'New Delhi',
          region: 'Delhi',
          country: 'India',
          countryCode: 'IN'
        }
      );
    }

    if (
      !isSelectedIndianPlace(
        'destination'
      )
    ) {
      $('destination').value =
        'Goa';

      setSelectedPlace(
        'destination',
        {
          name: 'Goa',
          region: 'Goa',
          country: 'India',
          countryCode: 'IN'
        }
      );
    }
  } else {
    clearSelectedPlace(
      'origin'
    );

    clearSelectedPlace(
      'destination'
    );

    if (
      !$('destination')
        .value
        .trim() ||
      normalize(
        $('destination').value
      ) === 'goa'
    ) {
      $('destination').value =
        'Dubai';
    }
  }

  updateSummary();
}
function attachSuggestions(id) {
  const input = $(id);
  const wrapper =
    input.parentElement;

  wrapper.classList.add(
    'place-field'
  );

  input.removeAttribute(
    'list'
  );

  input.autocomplete = 'off';

  input.setAttribute(
    'role',
    'combobox'
  );

  input.setAttribute(
    'aria-autocomplete',
    'list'
  );

  input.setAttribute(
    'aria-expanded',
    'false'
  );

  const optionsBox =
    document.createElement(
      'div'
    );

  optionsBox.id =
    `${id}-suggestions`;

  optionsBox.className =
    'place-options';

  optionsBox.setAttribute(
    'role',
    'listbox'
  );

  optionsBox.hidden = true;

  wrapper.append(
    optionsBox
  );

  input.setAttribute(
    'aria-controls',
    optionsBox.id
  );

  let matches = [];
  let activeIndex = -1;
  let debounceTimer = null;
  let requestController = null;
  let requestSequence = 0;

  function close() {
    optionsBox.hidden = true;
    activeIndex = -1;

    input.setAttribute(
      'aria-expanded',
      'false'
    );

    input.removeAttribute(
      'aria-activedescendant'
    );
  }

  function showHint(message) {
    optionsBox
      .replaceChildren();

    const hint =
      document.createElement(
        'div'
      );

    hint.className =
      'place-hint';

    hint.textContent =
      message;

    optionsBox.append(
      hint
    );

    optionsBox.hidden =
      false;

    input.setAttribute(
      'aria-expanded',
      'true'
    );
  }

  function select(index) {
    const place =
      matches[index];

    if (!place) {
      return;
    }

    input.value =
      place.name;

    setSelectedPlace(
      id,
      place
    );

    input.setCustomValidity(
      ''
    );

    showError('');

    input.dispatchEvent(
      new Event(
        'change',
        {
          bubbles: true
        }
      )
    );

    close();
    input.focus();
  }

  function updateActive() {
    optionsBox
      .querySelectorAll(
        '[role="option"]'
      )
      .forEach(
        (
          option,
          index
        ) => {
          const active =
            index ===
            activeIndex;

          option.setAttribute(
            'aria-selected',
            String(active)
          );

          if (active) {
            input.setAttribute(
              'aria-activedescendant',
              option.id
            );

            option.scrollIntoView({
              block: 'nearest'
            });
          }
        }
      );
  }

  function renderMatches() {
    optionsBox
      .replaceChildren();

    matches.forEach(
      (
        place,
        index
      ) => {
        const option =
          document.createElement(
            'div'
          );

        option.id =
          `${optionsBox.id}-${index}`;

        option.className =
          'place-option';

        option.setAttribute(
          'role',
          'option'
        );

        option.setAttribute(
          'aria-selected',
          'false'
        );

        const name =
          document.createElement(
            'strong'
          );

        name.textContent =
          place.name;

        const location =
          document.createElement(
            'small'
          );

        location.textContent =
          [
            place.region,
            place.country
          ]
            .filter(Boolean)
            .join(', ');

        option.append(
          name,
          location
        );

        option.addEventListener(
          'pointerdown',
          event => {
            event.preventDefault();
          }
        );

        option.addEventListener(
          'click',
          () => {
            select(index);
          }
        );

        optionsBox.append(
          option
        );
      }
    );

    const hint =
      document.createElement(
        'div'
      );

    hint.className =
      'place-hint';

    if (
      tripType ===
      'Domestic'
    ) {
      hint.textContent =
        matches.length
          ? 'Indian cities only · select a city from these results'
          : 'No Indian city found. For a location outside India, switch to International.';
    } else {
      hint.textContent =
        matches.length
          ? 'Worldwide city results · select the correct city and country'
          : 'No matching city found. Check the spelling or try a nearby major city.';
    }

    optionsBox.append(
      hint
    );

    optionsBox.hidden =
      false;

    input.setAttribute(
      'aria-expanded',
      'true'
    );
  }

  async function search() {
    const query =
      input.value.trim();

    if (query.length < 2) {
      matches = [];

      showHint(
        'Type at least two letters to search cities.'
      );

      return;
    }

    requestController?.abort();

    requestController =
      new AbortController();

    const currentSequence =
      ++requestSequence;

    showHint(
      'Searching cities…'
    );

    try {
      const parameters =
        new URLSearchParams({
          q: query,
          mode: tripType,
          limit: '8'
        });

      const response =
        await fetch(
          `/api/places?${parameters}`,
          {
            headers: {
              Accept:
                'application/json'
            },

            signal:
              requestController.signal
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'City search is temporarily unavailable.'
        );
      }

      if (
        currentSequence !==
        requestSequence
      ) {
        return;
      }

      matches =
        Array.isArray(
          result.results
        )
          ? result.results
          : [];

      activeIndex = -1;
      renderMatches();
    } catch (error) {
      if (
        error.name ===
        'AbortError'
      ) {
        return;
      }

      matches = [];

      showHint(
        'City search is temporarily unavailable. Please try again.'
      );
    }
  }

  function scheduleSearch() {
    clearTimeout(
      debounceTimer
    );

    debounceTimer =
      setTimeout(
        search,
        220
      );
  }

  input.addEventListener(
    'focus',
    scheduleSearch
  );

  input.addEventListener(
    'input',
    () => {
      clearSelectedPlace(id);

      if (
        tripType ===
        'Domestic'
      ) {
        validateDomesticField(
          id,
          false
        );
      } else {
        input.setCustomValidity(
          ''
        );
      }

      scheduleSearch();
    }
  );

  input.addEventListener(
    'change',
    () => {
      validateDomesticField(
        id,
        true
      );
    }
  );

  input.addEventListener(
    'blur',
    () => {
      validateDomesticField(
        id,
        true
      );

      setTimeout(
        close,
        120
      );
    }
  );

  input.addEventListener(
    'keydown',
    event => {
      if (
        event.key ===
        'Escape'
      ) {
        close();
        return;
      }

      if (
        event.key ===
          'ArrowDown' ||
        event.key ===
          'ArrowUp'
      ) {
        event.preventDefault();

        if (!matches.length) {
          return;
        }

        const direction =
          event.key ===
          'ArrowDown'
            ? 1
            : -1;

        activeIndex =
          (
            activeIndex +
            direction +
            matches.length
          ) %
          matches.length;

        updateActive();
        return;
      }

      if (
        event.key ===
          'Enter' &&
        !optionsBox.hidden &&
        activeIndex >= 0
      ) {
        event.preventDefault();
        select(activeIndex);
      }
    }
  );

  document
    .querySelectorAll(
      '[data-type]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          requestController
            ?.abort();

          close();
        }
      );
    });
}
function setSystemStatus(
  type,
  message
) {
  if (
    !$('systemStatus') ||
    !$('systemStatusText')
  ) {
    return;
  }

  $('systemStatus')
    .classList
    .remove(
      'mock',
      'gemini',
      'error'
    );

  $('systemStatus')
    .classList
    .add(type);

  $('systemStatusText')
    .textContent =
      message;
}

async function loadStatus() {
  try {
    const response =
      await fetch(
        '/api/status'
      );

    if (!response.ok) {
      throw new Error();
    }

    serverStatus =
      await response.json();

    if (
      serverStatus.mode ===
      'gemini'
    ) {
      setSystemStatus(
        'gemini',
        `Gemini ready · ${serverStatus.geminiRequestsRemaining} API runs remaining`
      );
    } else {
      setSystemStatus(
        'mock',
        'Mock mode · zero Gemini requests'
      );
    }
  } catch {
    setSystemStatus(
      'error',
      'Server status unavailable'
    );
  }
}

function hashedCacheKey(
  trip,
  schemaVersion,
  prefix
) {
  const data =
    JSON.stringify({
      model:
        serverStatus
          .geminiModel ||
        'default',

      schemaVersion,

      trip: {
        ...trip,

        interests:
          [
            ...trip.interests
          ].sort(),

        services:
          [
            ...trip.services
          ].sort()
      }
    });

  let hash = 2166136261;

  for (
    let index = 0;
    index < data.length;
    index += 1
  ) {
    hash ^=
      data.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return (
    `${prefix}` +
    `${(hash >>> 0)
      .toString(36)}`
  );
}

function readStoredCache(key) {
  try {
    const raw =
      localStorage.getItem(
        key
      );

    if (!raw) {
      return null;
    }

    const cached =
      JSON.parse(raw);

    if (
      Date.now() -
        cached.savedAt >
        CACHE_TTL ||
      !cached.result
        ?.days
        ?.length
    ) {
      localStorage.removeItem(
        key
      );

      return null;
    }

    return cached.result;
  } catch {
    return null;
  }
}

function readCache(trip) {
  const currentKey =
    hashedCacheKey(
      trip,
      4,
      CACHE_PREFIX
    );

  const current =
    readStoredCache(
      currentKey
    );

  if (current) {
    return {
      result: current,
      legacy: false
    };
  }

  const legacyKey =
    hashedCacheKey(
      trip,
      3,
      LEGACY_CACHE_PREFIX
    );

  const legacy =
    readStoredCache(
      legacyKey
    );

  return legacy
    ? {
        result: legacy,
        legacy: true
      }
    : null;
}

function saveCache(
  trip,
  result
) {
  if (
    result.mode !==
    'gemini'
  ) {
    return;
  }

  try {
    localStorage.setItem(
      hashedCacheKey(
        trip,
        4,
        CACHE_PREFIX
      ),

      JSON.stringify({
        savedAt:
          Date.now(),

        result
      })
    );
  } catch {
    // Browser storage may be unavailable.
  }
}

function renderList(
  id,
  values,
  fallback
) {
  const container = $(id);

  if (!container) {
    return;
  }

  container
    .replaceChildren();

  const items =
    Array.isArray(values) &&
    values.length
      ? values
      : [fallback];

  items.forEach(value => {
    const item =
      document.createElement(
        'li'
      );

    item.textContent = value;

    container.append(item);
  });
}

function startLoading() {
  let stageIndex = 0;
  let progress = 18;

  if ($('resultContent')) {
    $('resultContent').hidden =
      true;
  }

  if ($('resultsLoading')) {
    $('resultsLoading').hidden =
      false;
  }

  if ($('loadingStage')) {
    $('loadingStage').textContent =
      loadingStages[0];
  }

  if ($('loadingProgress')) {
    $('loadingProgress')
      .style.width =
        `${progress}%`;
  }

  clearInterval(
    loadingTimer
  );

  loadingTimer =
    setInterval(
      () => {
        stageIndex =
          Math.min(
            stageIndex + 1,
            loadingStages.length - 1
          );

        progress =
          Math.min(
            progress + 22,
            88
          );

        if ($('loadingStage')) {
          $('loadingStage')
            .textContent =
              loadingStages[
                stageIndex
              ];
        }

        if (
          $('loadingProgress')
        ) {
          $('loadingProgress')
            .style.width =
              `${progress}%`;
        }
      },
      1100
    );
}

function stopLoading() {
  clearInterval(
    loadingTimer
  );

  loadingTimer = null;

  if ($('loadingProgress')) {
    $('loadingProgress')
      .style.width =
        '100%';
  }

  if ($('resultsLoading')) {
    $('resultsLoading').hidden =
      true;
  }

  if ($('resultContent')) {
    $('resultContent').hidden =
      false;
  }
}

function activityMeta(
  item,
  itemIndex
) {
  const fallback =
    activityTypes[itemIndex] ||
    {
      type: 'activity',
      label:
        `Activity ${itemIndex + 1}`,
      icon: '✦'
    };

  return (
    activityTypes.find(
      entry => {
        return (
          entry.type ===
          item?.type
        );
      }
    ) ||
    fallback
  );
}

function normalizeActivity(
  rawItem,
  itemIndex
) {
  if (
    typeof rawItem ===
    'string'
  ) {
    const legacyTimes = [
      '9:00 AM',
      '1:30 PM',
      '6:30 PM'
    ];

    return {
      type:
        activityTypes[
          itemIndex
        ]?.type ||
        'activity',

      time:
        legacyTimes[
          itemIndex
        ] ||
        'Time to confirm',

      title:
        activityTypes[
          itemIndex
        ]?.label ||
        `Activity ${itemIndex + 1}`,

      description:
        rawItem
    };
  }

  return {
    type:
      rawItem?.type ||
      activityTypes[
        itemIndex
      ]?.type ||
      'activity',

    time:
      rawItem?.time ||
      'Time to confirm',

    title:
      rawItem?.title ||
      `Activity ${itemIndex + 1}`,

    description:
      rawItem?.description ||
      'To be refined with your TrackWorld Vacations travel expert.'
  };
}

function updateChoiceSummary() {
  if ($('choiceSummary')) {
    $('choiceSummary').textContent =
      'Review your preliminary schedule, then let a TrackWorld Vacations expert refine every detail.';
  }
}

function createActivityCard(
  item,
  _dayIndex,
  itemIndex
) {
  const meta = activityMeta(
    item,
    itemIndex
  );

  const card = document.createElement(
    'article'
  );

  card.className =
    `schedule-card ` +
    `schedule-card-${itemIndex + 1} ` +
    `activity-${meta.type}`;

  const top = document.createElement(
    'div'
  );

  top.className = 'schedule-card-top';

  const identity = document.createElement(
    'div'
  );

  identity.className = 'activity-identity';

  const icon = document.createElement(
    'span'
  );

  icon.className = 'activity-icon';

  icon.setAttribute(
    'aria-hidden',
    'true'
  );

  icon.textContent = meta.icon;

  const identityText =
    document.createElement('span');

  identityText.textContent =
    meta.label;

  identity.append(
    icon,
    identityText
  );

  const activityNumber =
    document.createElement('span');

  activityNumber.className =
    'activity-number';

  activityNumber.textContent =
    String(itemIndex + 1).padStart(
      2,
      '0'
    );

  top.append(
    identity,
    activityNumber
  );

  const time = document.createElement(
    'time'
  );

  time.className = 'activity-time';
  time.textContent = item.time;

  const title = document.createElement(
    'h4'
  );

  title.textContent = item.title;

  const description =
    document.createElement('p');

  description.textContent =
    item.description;

  card.append(
    top,
    time,
    title,
    description
  );

  return card;
}

function buildDayNavigation(days) {
  const navigation =
    $('dayNavigation');

  if (!navigation) {
    return;
  }

  navigation
    .replaceChildren();

  days.forEach(
    (
      _day,
      index
    ) => {
      const link =
        document.createElement(
          'a'
        );

      link.href =
        `#day-${index + 1}`;

      link.dataset.dayTarget =
        String(index + 1);

      link.textContent =
        `Day ${index + 1}`;

      if (index === 0) {
        link.classList.add(
          'active'
        );
      }

      link.addEventListener(
        'click',
        event => {
          event.preventDefault();

          const target =
            $(
              `day-${index + 1}`
            );

          if (target) {
            target.open = true;

            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        }
      );

      navigation.append(
        link
      );
    }
  );

  dayObserver?.disconnect();

  dayObserver =
    new IntersectionObserver(
      entries => {
        const visible =
          entries
            .filter(entry => {
              return (
                entry
                  .isIntersecting
              );
            })
            .sort(
              (
                first,
                second
              ) => {
                return (
                  second
                    .intersectionRatio -
                  first
                    .intersectionRatio
                );
              }
            )[0];

        if (!visible) {
          return;
        }

        const number =
          visible
            .target
            .id
            .replace(
              'day-',
              ''
            );

        navigation
          .querySelectorAll(
            'a'
          )
          .forEach(link => {
            link.classList.toggle(
              'active',
              link.dataset
                .dayTarget ===
                number
            );
          });
      },
      {
        rootMargin:
          '-25% 0px -60% 0px',

        threshold: [
          0.05,
          0.25
        ]
      }
    );

  document
    .querySelectorAll(
      '.day'
    )
    .forEach(day => {
      dayObserver.observe(
        day
      );
    });
}

function updateResultOverview(
  trip,
  result
) {
  const totalBudget =
    trip.budgetType ===
      'person'
      ? trip.budget *
        (
          trip.adults +
          trip.children
        )
      : trip.budget;

  const numberOfDays =
    result.days.length;

  const travellers =
    trip.adults +
    trip.children;

  if ($('overviewRoute')) {
    $('overviewRoute')
      .textContent =
        `${trip.origin} → ${trip.destination}`;
  }

  if ($('overviewDuration')) {
    $('overviewDuration')
      .textContent =
        `${numberOfDays} day${
          numberOfDays === 1
            ? ''
            : 's'
        } · ` +
        `${Math.max(
          0,
          numberOfDays - 1
        )} night${
          numberOfDays - 1 === 1
            ? ''
            : 's'
        }`;
  }

  if ($('overviewTravellers')) {
    $('overviewTravellers')
      .textContent =
        `${travellers} traveller${
          travellers === 1
            ? ''
            : 's'
        }`;
  }

  if ($('overviewBudget')) {
    $('overviewBudget')
      .textContent =
        formatCurrency(
          totalBudget
        );
  }

  if ($('overviewPace')) {
    $('overviewPace')
      .textContent =
        `${trip.pace} · ${trip.hotel}`;
  }

  if ($('overviewDates')) {
    $('overviewDates')
      .textContent =
        `${formatDate(
          trip.start
        )} – ${formatDate(
          trip.end,
          true
        )}`;
  }
}

function sourceDescription(
  result,
  browserCached,
  legacyCached
) {
  if (browserCached) {
    return legacyCached
      ? 'Earlier browser cache · no API run used'
      : 'Browser cache · no API run used';
  }

  if (result.cached) {
    return (
      'Server cache · ' +
      'no new API run used'
    );
  }

  return (
    result.mode === 'gemini'
      ? 'Gemini API'
      : 'Local mock data'
  );
}

function renderMetrics() {
  const seconds =
    sessionMetrics
      .completionTimeMs == null
      ? '—'
      : `${(
          sessionMetrics
            .completionTimeMs /
          1000
        ).toFixed(1)} sec`;

  if ($('metricTime')) {
    $('metricTime')
      .textContent =
        seconds;
  }

  if ($('metricInteractions')) {
    $('metricInteractions')
      .textContent =
        String(
          sessionMetrics
            .interactions
        );
  }

  if ($('metricSource')) {
    $('metricSource')
      .textContent =
        sessionMetrics
          .resultSource ||
        '—';
  }

  if ($('metricChanges')) {
    $('metricChanges')
      .textContent =
        String(
          sessionMetrics
            .activityChanges
        );
  }
}

function saveMetrics() {
  // Module measurement has been disabled.
}

function renderItinerary(
  trip,
  result,
  options = {}
) {
  if (
    !Array.isArray(
      result.days
    ) ||
    !result.days.length
  ) {
    throw new Error(
      'The itinerary response did not contain any days.'
    );
  }

  const {
    browserCached = false,
    legacyCached = false
  } = options;

  generatedTrip = {
    ...trip,
    result
  };



  updateChoiceSummary();

  $('resultTitle')
    .textContent =
      result.tripTitle ||
      `${result.days.length} days in ${trip.destination}`;

  $('resultSummary')
    .textContent =
      result.summary ||
      `${trip.occasion} with a ${trip.pace.toLowerCase()} pace.`;

  if ($('resultSource')) {
    $('resultSource')
      .textContent =
        result.mode ===
        'gemini'
          ? 'Gemini AI itinerary'
          : 'Mock itinerary';
  }

  const source =
    sourceDescription(
      result,
      browserCached,
      legacyCached
    );

  if ($('cacheStatus')) {
    $('cacheStatus')
      .textContent =
        source;

    $('cacheStatus').hidden =
      false;
  }

  if ($('resultNotice')) {
    $('resultNotice')
      .textContent =
        result.mode ===
        'gemini'
          ? 'AI-generated preliminary itinerary. Prices, availability, routes, opening hours and visa requirements require expert verification.'
          : 'Mock itinerary generated locally. No Gemini API request was used.';
  }

  updateResultOverview(
    trip,
    result
  );

  $('days')
    .replaceChildren();

  result.days.forEach(
    (
      day,
      dayIndex
    ) => {
      const details =
        document.createElement(
          'details'
        );

      details.className =
        'day';

      details.id =
        `day-${dayIndex + 1}`;

      details.open =
        dayIndex < 2;

      details.style
        .setProperty(
          '--day-number',
          `"${String(
            dayIndex + 1
          ).padStart(
            2,
            '0'
          )}"`
        );

      const normalizedItems =
        (
          Array.isArray(
            day.items
          )
            ? day.items
            : []
        ).map(
          (
            item,
            itemIndex
          ) => {
            return normalizeActivity(
              item,
              itemIndex
            );
          }
        );

      const firstTime =
        normalizedItems[0]
          ?.time ||
        'Time to confirm';

      const lastTime =
        normalizedItems.at(-1)
          ?.time ||
        'Time to confirm';

      const date =
        addDays(
          trip.start,
          dayIndex
        );

      const heading =
        document.createElement(
          'summary'
        );

      const headingMain =
        document.createElement(
          'span'
        );

      headingMain.className =
        'day-heading-main';

      const dayLabel =
        document.createElement(
          'span'
        );

      dayLabel.className =
        'day-label';

      dayLabel.textContent =
        `DAY ${String(
          dayIndex + 1
        ).padStart(
          2,
          '0'
        )}`;

      const dayCopy =
        document.createElement(
          'span'
        );

      dayCopy.className =
        'day-copy';

      const dateLine =
        document.createElement(
          'span'
        );

      dateLine.className =
        'day-date';

      dateLine.textContent =
        formatDayHeading(
          date
        );

      const title =
        document.createElement(
          'strong'
        );

      title.className =
        'day-title';

      title.textContent =
        day.title ||
        `Day ${dayIndex + 1}`;

      const area =
        document.createElement(
          'span'
        );

      area.className =
        'day-area';

      area.textContent =
        `⌖ ${
          day.area ||
          trip.destination
        }`;

      dayCopy.append(
        dateLine,
        title,
        area
      );

      headingMain.append(
        dayLabel,
        dayCopy
      );

      const dayMeta =
        document.createElement(
          'span'
        );

      dayMeta.className =
        'day-meta';

      dayMeta.textContent =
        `${normalizedItems.length} activities · ` +
        `${firstTime}–${lastTime} · ` +
        `${trip.pace}`;

      heading.append(
        headingMain,
        dayMeta
      );

      const schedule =
        document.createElement(
          'div'
        );

      schedule.className =
        'schedule timed-schedule';

      normalizedItems.forEach(
        (
          item,
          itemIndex
        ) => {
          schedule.append(
            createActivityCard(
              item,
              dayIndex,
              itemIndex
            )
          );
        }
      );

      details.append(
        heading,
        schedule
      );

      if (day.note) {
        const note =
          document.createElement(
            'p'
          );

        note.className =
          'day-note';

        note.textContent =
          day.note;

        details.append(
          note
        );
      }

      $('days').append(
        details
      );
    }
  );

  buildDayNavigation(
    result.days
  );

  if ($('budgetGuidance')) {
    $('budgetGuidance')
      .textContent =
        result.budgetGuidance ||
        'The stated budget is a planning target. Final costs depend on availability and confirmed selections.';
  }

  renderList(
    'recommendedServices',
    result.recommendedServices,
    'Discuss flights, hotels and transfers with your travel expert.'
  );

  renderList(
    'importantNotes',
    result.importantNotes,
    'All arrangements require expert verification before booking.'
  );

  if ($('preferences')) {
    $('preferences')
      .textContent =
        `Interests: ${
          trip.interests.join(
            ', '
          ) ||
          'Open to suggestions'
        }. Services: ${
          trip.services.join(
            ', '
          ) ||
          'None selected'
        }.` +
        (
          trip.comments
            ? ` Additional requirements: ${trip.comments}`
            : ''
        );
  }

  stopLoading();

  $('results').hidden =
    false;

  sessionMetrics.completedAt =
    new Date().toISOString();

  sessionMetrics.completionTimeMs =
    sessionMetrics
      .firstInteractionAt
      ? Date.now() -
        Date.parse(
          sessionMetrics
            .firstInteractionAt
        )
      : null;

  sessionMetrics.resultSource =
    source;

  sessionMetrics.requestId =
    result.requestId ||
    null;

  sessionMetrics.successful =
    true;

  renderMetrics();
  saveMetrics();

  $('results')
    .scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
}


function itineraryReference(trip) {
  const destination =
    normalize(
      trip.destination
    )
      .replace(
        /[^a-z]/g,
        ''
      )
      .slice(0, 3)
      .toUpperCase() ||
    'TRP';

  const date =
    trip.start
      .replaceAll(
        '-',
        ''
      )
      .slice(2);

  const request =
    generatedTrip
      ?.result
      ?.requestId
      ?.slice(0, 4)
      .toUpperCase() ||
    'PLAN';

  return (
    `TW-${destination}-` +
    `${date}-${request}`
  );
}

function itineraryAsText() {
  if (!generatedTrip) {
    return '';
  }

  const {
    result,
    ...trip
  } = generatedTrip;

  const lines = [
    'TRACKWORLD PRELIMINARY ITINERARY',
    itineraryReference(
      trip
    ),
    '',
    result.tripTitle,
    result.summary,
    '',
    `Route: ${trip.origin} to ${trip.destination}`,
    `Dates: ${trip.start} to ${trip.end}`,
    `Pace: ${trip.pace}`,
    ''
  ];

  result.days.forEach(
    (
      day,
      dayIndex
    ) => {
      lines.push(
        `DAY ${dayIndex + 1} — ${formatDayHeading(
          addDays(
            trip.start,
            dayIndex
          )
        )}`
      );

      lines.push(
        day.title
      );

      lines.push(
        `Area: ${
          day.area ||
          trip.destination
        }`
      );

      (
        day.items || []
      ).forEach(
        (
          rawItem,
          itemIndex
        ) => {
          const item =
            normalizeActivity(
              rawItem,
              itemIndex
            );

          lines.push(
            `${item.time} — ${item.title}`
          );

          lines.push(
            item.description
          );
        }
      );

      if (day.note) {
        lines.push(
          `Note: ${day.note}`
        );
      }

      lines.push('');
    }
  );

  lines.push(
    'Preliminary planning only. All arrangements require TrackWorld Vacations expert verification.'
  );

  return lines.join(
    '\n'
  );
}

function downloadText(
  filename,
  content
) {
  const url =
    URL.createObjectURL(
      new Blob(
        [content],
        {
          type:
            'text/plain;charset=utf-8'
        }
      )
    );

  const link =
    document.createElement(
      'a'
    );

  link.href = url;
  link.download = filename;

  document.body.append(
    link
  );

  link.click();
  link.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );
}

async function copyItinerarySummary() {
  if (!generatedTrip) {
    return;
  }

  const text =
    itineraryAsText();

  try {
    await navigator
      .clipboard
      .writeText(text);

    if ($('copyStatus')) {
      $('copyStatus')
        .textContent =
          'Itinerary summary copied.';
    }
  } catch {
    if ($('copyStatus')) {
      $('copyStatus')
        .textContent =
          'Copy unavailable. Use Download itinerary instead.';
    }
  }
}

function prepareAppointmentDialog() {
  const trip =
    generatedTrip ||
    getTrip();

  if ($('appointmentStatus')) {
    $('appointmentStatus')
      .textContent =
        '';
  }

  if ($('downloadRequest')) {
    $('downloadRequest').hidden =
      true;
  }

  if ($('appointmentTripSummary')) {
    $('appointmentTripSummary')
      .textContent =
        `${trip.origin || 'Departure city'} to ${
          trip.destination ||
          'destination'
        }`;
  }

  if ($('appointmentReference')) {
    $('appointmentReference')
      .textContent =
        generatedTrip
          ? itineraryReference(
              trip
            )
          : 'Itinerary will be attached after generation';
  }

  $('appointmentDialog')
    .showModal();
}

function buildAppointmentRequest() {
  const trip =
    generatedTrip ||
    getTrip();

  const travellers =
    trip.adults +
    trip.children;

  const totalBudget =
    trip.budgetType ===
      'person'
      ? trip.budget *
        travellers
      : trip.budget;


  const lines = [
    'TRACKWORLD CONSULTATION REQUEST — NOT SENT',
    '',
    `Plan reference: ${
      generatedTrip
        ? itineraryReference(
            trip
          )
        : 'No generated plan'
    }`,
    `Name: ${
      $('customerName')
        .value
        .trim()
    }`,
    `Email: ${
      $('email')
        .value
        .trim()
    }`,
    `Phone: ${
      $('phone')
        ?.value
        .trim() ||
      'Not provided'
    }`,
    `Preferred date: ${
      $('preferredDate')
        .value
    }`,
    `Preferred time: ${
      $('preferredTime')
        ?.value ||
      'No preference'
    }`,
    '',
    `Trip type: ${trip.type}`,
    `Route: ${trip.origin} to ${trip.destination}`,
    `Dates: ${trip.start} to ${trip.end}`,
    `Travellers: ${trip.adults} adults, ${trip.children} children`,
    `Occasion: ${trip.occasion}`,
    `Stay: ${trip.hotel}`,
    `Pace: ${trip.pace}`,
    `Budget target: ${formatCurrency(totalBudget)}`,
    `Interests: ${trip.interests.join(', ') || 'Open'}`,
    `Services: ${trip.services.join(', ') || 'None'}`,
    `Requirements: ${trip.comments || 'None'}`,
    ''
  ];

  if (generatedTrip) {
    lines.push(
      '',
      'PRELIMINARY ITINERARY',
      '',
      itineraryAsText()
    );
  }

  lines.push(
    '',
    'Nothing has been sent, booked or reserved.'
  );

  return lines.join(
    '\n'
  );
}

function resetResults() {
  $('results').hidden =
    true;

  generatedTrip = null;



  dayObserver?.disconnect();

  updateChoiceSummary();

  if ($('cacheStatus')) {
    $('cacheStatus').hidden =
      true;
  }

  if ($('copyStatus')) {
    $('copyStatus')
      .textContent =
        '';
  }
}

createChips(
  'interests',
  interests,
  [
    'Culture & history',
    'Food & flavours'
  ]
);

createChips(
  'services',
  services,
  [
    'Flights',
    'Hotels'
  ]
);

const today =
  new Date();

const defaultStart =
  new Date();

defaultStart.setDate(
  defaultStart.getDate() + 30
);

const defaultEnd =
  new Date(defaultStart);

defaultEnd.setDate(
  defaultEnd.getDate() + 5
);

const defaultDates = {
  start:
    localDate(
      defaultStart
    ),

  end:
    localDate(
      defaultEnd
    )
};

$('start').min =
  localDate(today);

$('start').value =
  defaultDates.start;

$('end').min =
  defaultDates.start;

$('end').value =
  defaultDates.end;

$('preferredDate').min =
  localDate(today);

attachSuggestions(
  'origin'
);

attachSuggestions(
  'destination'
);

document
  .querySelectorAll(
    '[data-type]'
  )
  .forEach(button => {
    button.addEventListener(
      'click',
      () => {
        noteInteraction(
          'tripType'
        );

        setTripType(
          button.dataset.type
        );
      }
    );
  });

document
  .querySelectorAll(
    '[data-counter]'
  )
  .forEach(button => {
    button.addEventListener(
      'click',
      () => {
        const input =
          $(
            button.dataset
              .counter
          );

        const delta =
          Number(
            button.dataset
              .delta
          );

        const minimum =
          Number(
            input.min
          );

        const maximum =
          Number(
            input.max
          );

        const current =
          Number(
            input.value
          ) ||
          minimum;

        input.value =
          Math.max(
            minimum,
            Math.min(
              maximum,
              current + delta
            )
          );

        input.dispatchEvent(
          new Event(
            'input',
            {
              bubbles: true
            }
          )
        );

        noteInteraction(
          button.dataset
            .counter
        );
      }
    );
  });

form.addEventListener(
  'input',
  event => {
    updateSummary();

    if (
      event.target.name ||
      event.target.id
    ) {
      const name =
        event.target.name ||
        event.target.id;

      if (
        !touchedFields.has(
          name
        )
      ) {
        noteInteraction(
          name
        );
      }
    }
  }
);

form.addEventListener(
  'change',
  event => {
    updateSummary();

    const name =
      event.target.name ||
      event.target.id;

    if (name) {
      noteInteraction(
        name
      );
    }
  }
);

$('start').addEventListener(
  'change',
  () => {
    $('end').min =
      $('start').value;

    if (
      $('end').value <
      $('start').value
    ) {
      $('end').value =
        $('start').value;
    }

    updateSummary();
  }
);

form.addEventListener(
  'submit',
  async event => {
    event.preventDefault();
    showError('');

    const trip =
      getTrip();

    try {
      validateTrip(
        trip
      );
    } catch (error) {
      showError(
        error.message
      );

      return;
    }

    if (
      !form.reportValidity()
    ) {
      return;
    }

    const button =
      $('generate');

    const originalContent =
      button.innerHTML;

    const generationStarted =
      performance.now();

    sessionMetrics.submittedAt =
      new Date().toISOString();

    button.disabled = true;

    button.textContent =
      'Creating your itinerary…';

    try {
      $('results').hidden =
        false;

      startLoading();

      if (
        serverStatus.mode ===
        'gemini'
      ) {
        const cached =
          readCache(trip);

        if (cached) {
          sessionMetrics
            .generationTimeMs =
              Math.round(
                performance.now() -
                generationStarted
              );

          renderItinerary(
            trip,
            cached.result,
            {
              browserCached:
                true,

              legacyCached:
                cached.legacy
            }
          );

          return;
        }
      }

      const response =
        await fetch(
          '/api/generate-itinerary',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json'
            },

            body:
              JSON.stringify(
                trip
              )
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          'The itinerary could not be generated.'
        );
      }

      sessionMetrics
        .generationTimeMs =
          Math.round(
            performance.now() -
            generationStarted
          );

      saveCache(
        trip,
        result
      );

      renderItinerary(
        trip,
        result
      );

      if (
        result.mode ===
          'gemini' &&
        Number.isFinite(
          result
            .geminiRequestsRemaining
        )
      ) {
        setSystemStatus(
          'gemini',
          `Gemini ready · ${result.geminiRequestsRemaining} API runs remaining`
        );
      }
    } catch (error) {
      stopLoading();

      $('results').hidden =
        true;

      sessionMetrics.successful =
        false;

      saveMetrics();

      showError(
        error.message ||
        'The itinerary could not be generated.'
      );
    } finally {
      button.disabled =
        false;

      button.innerHTML =
        originalContent;
    }
  }
);

$('itineraryLink')
  .addEventListener(
    'click',
    event => {
      if (
        $('results').hidden
      ) {
        event.preventDefault();

        showError(
          'Complete the form and create your itinerary first.'
        );

        $('generate').focus();
      }
    }
  );

$('print')
  .addEventListener(
    'click',
    () => {
      document
        .querySelectorAll(
          '.day'
        )
        .forEach(day => {
          day.open = true;
        });

      window.print();
    }
  );

$('expandAll')
  ?.addEventListener(
    'click',
    () => {
      document
        .querySelectorAll(
          '.day'
        )
        .forEach(day => {
          day.open = true;
        });

      noteInteraction(
        'expand-all'
      );
    }
  );

$('collapseAll')
  ?.addEventListener(
    'click',
    () => {
      document
        .querySelectorAll(
          '.day'
        )
        .forEach(day => {
          day.open = false;
        });

      noteInteraction(
        'collapse-all'
      );
    }
  );

$('planAnother')
  ?.addEventListener(
    'click',
    () => {
      $('planner')
        .scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

      setTimeout(
        () => {
          $('destination')
            .focus();
        },
        500
      );
    }
  );

$('downloadItinerary')
  ?.addEventListener(
    'click',
    () => {
      if (
        generatedTrip
      ) {
        downloadText(
          `${itineraryReference(
            generatedTrip
          )}.txt`,

          itineraryAsText()
        );
      }
    }
  );

$('copyItinerary')
  ?.addEventListener(
    'click',
    copyItinerarySummary
  );

document
  .querySelectorAll(
    '.appointment'
  )
  .forEach(button => {
    button.addEventListener(
      'click',
      prepareAppointmentDialog
    );
  });

$('closeDialog')
  .addEventListener(
    'click',
    () => {
      $('appointmentDialog')
        .close();
    }
  );

$('appointmentDialog')
  .addEventListener(
    'click',
    event => {
      if (
        event.target ===
        $('appointmentDialog')
      ) {
        $('appointmentDialog')
          .close();
      }
    }
  );

$('appointmentForm')
  .addEventListener(
    'submit',
    event => {
      event.preventDefault();

      if (
        !$('appointmentForm')
          .reportValidity()
      ) {
        return;
      }

      appointmentRequest =
        buildAppointmentRequest();

      $('appointmentStatus')
        .textContent =
          'Your request is ready to download. Nothing has been sent or reserved.';

      $('downloadRequest').hidden =
        false;
    }
  );

$('downloadRequest')
  .addEventListener(
    'click',
    () => {
      if (
        appointmentRequest
      ) {
        downloadText(
          'TrackWorld-Vacations-consultation-request.txt',
          appointmentRequest
        );
      }
    }
  );

document
  .querySelectorAll(
    '[data-rating]'
  )
  .forEach(button => {
    button.addEventListener(
      'click',
      () => {
        sessionMetrics
          .satisfaction =
            Number(
              button.dataset
                .rating
            );

        document
          .querySelectorAll(
            '[data-rating]'
          )
          .forEach(
            ratingButton => {
              const active =
                ratingButton ===
                button;

              ratingButton
                .classList
                .toggle(
                  'active',
                  active
                );

              ratingButton
                .setAttribute(
                  'aria-pressed',
                  String(active)
                );
            }
          );

        if ($('ratingStatus')) {
          $('ratingStatus')
            .textContent =
              `Thank you · ${sessionMetrics.satisfaction}/5 recorded locally.`;
        }

        noteInteraction(
          'satisfaction'
        );

        saveMetrics();
      }
    );
  });

$('downloadMetrics')
  ?.addEventListener(
    'click',
    () => {
      let records = [];

      try {
        records =
          JSON.parse(
            localStorage.getItem(
              METRICS_KEY
            ) || '[]'
          );
      } catch {
        records = [
          {
            ...sessionMetrics
          }
        ];
      }

      downloadText(
        'TrackWorld-Vacations-dashboard-efficiency-data.json',

        JSON.stringify(
          records,
          null,
          2
        )
      );
    }
  );

form.addEventListener(
  'reset',
  () => {
    setTimeout(
      () => {
        tripType =
          'International';

        document
          .querySelectorAll(
            '[data-type]'
          )
          .forEach(button => {
            const selected =
              button.dataset
                .type ===
              'International';

            button
              .classList
              .toggle(
                'selected',
                selected
              );

            button
              .setAttribute(
                'aria-pressed',
                String(selected)
              );
          });

        $('start').value =
          defaultDates.start;

        $('end').value =
          defaultDates.end;

        $('end').min =
          defaultDates.start;

        clearSelectedPlace(
          'origin'
        );

        clearSelectedPlace(
          'destination'
        );

        clearDomesticValidity();
        showError('');
        resetResults();
        updateSummary();
      },
      0
    );
  }
);

function initialiseImage() {
  if (
    !$('travelImage')
  ) {
    return;
  }

  $('travelImage').src =
    '/assets/travel.jpg';

  $('travelImage').hidden =
    false;

  $('travelImage')
    .addEventListener(
      'error',
      () => {
        $('travelImage')
          .hidden =
            true;
      }
    );

  if ($('photoCredit')) {
    $('photoCredit').hidden =
      true;
  }
}

initialiseImage();
updateSummary();
loadStatus();