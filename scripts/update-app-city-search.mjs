import {
  copyFile,
  readFile,
  writeFile
} from 'node:fs/promises';

const file = 'public/app.js';
const backup =
  'public/app.before-city-search.js';

let source = await readFile(
  file,
  'utf8'
);

function replaceOnce(
  search,
  replacement,
  label
) {
  const first =
    source.indexOf(search);

  const last =
    source.lastIndexOf(search);

  if (first === -1) {
    throw new Error(
      `Could not find ${label}. No changes were written.`
    );
  }

  if (first !== last) {
    throw new Error(
      `Found multiple ${label} blocks. No changes were written.`
    );
  }

  source = source.replace(
    search,
    replacement
  );
}

/*
 * Remove the old limited hard-coded city list.
 */
const placesStart =
  source.indexOf(
    'const places = ['
  );

const placesEndMarker =
  '\n];\n\nfunction createChips(';

const placesEnd =
  source.indexOf(
    placesEndMarker,
    placesStart
  );

if (
  placesStart === -1 ||
  placesEnd === -1
) {
  throw new Error(
    'Could not find the old places list.'
  );
}

const selectedPlacesCode = `const selectedPlaces = {
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
`;

source =
  source.slice(
    0,
    placesStart
  ) +
  selectedPlacesCode +
  source.slice(
    placesEnd +
      '\n];\n'.length
  );

/*
 * Remove the old static-list validation.
 */
const oldIndianStart =
  source.indexOf(
    'function isIndianPlace(value) {'
  );

const oldIndianEnd =
  source.indexOf(
    '\n}\n\nfunction getChecked(',
    oldIndianStart
  );

if (
  oldIndianStart === -1 ||
  oldIndianEnd === -1
) {
  throw new Error(
    'Could not find isIndianPlace.'
  );
}

source =
  source.slice(
    0,
    oldIndianStart
  ) +
  source.slice(
    oldIndianEnd + 3
  );

replaceOnce(
  `  if (
    isIndianPlace(
      input.value
    )
  ) {`,
  `  if (
    isSelectedIndianPlace(id)
  ) {`,
  'Domestic field selection check'
);

replaceOnce(
  `    (
      !isIndianPlace(
        trip.origin
      ) ||
      !isIndianPlace(
        trip.destination
      )
    )`,
  `    (
      !isSelectedIndianPlace(
        'origin'
      ) ||
      !isSelectedIndianPlace(
        'destination'
      )
    )`,
  'Domestic trip validation'
);

/*
 * Replace trip-type switching.
 */
const setTripStart =
  source.indexOf(
    'function setTripType(type) {'
  );

const setTripEnd =
  source.indexOf(
    '\n}\n\nfunction editDistance(',
    setTripStart
  );

if (
  setTripStart === -1 ||
  setTripEnd === -1
) {
  throw new Error(
    'Could not find setTripType.'
  );
}

const newSetTripType = `function setTripType(type) {
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
}`;

source =
  source.slice(
    0,
    setTripStart
  ) +
  newSetTripType +
  source.slice(
    setTripEnd + 3
  );

/*
 * Replace the entire old local autocomplete.
 */
const autocompleteStart =
  source.indexOf(
    'function editDistance('
  );

const autocompleteEnd =
  source.indexOf(
    '\n}\n\nfunction setSystemStatus(',
    autocompleteStart
  );

if (
  autocompleteStart === -1 ||
  autocompleteEnd === -1
) {
  throw new Error(
    'Could not find the old autocomplete block.'
  );
}

const newAutocomplete = `function attachSuggestions(id) {
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
    \`\${id}-suggestions\`;

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
          \`\${optionsBox.id}-\${index}\`;

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
          \`/api/places?\${parameters}\`,
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
}`;

source =
  source.slice(
    0,
    autocompleteStart
  ) +
  newAutocomplete +
  source.slice(
    autocompleteEnd + 3
  );

replaceOnce(
  `        clearDomesticValidity();
        showError('');`,
  `        clearSelectedPlace(
          'origin'
        );

        clearSelectedPlace(
          'destination'
        );

        clearDomesticValidity();
        showError('');`,
  'form reset block'
);

await copyFile(
  file,
  backup
);

await writeFile(
  file,
  source,
  'utf8'
);

console.log('');
console.log(
  `Updated: ${file}`
);
console.log(
  `Backup: ${backup}`
);
console.log('');