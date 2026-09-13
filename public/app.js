const $ = id => document.getElementById(id);
const form = $('tripForm');

const CACHE_PREFIX = 'trackworld-itinerary-v3:';
const CACHE_TTL = 24 * 60 * 60 * 1000;

let tripType = 'International';
let generatedTrip = null;
let appointmentRequest = '';
let serverStatus = { mode: 'mock' };

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

const places = [
  ['New Delhi', 'India', 'Delhi DEL'],
  ['Mumbai', 'India', 'Bombay BOM'],
  ['Bengaluru', 'India', 'Bangalore BLR'],
  ['Chennai', 'India', 'Madras MAA'],
  ['Kolkata', 'India', 'Calcutta CCU'],
  ['Hyderabad', 'India', 'HYD'],
  ['Ahmedabad', 'India', 'AMD'],
  ['Pune', 'India', 'PNQ'],
  ['Goa', 'India', 'GOI GOX'],
  ['Jaipur', 'India', 'JAI'],
  ['Udaipur', 'India', 'UDR'],
  ['Kochi', 'India', 'Cochin Kerala COK'],
  ['Thiruvananthapuram', 'India', 'Trivandrum Kerala TRV'],
  ['Manali', 'India', 'Himachal Pradesh'],
  ['Shimla', 'India', 'Himachal Pradesh'],
  ['Srinagar', 'India', 'Kashmir SXR'],
  ['Leh', 'India', 'Ladakh IXL'],
  ['Rishikesh', 'India', 'Uttarakhand'],
  ['Varanasi', 'India', 'Banaras VNS'],
  ['Amritsar', 'India', 'Punjab ATQ'],
  ['Chandigarh', 'India', 'IXC'],
  ['Lucknow', 'India', 'LKO'],
  ['Indore', 'India', 'IDR'],
  ['Bhopal', 'India', 'BHO'],
  ['Agra', 'India', 'Taj Mahal'],
  ['Darjeeling', 'India', 'West Bengal'],
  ['Gangtok', 'India', 'Sikkim'],
  ['Shillong', 'India', 'Meghalaya'],
  ['Guwahati', 'India', 'Assam GAU'],
  ['Port Blair', 'India', 'Andaman Islands IXZ'],
  ['Kerala', 'India', 'Munnar Alleppey'],

  ['Dubai', 'United Arab Emirates', 'UAE DXB'],
  ['Abu Dhabi', 'United Arab Emirates', 'UAE AUH'],
  ['Bali', 'Indonesia', 'Denpasar DPS'],
  ['Singapore', 'Singapore', 'SIN'],
  ['Bangkok', 'Thailand', 'BKK'],
  ['Phuket', 'Thailand', 'HKT'],
  ['Krabi', 'Thailand', 'KBV'],
  ['Maldives', 'Maldives', 'Malé MLE'],
  ['Paris', 'France', 'CDG'],
  ['London', 'United Kingdom', 'England LHR'],
  ['Rome', 'Italy', 'FCO'],
  ['Venice', 'Italy', 'VCE'],
  ['Milan', 'Italy', 'MXP'],
  ['Zurich', 'Switzerland', 'ZRH'],
  ['Interlaken', 'Switzerland', 'Swiss Alps'],
  ['Lucerne', 'Switzerland', 'Luzern'],
  ['Amsterdam', 'Netherlands', 'AMS'],
  ['Barcelona', 'Spain', 'BCN'],
  ['Madrid', 'Spain', 'MAD'],
  ['Lisbon', 'Portugal', 'LIS'],
  ['Athens', 'Greece', 'ATH'],
  ['Santorini', 'Greece', 'JTR'],
  ['Istanbul', 'Türkiye', 'Turkey IST'],
  ['Tokyo', 'Japan', 'NRT HND'],
  ['Kyoto', 'Japan', 'Osaka'],
  ['Seoul', 'South Korea', 'ICN'],
  ['Hong Kong', 'Hong Kong', 'HKG'],
  ['Kuala Lumpur', 'Malaysia', 'KUL'],
  ['Hanoi', 'Vietnam', 'HAN'],
  ['Ho Chi Minh City', 'Vietnam', 'Saigon SGN'],
  ['Da Nang', 'Vietnam', 'DAD'],
  ['Colombo', 'Sri Lanka', 'CMB'],
  ['Kathmandu', 'Nepal', 'KTM'],
  ['Paro', 'Bhutan', 'PBH'],
  ['Sydney', 'Australia', 'SYD'],
  ['Melbourne', 'Australia', 'MEL'],
  ['Auckland', 'New Zealand', 'AKL'],
  ['New York', 'United States', 'NYC JFK'],
  ['Los Angeles', 'United States', 'LAX'],
  ['Toronto', 'Canada', 'YYZ'],
  ['Vancouver', 'Canada', 'YVR'],
  ['Cape Town', 'South Africa', 'CPT'],
  ['Nairobi', 'Kenya', 'NBO'],
  ['Mauritius', 'Mauritius', 'MRU'],
  ['Seychelles', 'Seychelles', 'SEZ'],
  ['Cairo', 'Egypt', 'CAI'],
  ['Doha', 'Qatar', 'DOH'],
  ['Muscat', 'Oman', 'MCT'],
  ['Baku', 'Azerbaijan', 'GYD'],
  ['Tbilisi', 'Georgia', 'TBS']
];

function createChips(id, values, selectedValues) {
  const container = $(id);
  container.replaceChildren();

  values.forEach(value => {
    const label = document.createElement('label');
    label.className = 'chip';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = id;
    input.value = value;
    input.checked = selectedValues.includes(value);

    const text = document.createElement('span');
    text.textContent = value;

    label.append(input, text);
    container.append(label);
  });
}

createChips(
  'interests',
  interests,
  ['Culture & history', 'Food & flavours']
);

createChips(
  'services',
  services,
  ['Flights', 'Hotels']
);

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

const today = new Date();
const defaultStart = new Date();
defaultStart.setDate(defaultStart.getDate() + 30);

const defaultEnd = new Date(defaultStart);
defaultEnd.setDate(defaultEnd.getDate() + 5);

const defaultDates = {
  start: localDate(defaultStart),
  end: localDate(defaultEnd)
};

$('start').min = localDate(today);
$('start').value = defaultDates.start;
$('end').min = defaultDates.start;
$('end').value = defaultDates.end;
$('preferredDate').min = localDate(today);

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isIndianPlace(value) {
  const requestedPlace = normalize(value);

  return places.some(place => {
    return (
      place[1] === 'India' &&
      normalize(place[0]) === requestedPlace
    );
  });
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
    origin: $('origin').value.trim(),
    destination: $('destination').value.trim(),
    start: $('start').value,
    end: $('end').value,
    adults: Number($('adults').value),
    children: Number($('children').value),
    budget: Number($('budget').value),
    budgetType: $('budgetType').value,
    occasion: $('occasion').value,
    hotel: $('hotel').value,
    pace: $('pace').value,
    interests: getChecked('interests'),
    services: getChecked('services'),
    comments: $('comments').value.trim()
  };
}

function tripDays(trip) {
  const start = parseDate(trip.start);
  const end = parseDate(trip.end);

  if (!start || !end) return 0;

  return Math.round((end - start) / 86400000) + 1;
}

function formatCurrency(value) {
  const amount = Number.isFinite(Number(value))
    ? Math.round(Number(value))
    : 0;

  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatDate(value, includeYear = false) {
  const date = parseDate(value);
  if (!date) return '';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {})
  });
}

function showError(message) {
  $('error').textContent = message;
}

function clearDomesticValidity() {
  $('origin').setCustomValidity('');
  $('destination').setCustomValidity('');
}

function validateDomesticField(id, displayMessage = false) {
  const input = $(id);

  if (tripType !== 'Domestic' || !input.value.trim()) {
    input.setCustomValidity('');
    return true;
  }

  if (isIndianPlace(input.value)) {
    input.setCustomValidity('');

    if ($('error').dataset.locationError === 'true') {
      showError('');
      delete $('error').dataset.locationError;
    }

    return true;
  }

  const fieldName =
    id === 'origin' ? 'departure city' : 'destination';

  input.setCustomValidity(
    `Select an Indian ${fieldName} from the dropdown or switch to International.`
  );

  if (displayMessage) {
    showError(
      `${input.value.trim()} cannot be used in Domestic mode. Select an Indian ${fieldName} from the dropdown, or switch to International.`
    );

    $('error').dataset.locationError = 'true';
  }

  return false;
}

function validateTrip(trip) {
  const days = tripDays(trip);

  if (!trip.origin || !trip.destination) {
    throw new Error(
      'Please enter both your departure city and destination.'
    );
  }

  if (
    trip.type === 'Domestic' &&
    (!isIndianPlace(trip.origin) ||
      !isIndianPlace(trip.destination))
  ) {
    throw new Error(
      'Domestic trips require Indian locations in both boxes. Select them from the dropdown or switch to International.'
    );
  }

  if (!trip.start || !trip.end) {
    throw new Error('Please select your travel dates.');
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

  if (!Number.isInteger(trip.adults) || trip.adults < 1) {
    throw new Error('At least one adult is required.');
  }

  if (!Number.isInteger(trip.children) || trip.children < 0) {
    throw new Error('Enter a valid number of children.');
  }

  if (!Number.isFinite(trip.budget) || trip.budget < 1000) {
    throw new Error('Enter a budget of at least ₹1,000.');
  }
}

function updateSummary() {
  const trip = getTrip();
  const travellers = Math.max(
    0,
    trip.adults + trip.children
  );

  const totalBudget =
    trip.budgetType === 'person'
      ? trip.budget * travellers
      : trip.budget;

  const days = tripDays(trip);

  $('sumDestination').textContent =
    trip.destination || 'Choose a destination';

  $('sumOrigin').textContent =
    trip.origin || 'Choose a city';

  $('sumDates').textContent =
    trip.start && trip.end
      ? `${formatDate(trip.start)} – ${formatDate(
          trip.end,
          true
        )}`
      : 'Choose dates';

  $('sumTravellers').textContent =
    `${trip.adults || 0} adult${
      trip.adults === 1 ? '' : 's'
    }` +
    (trip.children
      ? ` · ${trip.children} ${
          trip.children === 1 ? 'child' : 'children'
        }`
      : '');

  $('sumStyle').textContent =
    `${trip.occasion} · ${trip.pace}`;

  $('sumNights').textContent =
    days > 0
      ? `${Math.max(0, days - 1)} night${
          days - 1 === 1 ? '' : 's'
        }`
      : '';

  $('sumBudget').textContent = formatCurrency(totalBudget);

  $('sumPerPerson').textContent =
    travellers > 0
      ? `${formatCurrency(
          totalBudget / travellers
        )} per traveller · budget target, not a quote`
      : 'Budget target, not a quote';

  $('end').min = trip.start || localDate(today);

  if ($('commentCount')) {
    $('commentCount').textContent =
      `${$('comments').value.length} / 2000`;
  }
}

function setTripType(type) {
  tripType = type;

  document.querySelectorAll('[data-type]').forEach(button => {
    const selected = button.dataset.type === type;

    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  clearDomesticValidity();
  showError('');

  if (type === 'Domestic') {
    if (!isIndianPlace($('origin').value)) {
      $('origin').value = 'New Delhi';
    }

    if (!isIndianPlace($('destination').value)) {
      $('destination').value = 'Goa';
    }
  } else if (
    !$('destination').value.trim() ||
    isIndianPlace($('destination').value)
  ) {
    $('destination').value = 'Dubai';
  }

  updateSummary();
}

document.querySelectorAll('[data-type]').forEach(button => {
  button.addEventListener('click', () => {
    setTripType(button.dataset.type);
  });
});

function editDistance(first, second) {
  let previous = Array.from(
    { length: second.length + 1 },
    (_, index) => index
  );

  for (
    let firstIndex = 1;
    firstIndex <= first.length;
    firstIndex++
  ) {
    const current = [firstIndex];

    for (
      let secondIndex = 1;
      secondIndex <= second.length;
      secondIndex++
    ) {
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] +
          (first[firstIndex - 1] ===
          second[secondIndex - 1]
            ? 0
            : 1)
      );
    }

    previous = current;
  }

  return previous[second.length];
}

function findPlaces(query) {
  const search = normalize(query);

  return places
    .filter(place => {
      return tripType !== 'Domestic' || place[1] === 'India';
    })
    .map(place => {
      const name = normalize(place[0]);
      const fullText = normalize(place.join(' '));
      let score = 100;

      if (!search) {
        score = 10;
      } else if (name === search) {
        score = 0;
      } else if (name.startsWith(search)) {
        score = 1;
      } else if (
        fullText
          .split(/\s+/)
          .some(word => word.startsWith(search))
      ) {
        score = 2;
      } else if (fullText.includes(search)) {
        score = 3;
      } else if (search.length >= 3) {
        const distance = Math.min(
          editDistance(search, name),
          ...name
            .split(/\s+/)
            .map(word => editDistance(search, word))
        );

        if (
          distance <=
          Math.max(1, Math.floor(search.length / 3))
        ) {
          score = 4 + distance;
        }
      }

      return { place, score };
    })
    .filter(result => result.score < 100)
    .sort(
      (first, second) =>
        first.score - second.score ||
        first.place[0].localeCompare(second.place[0])
    )
    .slice(0, 7)
    .map(result => result.place);
}

function attachSuggestions(id) {
  const input = $(id);
  const wrapper = input.parentElement;

  wrapper.classList.add('place-field');
  input.removeAttribute('list');
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  const optionsBox = document.createElement('div');
  optionsBox.id = `${id}-suggestions`;
  optionsBox.className = 'place-options';
  optionsBox.setAttribute('role', 'listbox');
  optionsBox.hidden = true;

  wrapper.append(optionsBox);
  input.setAttribute('aria-controls', optionsBox.id);

  let matches = [];
  let activeIndex = -1;

  function close() {
    optionsBox.hidden = true;
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function select(index) {
    if (!matches[index]) return;

    input.value = matches[index][0];
    input.setCustomValidity('');
    showError('');

    input.dispatchEvent(
      new Event('input', { bubbles: true })
    );

    close();
    input.focus();
  }

  function updateActive() {
    const options =
      optionsBox.querySelectorAll('[role="option"]');

    options.forEach((option, index) => {
      const active = index === activeIndex;
      option.setAttribute('aria-selected', String(active));

      if (active) {
        input.setAttribute(
          'aria-activedescendant',
          option.id
        );

        option.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function show() {
    matches = findPlaces(input.value);
    activeIndex = -1;
    optionsBox.replaceChildren();

    matches.forEach((place, index) => {
      const option = document.createElement('div');
      option.id = `${optionsBox.id}-${index}`;
      option.className = 'place-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');

      const name = document.createElement('strong');
      name.textContent = place[0];

      const country = document.createElement('small');
      country.textContent = place[1];

      option.append(name, country);

      option.addEventListener('pointerdown', event => {
        event.preventDefault();
      });

      option.addEventListener('click', () => {
        select(index);
      });

      optionsBox.append(option);
    });

    const hint = document.createElement('div');
    hint.className = 'place-hint';

    if (tripType === 'Domestic') {
      hint.textContent = matches.length
        ? 'Indian locations only · select a suggestion'
        : 'Not an Indian location. Switch to International to search outside India.';
    } else {
      hint.textContent = matches.length
        ? 'Suggested places · you may also enter another location'
        : 'No close match · you may keep your custom location';
    }

    optionsBox.append(hint);
    optionsBox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('focus', show);

  input.addEventListener('input', () => {
    if (tripType === 'Domestic') {
      validateDomesticField(id, false);
    } else {
      input.setCustomValidity('');
    }

    show();
  });

  input.addEventListener('change', () => {
    validateDomesticField(id, true);
  });

  input.addEventListener('blur', () => {
    validateDomesticField(id, true);
    close();
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      close();
      return;
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp'
    ) {
      event.preventDefault();

      if (optionsBox.hidden) show();
      if (!matches.length) return;

      const direction =
        event.key === 'ArrowDown' ? 1 : -1;

      activeIndex =
        (activeIndex + direction + matches.length) %
        matches.length;

      updateActive();
      return;
    }

    if (
      event.key === 'Enter' &&
      !optionsBox.hidden &&
      activeIndex >= 0
    ) {
      event.preventDefault();
      select(activeIndex);
    }
  });

  document.querySelectorAll('[data-type]').forEach(button => {
    button.addEventListener('click', close);
  });
}

attachSuggestions('origin');
attachSuggestions('destination');

document.querySelectorAll('[data-counter]').forEach(button => {
  button.addEventListener('click', () => {
    const input = $(button.dataset.counter);
    const delta = Number(button.dataset.delta);
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    const current = Number(input.value) || minimum;

    input.value = Math.max(
      minimum,
      Math.min(maximum, current + delta)
    );

    input.dispatchEvent(
      new Event('input', { bubbles: true })
    );
  });
});

form.addEventListener('input', updateSummary);
form.addEventListener('change', updateSummary);

$('start').addEventListener('change', () => {
  $('end').min = $('start').value;

  if ($('end').value < $('start').value) {
    $('end').value = $('start').value;
  }

  updateSummary();
});

function setSystemStatus(type, message) {
  if (!$('systemStatus') || !$('systemStatusText')) return;

  $('systemStatus').classList.remove(
    'mock',
    'gemini',
    'error'
  );

  $('systemStatus').classList.add(type);
  $('systemStatusText').textContent = message;
}

async function loadStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error();

    serverStatus = await response.json();

    if (serverStatus.mode === 'gemini') {
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

function cacheKey(trip) {
  const data = JSON.stringify({
    model: serverStatus.geminiModel || 'default',
    schemaVersion: 3,
    trip: {
      ...trip,
      interests: [...trip.interests].sort(),
      services: [...trip.services].sort()
    }
  });

  let hash = 2166136261;

  for (let index = 0; index < data.length; index++) {
    hash ^= data.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${CACHE_PREFIX}${(hash >>> 0).toString(36)}`;
}

function readCache(trip) {
  try {
    const raw = localStorage.getItem(cacheKey(trip));
    if (!raw) return null;

    const cached = JSON.parse(raw);

    if (
      Date.now() - cached.savedAt > CACHE_TTL ||
      !cached.result?.days?.length
    ) {
      localStorage.removeItem(cacheKey(trip));
      return null;
    }

    return cached.result;
  } catch {
    return null;
  }
}

function saveCache(trip, result) {
  if (result.mode !== 'gemini') return;

  try {
    localStorage.setItem(
      cacheKey(trip),
      JSON.stringify({
        savedAt: Date.now(),
        result
      })
    );
  } catch {
    // Browser storage may be unavailable.
  }
}

function renderList(id, values, fallback) {
  const container = $(id);
  if (!container) return;

  container.replaceChildren();

  const items =
    Array.isArray(values) && values.length
      ? values
      : [fallback];

  items.forEach(value => {
    const item = document.createElement('li');
    item.textContent = value;
    container.append(item);
  });
}

function setLoading(loading) {
  if ($('resultsLoading')) {
    $('resultsLoading').hidden = !loading;
  }

  if ($('resultContent')) {
    $('resultContent').hidden = loading;
  }
}

function renderItinerary(
  trip,
  result,
  browserCached = false
) {
  if (
    !Array.isArray(result.days) ||
    !result.days.length
  ) {
    throw new Error(
      'The itinerary response did not contain any days.'
    );
  }

  generatedTrip = {
    ...trip,
    result
  };

  $('resultTitle').textContent =
    result.tripTitle ||
    `${result.days.length} days in ${trip.destination}`;

  $('resultSummary').textContent =
    result.summary ||
    `${trip.occasion} with a ${trip.pace.toLowerCase()} pace.`;

  if ($('resultSource')) {
    $('resultSource').textContent =
      result.mode === 'gemini'
        ? 'Gemini AI itinerary'
        : 'Mock itinerary';
  }

  if ($('cacheStatus')) {
    if (browserCached) {
      $('cacheStatus').textContent =
        'Browser cache · no API run used';

      $('cacheStatus').hidden = false;
    } else if (result.cached) {
      $('cacheStatus').textContent =
        'Server cache · no new API run used';

      $('cacheStatus').hidden = false;
    } else {
      $('cacheStatus').hidden = true;
    }
  }

  if ($('resultNotice')) {
    $('resultNotice').textContent =
      result.mode === 'gemini'
        ? 'AI-generated preliminary itinerary. Prices, availability, routes, opening hours and visa requirements require expert verification.'
        : 'Mock itinerary generated locally. No Gemini API request was used.';
  }

  const totalBudget =
    trip.budgetType === 'person'
      ? trip.budget *
        (trip.adults + trip.children)
      : trip.budget;

  if ($('overviewRoute')) {
    $('overviewRoute').textContent =
      `${trip.origin} → ${trip.destination}`;
  }

  if ($('overviewDuration')) {
    const numberOfDays = result.days.length;
    const numberOfNights =
      Math.max(0, numberOfDays - 1);

    $('overviewDuration').textContent =
      `${numberOfDays} day${
        numberOfDays === 1 ? '' : 's'
      } · ${numberOfNights} night${
        numberOfNights === 1 ? '' : 's'
      }`;
  }

  if ($('overviewTravellers')) {
    const travellerCount =
      trip.adults + trip.children;

    $('overviewTravellers').textContent =
      `${travellerCount} traveller${
        travellerCount === 1 ? '' : 's'
      }`;
  }

  if ($('overviewBudget')) {
    $('overviewBudget').textContent =
      formatCurrency(totalBudget);
  }

  if ($('overviewPace')) {
    $('overviewPace').textContent =
      `${trip.pace} · ${trip.hotel}`;
  }

  $('days').replaceChildren();

  const legacyTimes = [
    '9:00 AM',
    '1:30 PM',
    '6:30 PM'
  ];

  const legacyTitles = [
    'Morning experience',
    'Afternoon experience',
    'Evening experience'
  ];

  result.days.forEach((day, dayIndex) => {
    const details =
      document.createElement('details');

    details.className = 'day';
    details.open = dayIndex < 2;

    details.style.setProperty(
      '--day-number',
      `"${String(dayIndex + 1).padStart(2, '0')}"`
    );

    const heading =
      document.createElement('summary');

    const dayNumber =
      document.createElement('span');

    dayNumber.className = 'day-label';

    dayNumber.textContent =
      `DAY ${String(dayIndex + 1).padStart(2, '0')}`;

    const dayTitle =
      document.createElement('strong');

    dayTitle.className = 'day-title';

    dayTitle.textContent =
      day.title ||
      `Day ${dayIndex + 1}`;

    heading.append(
      dayNumber,
      dayTitle
    );

    const schedule =
      document.createElement('div');

    schedule.className =
      'schedule timed-schedule';

    const items =
      Array.isArray(day.items)
        ? day.items
        : [];

    items.forEach(
      (rawItem, itemIndex) => {
        const item =
          typeof rawItem === 'string'
            ? {
                time:
                  legacyTimes[itemIndex] ||
                  `${itemIndex + 1}:00 PM`,

                title:
                  legacyTitles[itemIndex] ||
                  `Activity ${itemIndex + 1}`,

                description: rawItem
              }
            : rawItem;

        const card =
          document.createElement('article');

        card.className =
          `schedule-card schedule-card-${
            itemIndex + 1
          }`;

        const time =
          document.createElement('time');

        time.className = 'activity-time';
        time.textContent =
          item.time ||
          'Time to confirm';

        const activityNumber =
          document.createElement('span');

        activityNumber.className =
          'activity-number';

        activityNumber.textContent =
          String(itemIndex + 1).padStart(
            2,
            '0'
          );

        const cardTop =
          document.createElement('div');

        cardTop.className =
          'schedule-card-top';

        cardTop.append(
          time,
          activityNumber
        );

        const activityTitle =
          document.createElement('h4');

        activityTitle.textContent =
          item.title ||
          `Activity ${itemIndex + 1}`;

        const description =
          document.createElement('p');

        description.textContent =
          item.description ||
          'To be refined with your Trackworld travel expert.';

        card.append(
          cardTop,
          activityTitle,
          description
        );

        schedule.append(card);
      }
    );

    details.append(
      heading,
      schedule
    );

    if (day.note) {
      const note =
        document.createElement('p');

      note.className = 'day-note';
      note.textContent = day.note;

      details.append(note);
    }

    $('days').append(details);
  });

  if ($('budgetGuidance')) {
    $('budgetGuidance').textContent =
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

  $('preferences').textContent =
    `Interests: ${
      trip.interests.join(', ') ||
      'Open to suggestions'
    }. Services: ${
      trip.services.join(', ') ||
      'None selected'
    }.` +
    (
      trip.comments
        ? ` Additional requirements: ${trip.comments}`
        : ''
    );

  setLoading(false);
  $('results').hidden = false;

  $('results').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  showError('');

  const trip = getTrip();

  try {
    validateTrip(trip);
  } catch (error) {
    showError(error.message);
    return;
  }

  if (!form.reportValidity()) return;

  const button = $('generate');
  const originalContent = button.innerHTML;

  button.disabled = true;
  button.textContent = 'Creating your itinerary…';

  try {
    $('results').hidden = false;
    setLoading(true);

    if (serverStatus.mode === 'gemini') {
      const cached = readCache(trip);

      if (cached) {
        renderItinerary(trip, cached, true);
        return;
      }
    }

    const response = await fetch(
      '/api/generate-itinerary',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(trip)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
        'The itinerary could not be generated.'
      );
    }

    saveCache(trip, result);
    renderItinerary(trip, result);

    if (
      result.mode === 'gemini' &&
      Number.isFinite(result.geminiRequestsRemaining)
    ) {
      setSystemStatus(
        'gemini',
        `Gemini ready · ${result.geminiRequestsRemaining} API runs remaining`
      );
    }
  } catch (error) {
    setLoading(false);
    $('results').hidden = true;

    showError(
      error.message ||
      'The itinerary could not be generated.'
    );
  } finally {
    button.disabled = false;
    button.innerHTML = originalContent;
  }
});

$('itineraryLink').addEventListener('click', event => {
  if ($('results').hidden) {
    event.preventDefault();

    showError(
      'Complete the form and create your itinerary first.'
    );

    $('generate').focus();
  }
});

$('print').addEventListener('click', () => {
  document.querySelectorAll('.day').forEach(day => {
    day.open = true;
  });

  window.print();
});

document.querySelectorAll('.appointment').forEach(button => {
  button.addEventListener('click', () => {
    const trip = generatedTrip || getTrip();

    $('appointmentStatus').textContent = '';
    $('downloadRequest').hidden = true;

    if ($('appointmentTripSummary')) {
      $('appointmentTripSummary').textContent =
        `${trip.origin || 'Departure city'} to ${
          trip.destination || 'destination'
        }`;
    }

    $('appointmentDialog').showModal();
  });
});

$('closeDialog').addEventListener('click', () => {
  $('appointmentDialog').close();
});

$('appointmentDialog').addEventListener('click', event => {
  if (event.target === $('appointmentDialog')) {
    $('appointmentDialog').close();
  }
});

$('appointmentForm').addEventListener('submit', event => {
  event.preventDefault();

  if (!$('appointmentForm').reportValidity()) return;

  const trip = generatedTrip || getTrip();
  const travellers = trip.adults + trip.children;

  const totalBudget =
    trip.budgetType === 'person'
      ? trip.budget * travellers
      : trip.budget;

  appointmentRequest =
    `TRACKWORLD CONSULTATION REQUEST — NOT SENT\n\n` +
    `Name: ${$('customerName').value.trim()}\n` +
    `Email: ${$('email').value.trim()}\n` +
    `Phone: ${$('phone')?.value.trim() || 'Not provided'}\n` +
    `Preferred date: ${$('preferredDate').value}\n` +
    `Preferred time: ${
      $('preferredTime')?.value || 'No preference'
    }\n\n` +
    `Trip type: ${trip.type}\n` +
    `Route: ${trip.origin} to ${trip.destination}\n` +
    `Dates: ${trip.start} to ${trip.end}\n` +
    `Travellers: ${trip.adults} adults, ${trip.children} children\n` +
    `Occasion: ${trip.occasion}\n` +
    `Stay: ${trip.hotel}\n` +
    `Pace: ${trip.pace}\n` +
    `Budget target: ${formatCurrency(totalBudget)}\n` +
    `Interests: ${trip.interests.join(', ') || 'Open'}\n` +
    `Services: ${trip.services.join(', ') || 'None'}\n` +
    `Requirements: ${trip.comments || 'None'}\n\n` +
    `Nothing has been sent, booked or reserved.`;

  $('appointmentStatus').textContent =
    'Your request is ready. Nothing has been sent or reserved.';

  $('downloadRequest').hidden = false;
});

$('downloadRequest').addEventListener('click', () => {
  if (!appointmentRequest) return;

  const url = URL.createObjectURL(
    new Blob([appointmentRequest], {
      type: 'text/plain;charset=utf-8'
    })
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = 'Trackworld-consultation-request.txt';

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

form.addEventListener('reset', () => {
  setTimeout(() => {
    tripType = 'International';

    document.querySelectorAll('[data-type]').forEach(button => {
      const selected =
        button.dataset.type === 'International';

      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    $('start').value = defaultDates.start;
    $('end').value = defaultDates.end;
    $('end').min = defaultDates.start;

    clearDomesticValidity();
    showError('');

    $('results').hidden = true;
    generatedTrip = null;

    if ($('cacheStatus')) {
      $('cacheStatus').hidden = true;
    }

    updateSummary();
  }, 0);
});

function initialiseImage() {
  if (!$('travelImage')) return;

  $('travelImage').src = '/assets/travel.jpg';
  $('travelImage').hidden = false;

  $('travelImage').addEventListener('error', () => {
    $('travelImage').hidden = true;
  });

  if ($('photoCredit')) {
    $('photoCredit').hidden = true;
  }
}

initialiseImage();
updateSummary();
loadStatus();

/*
 * Premium itinerary presentation
 * --------------------------------
 * This block supports the itinerary overview bar,
 * timeline numbering and Plan another trip button.
 * It does not make any Gemini API requests.
 */

function updatePremiumTripOverview() {
  if (!generatedTrip) return;

  const trip = generatedTrip;
  const result = generatedTrip.result;
  const days =
    Array.isArray(result?.days) && result.days.length
      ? result.days.length
      : tripDays(trip);

  const travellers =
    Number(trip.adults) + Number(trip.children);

  const totalBudget =
    trip.budgetType === 'person'
      ? trip.budget * travellers
      : trip.budget;

  if ($('overviewRoute')) {
    $('overviewRoute').textContent =
      `${trip.origin} → ${trip.destination}`;
  }

  if ($('overviewDuration')) {
    $('overviewDuration').textContent =
      `${days} day${days === 1 ? '' : 's'} · ` +
      `${Math.max(0, days - 1)} night${
        days - 1 === 1 ? '' : 's'
      }`;
  }

  if ($('overviewTravellers')) {
    $('overviewTravellers').textContent =
      `${travellers} traveller${
        travellers === 1 ? '' : 's'
      }`;
  }

  if ($('overviewBudget')) {
    $('overviewBudget').textContent =
      formatCurrency(totalBudget);
  }

  if ($('overviewPace')) {
    $('overviewPace').textContent =
      `${trip.pace} · ${trip.hotel}`;
  }

  document.querySelectorAll('.day').forEach(
    (day, index) => {
      day.style.setProperty(
        '--day-number',
        `"${String(index + 1).padStart(2, '0')}"`
      );
    }
  );
}

const resultObserver = new MutationObserver(() => {
  if (
    generatedTrip &&
    !$('results').hidden &&
    $('resultTitle').textContent.trim()
  ) {
    updatePremiumTripOverview();
  }
});

resultObserver.observe($('resultTitle'), {
  childList: true,
  characterData: true,
  subtree: true
});

if ($('planAnother')) {
  $('planAnother').addEventListener('click', () => {
    $('planner').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    setTimeout(() => {
      $('destination').focus();
    }, 500);
  });
}