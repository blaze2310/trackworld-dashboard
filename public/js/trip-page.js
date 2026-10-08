/**
 * TrackWorld AI Travel Planner
 * My Trip Hub
 */

const STORAGE_KEYS = {
  activeTrip: "trackworld-active-trip-v1",
  savedTrips: "trackworld-saved-trips-v1",
  legacyItineraryPrefix: "trackworld-itinerary-v4:",
};

let expertAppointmentRequest = "";

const state = {
  trip: null,
  itinerary: null,
  status: null,
  weather: null,
  currency: null,
  flights: null,
  flightDirection: "departure",
  stays: null,
  explore: null,
  exploreCategory: "attractions",
};

const elements = {};

const exploreImageCache =
  new Map();

document.addEventListener("DOMContentLoaded", init);

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */

async function init() {
  cacheElements();
  bindNavigation();
  bindActions();

  state.trip = loadTripContext();

  await loadStatus();

  if (state.trip) {
    renderTripContext();
    renderItinerary();

    await Promise.allSettled([
      loadAirports(),
      loadWeather(),
      loadCurrency(),
    ]);
  } else {
    renderNoTrip();
  }
}

/* -------------------------------------------------------------------------- */
/* DOM                                                                        */
/* -------------------------------------------------------------------------- */

function cacheElements() {
  const ids = [
    "tripTitle",
    "tripSubtitle",
    "heroDestination",
    "heroDates",
    "overviewOrigin",
    "overviewOriginAirport",
    "overviewDestination",
    "overviewDestinationAirport",
    "overviewTravellers",
    "overviewDays",
    "weatherStatus",
    "weatherContent",
    "currencyContent",
    "itineraryContent",
    "flightOrigin",
    "flightDestination",
    "flightsContent",
    "searchDepartureFlightsButton",
    "searchReturnFlightsButton",
    "departureFlightDate",
    "returnFlightDate",
    "staysContent",
    "exploreContent",
    "saveTripButton",
    "expertButton",
    "printItineraryButton",
    "searchStaysButton",
    "refreshExploreButton",
    "openAssistantButton",
    "expertDialog",
    "closeExpertDialog",
    "expertTripSummary",
    "expertPlanReference",
    "expertAppointmentForm",
    "expertCustomerName",
    "expertEmail",
    "expertPhone",
    "expertPreferredDate",
    "expertPreferredTime",
    "expertAppointmentStatus",
    "expertDownloadRequest",
    "toast",
  ];

  for (const id of ids) {
    elements[id] =
      document.getElementById(id);
  }
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

function bindNavigation() {
  document
    .querySelectorAll("[data-section]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          showSection(
            button.dataset.section
          );
        }
      );
    });

  document
    .querySelectorAll("[data-go]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          showSection(
            button.dataset.go
          );
        }
      );
    });

  document
    .querySelectorAll(
      "[data-explore-category]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.exploreCategory =
            button.dataset
              .exploreCategory;

          document
            .querySelectorAll(
              "[data-explore-category]"
            )
            .forEach((item) => {
              item.classList.toggle(
                "active",
                item === button
              );
            });

          renderExplore();
        }
      );
    });
}

function showSection(name) {
  const target =
    document.getElementById(
      `section-${name}`
    );

  if (!target) {
    return;
  }

  document
    .querySelectorAll(
      ".page-section"
    )
    .forEach((section) => {
      section.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.section ===
          name
      );
    });

  target.classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });

  if (
    name === "explore" &&
    !state.explore
  ) {
    loadExplore();
  }
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function bindActions() {
  elements.saveTripButton
    ?.addEventListener(
      "click",
      saveCurrentTrip
    );

  elements.expertButton
    ?.addEventListener(
      "click",
      openExpertDialog
    );

  elements.closeExpertDialog
    ?.addEventListener(
      "click",
      () => {
        elements.expertDialog
          ?.close();
      }
    );

  elements.expertDialog
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.expertDialog
        ) {
          elements.expertDialog
            .close();
        }
      }
    );

  elements.expertAppointmentForm
    ?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        if (
          !elements.expertAppointmentForm
            .reportValidity()
        ) {
          return;
        }

        expertAppointmentRequest =
          buildExpertAppointmentRequest();

        if (
          elements.expertAppointmentStatus
        ) {
          elements.expertAppointmentStatus
            .textContent =
              "Your request is ready to download. Nothing has been sent or reserved.";
        }

        if (
          elements.expertDownloadRequest
        ) {
          elements.expertDownloadRequest
            .hidden = false;
        }
      }
    );

  elements.expertDownloadRequest
    ?.addEventListener(
      "click",
      () => {
        if (
          expertAppointmentRequest
        ) {
          downloadExpertAppointmentRequest(
            expertAppointmentRequest
          );
        }
      }
    );

  elements.printItineraryButton
    ?.addEventListener(
      "click",
      () => {
        window.print();
      }
    );

  elements.searchDepartureFlightsButton
    ?.addEventListener(
      "click",
      () => {
        loadFlights(
          "departure"
        );
      }
    );

  elements.searchReturnFlightsButton
    ?.addEventListener(
      "click",
      () => {
        loadFlights(
          "return"
        );
      }
    );

  elements.searchStaysButton
    ?.addEventListener(
      "click",
      loadStays
    );

  elements.refreshExploreButton
    ?.addEventListener(
      "click",
      () => {
        loadExplore(true);
      }
    );

  elements.openAssistantButton
    ?.addEventListener(
      "click",
      openAssistant
    );
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

function safeParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadTripContext() {
  const direct =
    safeParse(
      localStorage.getItem(
        STORAGE_KEYS.activeTrip
      )
    );

  if (direct) {
    return normaliseTrip(direct);
  }

  const query =
    new URLSearchParams(
      window.location.search
    );

  const storageKey =
    query.get("trip");

  if (storageKey) {
    const stored =
      safeParse(
        localStorage.getItem(
          storageKey
        )
      );

    if (stored) {
      return normaliseTrip(stored);
    }
  }

  const legacy =
    findLatestLegacyItinerary();

  if (legacy) {
    return normaliseTrip(legacy);
  }

  return null;
}

function findLatestLegacyItinerary() {
  const matches = [];

  for (
    let index = 0;
    index < localStorage.length;
    index += 1
  ) {
    const key =
      localStorage.key(index);

    if (
      !key ||
      !key.startsWith(
        STORAGE_KEYS
          .legacyItineraryPrefix
      )
    ) {
      continue;
    }

    const value =
      safeParse(
        localStorage.getItem(key)
      );

    if (!value) {
      continue;
    }

    matches.push({
      key,
      value,
      timestamp:
        Number(
          value.timestamp ??
            value.savedAt ??
            value.createdAt ??
            0
        ) || 0,
    });
  }

  matches.sort(
    (a, b) =>
      b.timestamp - a.timestamp
  );

  return matches[0]?.value ?? null;
}

/* -------------------------------------------------------------------------- */
/* Trip Normalisation                                                         */
/* -------------------------------------------------------------------------- */

function normaliseTrip(raw) {
  const wrapper =
    raw?.trip ??
    raw?.data?.trip ??
    raw;

  const itinerary =
    wrapper?.itinerary ??
    raw?.itinerary ??
    raw?.result ??
    raw?.data ??
    raw;

  const input =
    wrapper?.input ??
    itinerary?.input ??
    raw?.input ??
    {};

  const route =
    wrapper?.route ??
    itinerary?.route ??
    raw?.route ??
    {};

  const origin =
    route?.origin ??
    wrapper?.originLocation ??
    itinerary?.originLocation ??
    input?.originLocation ??
    input?.origin ??
    wrapper?.origin ??
    itinerary?.origin ??
    "";

  const destination =
    route?.destination ??
    wrapper
      ?.destinationLocation ??
    itinerary
      ?.destinationLocation ??
    input?.destinationLocation ??
    input?.destination ??
    wrapper?.destination ??
    itinerary?.destination ??
    "";

  const start =
    wrapper?.start ??
    input?.start ??
    input?.startDate ??
    itinerary?.start ??
    itinerary?.startDate ??
    "";

  const end =
    wrapper?.end ??
    input?.end ??
    input?.endDate ??
    itinerary?.end ??
    itinerary?.endDate ??
    "";

  const adults =
    toInteger(
      wrapper?.traveller
        ?.adults ??
        input?.adults ??
        wrapper?.adults ??
        itinerary?.adults,
      1
    );

  const children =
    toInteger(
      wrapper?.traveller
        ?.children ??
        input?.children ??
        wrapper?.children ??
        itinerary?.children,
      0
    );

  const days =
    Array.isArray(
      itinerary?.days
    )
      ? itinerary.days
      : [];

  const dayCount =
    toInteger(
      wrapper?.days,
      days.length ||
        calculateDays(
          start,
          end
        )
    );

  const normalised = {
    raw,

    itinerary,

    input,

    route: {
      origin:
        normaliseLocation(
          origin
        ),

      destination:
        normaliseLocation(
          destination
        ),
    },

    start,
    end,
    adults,
    children,

    days:
      Math.max(
        1,
        dayCount || 1
      ),

    tripTitle:
      clean(
        itinerary?.tripTitle ??
          wrapper?.tripTitle
      ),

    summary:
      clean(
        itinerary?.summary ??
          wrapper?.summary
      ),
  };

  state.itinerary =
    itinerary;

  return normalised;
}

function normaliseLocation(value) {
  if (
    value &&
    typeof value === "object"
  ) {
    return {
      ...value,

      name:
        clean(
          value.name ??
            value.city ??
            value.label
        ),

      country:
        clean(
          value.country ??
            value.countryName
        ),

      countryCode:
        clean(
          value.countryCode
        ).toUpperCase(),

      latitude:
        numberOrNull(
          value.latitude ??
            value.lat
        ),

      longitude:
        numberOrNull(
          value.longitude ??
            value.lon ??
            value.lng
        ),

      airport:
        value.airport ??
        null,
    };
  }

  return {
    name: clean(value),
    country: "",
    countryCode: "",
    latitude: null,
    longitude: null,
    airport: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

async function loadStatus() {
  try {
    state.status =
      await api(
        "/api/status"
      );
  } catch {
    state.status = null;
  }
}

/* -------------------------------------------------------------------------- */
/* Airport Resolution                                                        */
/* -------------------------------------------------------------------------- */

async function loadAirports() {
  if (!state.trip) {
    return;
  }

  const origin =
    state.trip.route.origin;

  const destination =
    state.trip.route.destination;

  const [
    originResult,
    destinationResult,
  ] =
    await Promise.allSettled([
      resolveAirport(origin),
      resolveAirport(destination),
    ]);

  if (
    originResult.status ===
      "fulfilled" &&
    originResult.value
  ) {
    origin.airport =
      originResult.value;
  }

  if (
    destinationResult.status ===
      "fulfilled" &&
    destinationResult.value
  ) {
    destination.airport =
      destinationResult.value;
  }

  renderAirportInformation();
}

async function resolveAirport(
  location
) {
  if (!location) {
    return null;
  }

  if (
    airportCode(location)
  ) {
    return location.airport;
  }

  const params =
    new URLSearchParams();

  if (location.name) {
    params.set(
      "city",
      location.name
    );
  }

  if (location.countryCode) {
    params.set(
      "countryCode",
      location.countryCode
    );
  }

  if (
    Number.isFinite(
      Number(location.latitude)
    )
  ) {
    params.set(
      "latitude",
      String(
        location.latitude
      )
    );
  }

  if (
    Number.isFinite(
      Number(location.longitude)
    )
  ) {
    params.set(
      "longitude",
      String(
        location.longitude
      )
    );
  }

  const response =
    await api(
      `/api/airport?${params.toString()}`
    );

  const data =
    unwrap(response);

  return (
    data?.airport ??
    data?.result ??
    data ??
    null
  );
}

function renderAirportInformation() {
  if (!state.trip) {
    return;
  }

  const origin =
    state.trip.route.origin;

  const destination =
    state.trip.route.destination;

  setText(
    elements
      .overviewOriginAirport,
    airportLabel(origin)
  );

  setText(
    elements
      .overviewDestinationAirport,
    airportLabel(destination)
  );

  setText(
    elements.flightOrigin,
    flightLocationLabel(origin)
  );

  setText(
    elements.flightDestination,
    flightLocationLabel(
      destination
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function renderTripContext() {
  const trip = state.trip;

  const origin =
    trip.route.origin;

  const destination =
    trip.route.destination;

  const title =
    trip.tripTitle ||
    (
      destination.name
        ? `${destination.name} journey`
        : "Your journey"
    );

  setText(
    elements.tripTitle,
    title
  );

  setText(
    elements.tripSubtitle,
    trip.summary ||
      createRouteSummary(trip)
  );

  setText(
    elements.heroDestination,
    destination.name ||
      "Your destination"
  );

  setText(
    elements.heroDates,
    formatDateRange(
      trip.start,
      trip.end
    )
  );

  setText(
    elements.overviewOrigin,
    origin.name || "—"
  );

  setText(
    elements
      .overviewOriginAirport,
    airportLabel(origin)
  );

  setText(
    elements
      .overviewDestination,
    destination.name || "—"
  );

  setText(
    elements
      .overviewDestinationAirport,
    airportLabel(destination)
  );

  setText(
    elements.overviewTravellers,
    travellerLabel(
      trip.adults,
      trip.children
    )
  );

  setText(
    elements.overviewDays,
    `${trip.days} ${
      trip.days === 1
        ? "day"
        : "days"
    }`
  );

  setText(
    elements.flightOrigin,
    flightLocationLabel(origin)
  );

  setText(
    elements.flightDestination,
    flightLocationLabel(
      destination
    )
  );

  setText(
    elements.departureFlightDate,
    trip.start
      ? shortDate(trip.start)
      : "—"
  );

  setText(
    elements.returnFlightDate,
    trip.end
      ? shortDate(trip.end)
      : "—"
  );
}

function renderNoTrip() {
  setText(
    elements.tripTitle,
    "Your journey"
  );

  setText(
    elements.tripSubtitle,
    "Generate an itinerary from the planner to build your Trip Hub."
  );

  setText(
    elements.heroDestination,
    "Plan your next journey"
  );

  setText(
    elements.heroDates,
    "Start from the TrackWorld planner"
  );

  setText(
    elements.weatherStatus,
    "Waiting"
  );

  if (elements.weatherContent) {
    elements.weatherContent.innerHTML =
      notice(
        "Generate a trip to view destination weather."
      );
  }

  if (elements.currencyContent) {
    elements.currencyContent.innerHTML =
      notice(
        "Generate a trip to view destination currency information."
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Itinerary                                                                  */
/* -------------------------------------------------------------------------- */

function renderItinerary() {
  const itinerary =
    state.itinerary;

  const days =
    Array.isArray(
      itinerary?.days
    )
      ? itinerary.days
      : [];

  if (
    !elements.itineraryContent ||
    !days.length
  ) {
    return;
  }

  elements.itineraryContent
    .innerHTML =
    days
      .map(
        (
          day,
          index
        ) =>
          renderItineraryDay(
            day,
            index
          )
      )
      .join("");
}

function renderItineraryDay(
  day,
  index
) {
  const items =
    Array.isArray(day?.items)
      ? day.items
      : [];

  const dayNumber =
    index + 1;

  const title =
    clean(day?.title) ||
    `Day ${dayNumber}`;

  const area =
    clean(day?.area);

  const note =
    clean(day?.note);

  return `
    <article class="itinerary-day">
      <header class="itinerary-day-header">
        <div class="day-number">
          ${String(dayNumber).padStart(2, "0")}
        </div>

        <div>
          <h3>
            ${escapeHtml(title)}
          </h3>

          ${
            area
              ? `
                <p>
                  ${escapeHtml(area)}
                </p>
              `
              : ""
          }
        </div>
      </header>

      <div class="itinerary-items">
        ${items
          .map(
            (
              item
            ) =>
              renderItineraryItem(
                item
              )
          )
          .join("")}

        ${
          note
            ? `
              <div class="notice">
                ${escapeHtml(note)}
              </div>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function renderItineraryItem(
  item
) {
  const time =
    clean(item?.time) ||
    activityLabel(
      item?.type
    );

  const title =
    clean(item?.title) ||
    "Travel activity";

  const description =
    clean(
      item?.description
    );

  return `
    <div class="itinerary-item">
      <div class="itinerary-time">
        ${escapeHtml(time)}
      </div>

      <div class="timeline-dot"></div>

      <div class="itinerary-item-copy">
        <strong>
          ${escapeHtml(title)}
        </strong>

        ${
          description
            ? `
              <p>
                ${escapeHtml(description)}
              </p>
            `
            : ""
        }
      </div>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Weather                                                                    */
/* -------------------------------------------------------------------------- */

async function loadWeather() {
  if (
    !state.trip ||
    !elements.weatherContent
  ) {
    return;
  }

  setText(
    elements.weatherStatus,
    "Loading"
  );

  elements.weatherContent
    .innerHTML =
    `<div class="skeleton large"></div>`;

  try {
    const payload = {
      destination:
        locationRequestValue(
          state.trip.route
            .destination
        ),

      start:
        state.trip.start,

      end:
        state.trip.end,
    };

    const response =
      await api(
        "/api/weather",
        {
          method: "POST",
          body: payload,
        }
      );

    const weather =
      unwrap(
        response
      )?.weather ??
      unwrap(response);

    state.weather =
      weather;

    renderWeather();
  } catch (error) {
    setText(
      elements.weatherStatus,
      "Unavailable"
    );

    elements.weatherContent
      .innerHTML =
      notice(
        error.message ||
          "Weather information is currently unavailable.",
        true
      );
  }
}

function renderWeather() {
  const weather =
    state.weather;

  if (!weather) {
    return;
  }

  const days =
    Array.isArray(
      weather.days
    )
      ? weather.days
      : Array.isArray(
          weather.forecast
        )
        ? weather.forecast
        : [];

  if (!days.length) {
    setText(
      elements.weatherStatus,
      "Unavailable"
    );

    elements.weatherContent
      .innerHTML =
      notice(
        "Weather information is currently unavailable.",
        true
      );

    return;
  }

  setText(
    elements.weatherStatus,
    weather.cached
      ? "Cached"
      : "Weather"
  );

  const highs =
    days
      .map(
        (day) =>
          numberOrNull(
            day.temperatureMaxC ??
            day.maxTemperature ??
            day.temperatureMax ??
            day.maxTemp ??
            day.high
          )
      )
      .filter(
        (value) =>
          value !== null
      );

  const lows =
    days
      .map(
        (day) =>
          numberOrNull(
            day.temperatureMinC ??
            day.minTemperature ??
            day.temperatureMin ??
            day.minTemp ??
            day.low
          )
      )
      .filter(
        (value) =>
          value !== null
      );

  const averageHigh =
    highs.length
      ? highs.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / highs.length
      : null;

  const averageLow =
    lows.length
      ? lows.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / lows.length
      : null;

  elements.weatherContent
    .innerHTML =
    `
      <div class="weather-current">
        <div class="weather-temperature">
          ${
            averageHigh !== null
              ? `${Math.round(averageHigh)}°C`
              : "—"
          }
        </div>

        <div class="weather-description">
          <strong>
            Average high
          </strong>

          <span>
            ${
              averageLow !== null
                ? `Average low ${Math.round(averageLow)}°C · ${days.length}-day weather`
                : `${days.length}-day weather`
            }
          </span>
        </div>
      </div>

      <div class="weather-days">
        ${days
          .map(
            (day) =>
              renderWeatherDay(
                day
              )
          )
          .join("")}
      </div>
    `;
}

function renderWeatherDay(day) {
  const date =
    day.date ??
    day.day ??
    "";

  const high =
    day.temperatureMaxC ??
    day.maxTemperature ??
    day.temperatureMax ??
    day.maxTemp ??
    day.high;

  const low =
    day.temperatureMinC ??
    day.minTemperature ??
    day.temperatureMin ??
    day.minTemp ??
    day.low;

  return `
    <div class="weather-day">
      <strong>
        ${escapeHtml(
          shortDate(date)
        )}
      </strong>

      <span>
        ${
          numberOrNull(high) !==
          null
            ? `${Math.round(Number(high))}°`
            : "—"
        }
        /
        ${
          numberOrNull(low) !==
          null
            ? `${Math.round(Number(low))}°`
            : "—"
        }
      </span>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Currency                                                                   */
/* -------------------------------------------------------------------------- */

const currencyByCountryCode = {
  AE: "AED",
  AR: "ARS",
  AT: "EUR",
  AU: "AUD",
  BE: "EUR",
  BG: "BGN",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CN: "CNY",
  CY: "EUR",
  CZ: "CZK",
  DE: "EUR",
  DK: "DKK",
  EE: "EUR",
  EG: "EGP",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GB: "GBP",
  GR: "EUR",
  HK: "HKD",
  HR: "EUR",
  HU: "HUF",
  ID: "IDR",
  IE: "EUR",
  IL: "ILS",
  IN: "INR",
  IS: "ISK",
  IT: "EUR",
  JP: "JPY",
  KR: "KRW",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MA: "MAD",
  MC: "EUR",
  MT: "EUR",
  MX: "MXN",
  MY: "MYR",
  NL: "EUR",
  NO: "NOK",
  NP: "NPR",
  NZ: "NZD",
  PH: "PHP",
  PL: "PLN",
  PT: "EUR",
  QA: "QAR",
  RO: "RON",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  SI: "EUR",
  SK: "EUR",
  TH: "THB",
  TR: "TRY",
  TW: "TWD",
  US: "USD",
  VN: "VND",
  ZA: "ZAR",
};

const currencyByCityName = {
  dubai: "AED",
  "abu dhabi": "AED",
  sharjah: "AED",
  delhi: "INR",
  "new delhi": "INR",
  mumbai: "INR",
  bengaluru: "INR",
  bangalore: "INR",
  chennai: "INR",
  kolkata: "INR",
  hyderabad: "INR",
  goa: "INR",
  london: "GBP",
  "new york": "USD",
  "los angeles": "USD",
  "san francisco": "USD",
  lasvegas: "USD",
  "las vegas": "USD",
  tokyo: "JPY",
  osaka: "JPY",
  singapore: "SGD",
  bangkok: "THB",
  "kuala lumpur": "MYR",
  bali: "IDR",
  sydney: "AUD",
  melbourne: "AUD",
  toronto: "CAD",
  vancouver: "CAD",
  zurich: "CHF",
  geneva: "CHF",
  auckland: "NZD",
  "cape town": "ZAR",
  johannesburg: "ZAR",
  paris: "EUR",
  lyon: "EUR",
  marseille: "EUR",
  nice: "EUR",
  berlin: "EUR",
  munich: "EUR",
  frankfurt: "EUR",
  rome: "EUR",
  milan: "EUR",
  madrid: "EUR",
  barcelona: "EUR",
  lisbon: "EUR",
  amsterdam: "EUR",
  brussels: "EUR",
  vienna: "EUR",
  dublin: "EUR",
  athens: "EUR",
};

function currencyForLocation(location) {
  const explicit =
    clean(
      location?.currency ??
        location?.currencyCode
    ).toUpperCase();

  if (explicit) {
    return explicit;
  }

  const countryCode =
    clean(
      location?.countryCode
    ).toUpperCase();

  if (
    countryCode &&
    currencyByCountryCode[
      countryCode
    ]
  ) {
    return currencyByCountryCode[
      countryCode
    ];
  }

  const city =
    clean(
      location?.name
    ).toLowerCase();

  return (
    currencyByCityName[city] ||
    ""
  );
}

async function loadCurrency() {
  if (
    !state.trip ||
    !elements.currencyContent
  ) {
    return;
  }

  const origin =
    state.trip.route.origin;

  const destination =
    state.trip.route.destination;

  const source =
    currencyForLocation(origin);

  const target =
    currencyForLocation(
      destination
    );

  if (!target) {
    elements.currencyContent
      .innerHTML =
      notice(
        "Destination currency information is not available."
      );

    return;
  }

  /*
   * If the origin currency cannot be resolved, we can still
   * show the destination currency without inventing a base.
   */
  if (!source) {
    state.currency = {
      base: null,
      target,
      rateAvailable: false,
    };

    renderCurrency(
      target,
      null
    );

    return;
  }

  /*
   * Domestic/same-currency route:
   * no external conversion request is necessary.
   */
  if (source === target) {
    state.currency = {
      base: source,
      target,
      rate: 1,
      convertedAmount: 1,
      rateAvailable: true,
      sameCurrency: true,
    };

    renderCurrency(
      target,
      source
    );

    return;
  }

  try {
    const response =
      await api(
        "/api/currency",
        {
          method: "POST",

          body: {
            from: target,
            to: source,
            amount: 1,
          },
        }
      );

    const currencyData =
      unwrap(response);

    state.currency =
      currencyData?.currency ??
      currencyData;

    renderCurrency(
      target,
      source
    );
  } catch (error) {
    state.currency = {
      base: source,
      target,
      rateAvailable: false,
    };

    renderCurrency(
      target,
      source
    );
  }
}

function renderCurrency(target, source = null) {
  const currency =
    state.currency ?? {};

  const rate =
    numberOrNull(
      currency.rate ??
        currency.exchangeRate
    );

  const converted =
    numberOrNull(
      currency.convertedAmount ??
        currency.result
    );

  const value =
    converted ??
    rate;

  const origin =
    clean(
      state.trip?.route
        ?.origin?.name
    ) || "Origin";

  const destination =
    clean(
      state.trip?.route
        ?.destination?.name
    ) || "Destination";

  const currencySymbols = {
    AED: "د.إ",
    AUD: "A$",
    CAD: "C$",
    CHF: "CHF",
    CNY: "¥",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
    IDR: "Rp",
    INR: "₹",
    JPY: "¥",
    KRW: "₩",
    MYR: "RM",
    NZD: "NZ$",
    PHP: "₱",
    QAR: "ر.ق",
    SAR: "﷼",
    SGD: "S$",
    THB: "฿",
    TRY: "₺",
    TWD: "NT$",
    USD: "$",
    VND: "₫",
    ZAR: "R",
  };

  const targetSymbol =
    currencySymbols[target] ||
    target;

  const sourceSymbol =
    currencySymbols[source] ||
    source ||
    "";

  let conversionHtml = "";

  if (
    source &&
    source === target
  ) {
    conversionHtml = `
      <div class="currency-conversion">
        <small>Exchange rate</small>
        <strong>
          Same currency — no conversion needed
        </strong>
        <span class="currency-route">
          ${escapeHtml(origin)}
          →
          ${escapeHtml(destination)}
        </span>
      </div>
    `;
  } else if (
    source &&
    value !== null
  ) {
    conversionHtml = `
      <div class="currency-conversion">
        <small>Exchange rate</small>
        <strong>
          ${escapeHtml(targetSymbol)}1
          ${escapeHtml(target)}
          ≈
          ${escapeHtml(sourceSymbol)}${Number(value).toLocaleString(
            undefined,
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}
          ${escapeHtml(source)}
        </strong>
        <span class="currency-route">
          ${escapeHtml(origin)}
          →
          ${escapeHtml(destination)}
        </span>
      </div>
    `;
  }

  elements.currencyContent
    .innerHTML = `
      <div class="currency-rate">
        <div class="currency-identity">
          <span class="currency-symbol">
            ${escapeHtml(
              targetSymbol
            )}
          </span>

          <div>
            <strong>
              ${escapeHtml(target)}
            </strong>

            <span class="currency-place">
              ${escapeHtml(destination)}
              currency
            </span>
          </div>
        </div>

        ${conversionHtml}
      </div>
    `;
}

/* -------------------------------------------------------------------------- */
/* Flights                                                                    */
/* -------------------------------------------------------------------------- */

async function loadFlights(
  direction = "departure"
) {
  if (!state.trip) {
    showToast(
      "Generate a trip first."
    );
    return;
  }

  const isReturn =
    direction === "return";

  state.flightDirection =
    isReturn
      ? "return"
      : "departure";

  const trip =
    state.trip;

  const origin =
    isReturn
      ? trip.route.destination
      : trip.route.origin;

  const destination =
    isReturn
      ? trip.route.origin
      : trip.route.destination;

  const travelDate =
    isReturn
      ? trip.end
      : trip.start;

  const button =
    isReturn
      ? elements
          .searchReturnFlightsButton
      : elements
          .searchDepartureFlightsButton;

  elements
    .searchDepartureFlightsButton
    ?.classList.toggle(
      "active",
      !isReturn
    );

  elements
    .searchReturnFlightsButton
    ?.classList.toggle(
      "active",
      isReturn
    );

  setText(
    elements.flightOrigin,
    flightLocationLabel(origin)
  );

  setText(
    elements.flightDestination,
    flightLocationLabel(
      destination
    )
  );

  setButtonLoading(
    button,
    true,
    "Searching..."
  );

  elements.flightsContent
    .innerHTML =
    loading(
      isReturn
        ? "Searching return flights"
        : "Searching departure flights"
    );

  try {
    const response =
      await api(
        "/api/flights",
        {
          method: "POST",

          body: {
            origin:
              locationRequestValue(
                origin
              ),

            destination:
              locationRequestValue(
                destination
              ),

            departureDate:
              travelDate,

            adults:
              trip.adults,

            children:
              trip.children,

            travelClass:
              "Economy",

            currency:
              "INR",
          },
        }
      );

    const data =
      unwrap(response);

    state.flights =
      data?.flights ??
      data;

    renderFlights();
  } catch (error) {
    elements.flightsContent
      .innerHTML =
      notice(
        error.message ||
          "Flight search is currently unavailable.",
        true
      );
  } finally {
    setButtonLoading(
      button,
      false,
      isReturn
        ? "Return"
        : "Departure"
    );

    const dateElement =
      isReturn
        ? elements.returnFlightDate
        : elements.departureFlightDate;

    setText(
      dateElement,
      travelDate
        ? shortDate(
            travelDate
          )
        : "—"
    );
  }
}

function renderFlights() {
  const source =
    state.flights;

  const flights =
    extractArray(
      source,
      [
        "results",
        "flights",
        "options",
      ]
    );

  if (!flights.length) {
    elements.flightsContent
      .innerHTML =
      notice(
        clean(
          source?.message
        ) ||
          "No flight options were returned for this search."
      );

    return;
  }

  const isReturn =
    state.flightDirection ===
      "return";

  const departureDate =
    isReturn
      ? state.trip?.end
      : state.trip?.start;

  const formattedDepartureDate =
    departureDate
      ? shortDate(
          departureDate
        )
      : "";

  const directionLabel =
    isReturn
      ? "Return flight"
      : "Departure flight";

  elements.flightsContent
    .innerHTML =
    `
      ${
        formattedDepartureDate
          ? `
            <div class="flight-results-date">
              <span>
                ${escapeHtml(
                  directionLabel
                )}
              </span>

              <strong>
                ${escapeHtml(
                  formattedDepartureDate
                )}
              </strong>
            </div>
          `
          : ""
      }

      ${flights
        .slice(0, 12)
        .map(renderFlight)
        .join("")}
    `;
}

function renderFlight(flight) {
  const legs =
    Array.isArray(flight?.legs)
      ? flight.legs
      : Array.isArray(flight?.flights)
        ? flight.flights
        : Array.isArray(flight?.segments)
          ? flight.segments
          : [];

  const firstLeg =
    legs[0] ?? {};

  const lastLeg =
    legs[legs.length - 1] ??
    firstLeg;

  const airlines =
    Array.isArray(flight?.airlines)
      ? flight.airlines
      : [];

  const airline =
    clean(
      airlines[0] ??
      flight.airline ??
      firstLeg.airline ??
      flight.name
    ) ||
    "Flight option";

  const airlineLogo =
    clean(
      firstLeg.airlineLogo ??
      firstLeg.airline_logo ??
      flight.airlineLogo ??
      flight.airline_logo
    );

  const flightNumbers =
    legs
      .map(
        leg =>
          clean(
            leg.flightNumber ??
            leg.flight_number
          )
      )
      .filter(Boolean);

  const flightNumber =
    flightNumbers.length
      ? flightNumbers.join(" · ")
      : clean(
          flight.flightNumber ??
          flight.flight_number
        );

  const departure =
    flight.departure ??
    firstLeg.departure ??
    {};

  const arrival =
    flight.arrival ??
    lastLeg.arrival ??
    {};

  const departureTime =
    formatFlightTime(
      departure.time ??
      flight.departureTime ??
      firstLeg.departureTime ??
      firstLeg.departure_airport
        ?.time
    );

  const arrivalTime =
    formatFlightTime(
      arrival.time ??
      flight.arrivalTime ??
      lastLeg.arrivalTime ??
      lastLeg.arrival_airport
        ?.time
    );

  const originCode =
    clean(
      departure.code ??
      flight.origin ??
      firstLeg.origin ??
      firstLeg.departure_airport
        ?.id
    ) ||
    airportCode(
      state.flightDirection ===
        "return"
        ? state.trip.route
            .destination
        : state.trip.route.origin
    );

  const destinationCode =
    clean(
      arrival.code ??
      flight.destination ??
      lastLeg.destination ??
      lastLeg.arrival_airport
        ?.id
    ) ||
    airportCode(
      state.flightDirection ===
        "return"
        ? state.trip.route.origin
        : state.trip.route
            .destination
    );

  const durationMinutes =
    Number(
      flight.durationMinutes ??
      flight.totalDurationMinutes ??
      flight.total_duration
    );

  const duration =
    Number.isFinite(
      durationMinutes
    ) &&
    durationMinutes > 0
      ? formatFlightMinutes(
          durationMinutes
        )
      : clean(
          flight.duration ??
          flight.totalDuration
        ) ||
        "Duration unavailable";

  const stops =
    Number.isFinite(
      Number(flight.stops)
    )
      ? Number(flight.stops)
      : Math.max(
          legs.length - 1,
          0
        );

  const stopsLabel =
    stops === 0
      ? "Non-stop"
      : stops === 1
        ? "1 stop"
        : `${stops} stops`;

  const travelClass =
    clean(
      firstLeg.travelClass ??
      firstLeg.travel_class ??
      flight.travelClass
    );

  const aircraft =
    [
      ...new Set(
        legs
          .map(
            leg =>
              clean(
                leg.aircraft
              )
          )
          .filter(Boolean)
      ),
    ].join(" / ");

  const details =
    [
      flightNumber,
      travelClass,
      aircraft,
    ]
      .filter(Boolean)
      .join(" · ");

  const price =
    flight.price ??
    flight.totalPrice ??
    flight.amount;

  const currency =
    clean(
      flight.currency
    ) ||
    "INR";

  return `
    <article class="flight-card">
      <div class="flight-airline">
        ${
          airlineLogo
            ? `
              <img
                class="flight-airline-logo"
                src="${escapeHtml(
                  airlineLogo
                )}"
                alt="${escapeHtml(
                  airline
                )}"
                loading="lazy"
                referrerpolicy="no-referrer"
              >
            `
            : ""
        }

        <div>
          <strong>
            ${escapeHtml(airline)}
          </strong>

          <span>
            ${escapeHtml(
              details ||
              "Current option"
            )}
          </span>
        </div>
      </div>

      <div class="flight-times">
        <div class="flight-time-block">
          <strong>
            ${escapeHtml(
              departureTime
            )}
          </strong>

          <span>
            ${escapeHtml(
              originCode
            )}
          </span>
        </div>

        <div class="flight-duration">
          <span>
            ${escapeHtml(
              duration
            )}
          </span>

          <div
            class="flight-line"
            aria-hidden="true"
          ></div>

          <small>
            ${escapeHtml(
              stopsLabel
            )}
          </small>
        </div>

        <div class="flight-time-block">
          <strong>
            ${escapeHtml(
              arrivalTime
            )}
          </strong>

          <span>
            ${escapeHtml(
              destinationCode
            )}
          </span>
        </div>
      </div>

      <div class="flight-price">
        <strong>
          ${formatMoney(
            price,
            currency
          )}
        </strong>

        <span>
          ${escapeHtml(
            stopsLabel
          )}
        </span>
      </div>
    </article>
  `;
}

function formatFlightTime(value) {
  const raw =
    clean(value);

  if (!raw) {
    return "—";
  }

  const match =
    raw.match(
      /(?:T|\s)?(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

  if (!match) {
    return raw;
  }

  const hour =
    Number(match[1]);

  const minute =
    match[2];

  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  const displayHour =
    hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function formatFlightMinutes(value) {
  const minutes =
    Number(value);

  if (
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return "Duration unavailable";
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const remainder =
    minutes % 60;

  if (!hours) {
    return `${remainder}m`;
  }

  if (!remainder) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}


/* -------------------------------------------------------------------------- */
/* Stays                                                                      */
/* -------------------------------------------------------------------------- */

async function loadStays() {
  if (!state.trip) {
    showToast(
      "Generate a trip first."
    );
    return;
  }

  const button =
    elements.searchStaysButton;

  setButtonLoading(
    button,
    true,
    "Searching..."
  );

  elements.staysContent
    .innerHTML =
    loading(
      "Searching accommodation options"
    );

  try {
    const trip =
      state.trip;

    const response =
      await api(
        "/api/stays",
        {
          method: "POST",

          body: {
            destination:
              locationRequestValue(
                trip.route
                  .destination
              ),

            checkIn:
              trip.start,

            checkOut:
              trip.end,

            adults:
              trip.adults,

            children:
              trip.children,

            rooms: 1,

            currency:
              "INR",
          },
        }
      );

    const data =
      unwrap(response);

    state.stays =
      data?.stays ??
      data;

    renderStays();
  } catch (error) {
    elements.staysContent
      .innerHTML =
      notice(
        error.message ||
          "Stay search is currently unavailable.",
        true
      );
  } finally {
    setButtonLoading(
      button,
      false,
      "Search stays"
    );
  }
}

function renderStays() {
  const source =
    state.stays;

  const stays =
    extractArray(
      source,
      [
        "results",
        "stays",
        "hotels",
        "properties",
      ]
    );

  if (!stays.length) {
    elements.staysContent
      .innerHTML =
      `
        <div class="full-width">
          ${notice(
            clean(
              source?.message
            ) ||
              "No accommodation options were returned for this search."
          )}
        </div>
      `;

    return;
  }

  const visibleStays =
    stays.slice(0, 12);

  elements.staysContent
    .innerHTML =
    visibleStays
      .map(renderStay)
      .join("");

  hydrateStayImages(
    visibleStays
  );
}

async function hydrateStayImages(
  stays
) {
  const cards =
    Array.from(
      elements.staysContent
        ?.querySelectorAll(
          ".result-card"
        ) ?? []
    );

  await Promise.allSettled(
    cards.map(
      (card, index) =>
        loadStayImage(
          card,
          stays[index]
        )
    )
  );
}

async function loadStayImage(
  card,
  stay
) {
  const image =
    card?.querySelector(
      ".result-card-image img"
    );

  if (!image || !stay) {
    return;
  }

  const candidates = [
    ...(
      Array.isArray(
        stay.images
      )
        ? stay.images
        : []
    ),

    stay.image,
    stay.imageUrl,
    stay.thumbnail,
    stay.photo,
  ]
    .map(clean)
    .filter(Boolean)
    .filter(
      (url, index, list) =>
        list.indexOf(url) ===
        index
    );

  const fallback =
    image.nextElementSibling;

  image.removeAttribute(
    "src"
  );

  image.style.display =
    "none";

  fallback?.classList.add(
    "visible"
  );

  for (
    const candidate of candidates
  ) {
    try {
      const response =
        await fetch(
          candidate
        );

      if (!response.ok) {
        throw new Error(
          `Image request failed: ${response.status}`
        );
      }

      const blob =
        await response.blob();

      if (
        !blob.type.startsWith(
          "image/"
        )
      ) {
        throw new Error(
          "Response was not an image."
        );
      }

      const objectUrl =
        URL.createObjectURL(
          blob
        );

      const loaded =
        await new Promise(
          resolve => {
            image.onload = () => {
              image.style.display =
                "block";

              image.style.opacity =
                "1";

              fallback?.classList.remove(
                "visible"
              );

              resolve(true);
            };

            image.onerror = () => {
              URL.revokeObjectURL(
                objectUrl
              );

              resolve(false);
            };

            image.src =
              objectUrl;
          }
        );

      if (loaded) {
        return;
      }
    } catch (error) {
      console.warn(
        "[TrackWorld] Stay image candidate failed:",
        clean(stay.name) ||
          "Accommodation",
        candidate,
        error
      );
    }
  }

  image.style.display =
    "none";

  fallback?.classList.add(
    "visible"
  );
}

function renderStay(stay) {
  const name =
    clean(
      stay.name ??
        stay.title ??
        stay.hotelName
    ) ||
    "Accommodation";

  const rating =
    stay.rating ??
    stay.overallRating ??
    stay.overall_rating;

  const description =
    clean(
      stay.description ??
        stay.location ??
        stay.address
    );

  const price =
    stay.price ??
    stay.rate ??
    stay.totalRate ??
    stay.ratePerNight ??
    stay.extracted_price;

  const currency =
    clean(
      stay.currency
    ) ||
    "INR";

  const images =
    Array.isArray(
      stay.images
    )
      ? stay.images
      : [];

  const imageUrl =
    clean(
      images[0] ??
        stay.image ??
        stay.imageUrl ??
        stay.thumbnail ??
        stay.photo
    );

  const imageMarkup =
    imageUrl
      ? `
        <img
          data-stay-image="true"
          alt="${escapeHtml(name)}"
          loading="eager"
          decoding="async"
          referrerpolicy="no-referrer"
          style="display:none;opacity:0"
        >

        <span
          class="result-card-image-fallback visible"
          aria-hidden="true"
        >
          ⌂
        </span>
      `
      : `
        <span
          class="result-card-image-fallback visible"
          aria-hidden="true"
        >
          ⌂
        </span>
      `;

  return `
    <article class="result-card">
      <div class="result-card-image">
        ${imageMarkup}
      </div>

      <div class="result-card-body">
        <h3>
          ${escapeHtml(name)}
        </h3>

        <p>
          ${escapeHtml(
            description ||
              "Stay option for your destination."
          )}
        </p>

        <div class="result-card-meta">
          <span>
            ${
              rating
                ? `★ ${escapeHtml(String(rating))}`
                : "Accommodation"
            }
          </span>

          <span class="result-price">
            ${formatMoney(
              price,
              currency
            )}
          </span>
        </div>
      </div>
    </article>
  `;
}

/* -------------------------------------------------------------------------- */
/* Explore                                                                    */
/* -------------------------------------------------------------------------- */

function getGeminiExplore() {
  const candidates = [
    state.itinerary?.explore,
    state.trip?.result?.explore,
    state.trip?.raw?.result?.explore,
    state.trip?.raw?.explore,
    state.trip?.explore,
  ];

  for (
    const candidate of candidates
  ) {
    if (
      candidate &&
      typeof candidate ===
        "object" &&
      !Array.isArray(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

async function loadExplore(
  force = false
) {
  if (!state.trip) {
    return;
  }

  if (
    force &&
    elements.exploreContent
  ) {
    elements.exploreContent
      .innerHTML =
      loading(
        "Refreshing recommendations"
      );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          250
        )
    );
  }

  const generatedExplore =
    getGeminiExplore();

  if (generatedExplore) {
    state.explore =
      generatedExplore;

    renderExplore();

    if (force) {
      showToast(
        "Explore recommendations refreshed."
      );
    }

    return;
  }

  if (
    state.explore &&
    !force
  ) {
    renderExplore();
    return;
  }

  if (
    elements.exploreContent
  ) {
    elements.exploreContent
      .innerHTML =
      `
        <div class="full-width">
          ${notice(
            "Explore recommendations are generated together with your AI itinerary. Create a new itinerary to see personalised recommendations."
          )}
        </div>
      `;
  }
}

function renderExplore() {
  const source =
    state.explore;

  if (
    !source ||
    !elements.exploreContent
  ) {
    return;
  }

  const category =
    state.exploreCategory ||
    "attractions";

  const categorySource =
    source?.[category];

  let items = [];

  if (
    Array.isArray(
      categorySource
    )
  ) {
    items =
      categorySource;
  } else if (
    categorySource &&
    typeof categorySource ===
      "object"
  ) {
    items =
      extractArray(
        categorySource,
        [
          "results",
          "places",
          "items",
        ]
      );
  }

  if (!items.length) {
    elements.exploreContent
      .innerHTML =
      `
        <div class="full-width">
          ${notice(
            `No ${
              category ===
              "restaurants"
                ? "food recommendations"
                : category
            } were generated for this trip.`
          )}
        </div>
      `;

    return;
  }

  elements.exploreContent
    .innerHTML =
    items
      .slice(
        0,
        8
      )
      .map(
        place =>
          renderExploreCard(
            place
          )
      )
      .join("");

  hydrateExploreImages();
}

function renderExploreCard(
  place
) {
  const name =
    clean(
      place.name ??
        place.title
    ) ||
    "Place to explore";

  const category =
    clean(
      place.category ??
        place.type
    ) ||
    "Recommendation";

  const description =
    clean(
      place.description
    );

  const area =
    clean(
      place.area ??
        place.address
    );

  const whyRecommended =
    clean(
      place.whyRecommended
    );

  const destination =
    clean(
      state.trip?.route
        ?.destination?.name
    );

  return `
    <article class="result-card">
      <div class="result-card-image">
        <img
          data-explore-image-name="${escapeHtml(name)}"
          data-explore-image-destination="${escapeHtml(destination)}"
          data-explore-image-category="${escapeHtml(category)}"
          data-explore-image-description="${escapeHtml(description)}"
          alt="${escapeHtml(name)}"
          loading="eager"
          referrerpolicy="no-referrer"
          style="display:block;opacity:0"
        >

        <span
          class="result-card-image-fallback visible"
          aria-hidden="true"
        >
          ⌖
        </span>
      </div>

      <div class="result-card-body">
        <h3>
          ${escapeHtml(name)}
        </h3>

        <p>
          ${escapeHtml(
            description ||
              "Recommended for your trip."
          )}
        </p>

        ${
          whyRecommended
            ? `
              <p>
                ${escapeHtml(
                  whyRecommended
                )}
              </p>
            `
            : ""
        }

        <div class="result-card-meta">
          <span>
            ${escapeHtml(
              humanCategory(
                category
              )
            )}
          </span>

          <span>
            ${escapeHtml(
              area
            )}
          </span>
        </div>
      </div>
    </article>
  `;
}

async function hydrateExploreImages() {
  const images =
    Array.from(
      elements.exploreContent
        ?.querySelectorAll(
          "img[data-explore-image-name]"
        ) ?? []
    );

  if (!images.length) {
    return;
  }

  await Promise.allSettled(
    images.map(
      image =>
        loadExploreImage(
          image
        )
    )
  );
}

async function loadExploreImage(
  image
) {
  const name =
    clean(
      image.dataset
        .exploreImageName
    );

  const destination =
    clean(
      image.dataset
        .exploreImageDestination
    );

  const category =
    clean(
      image.dataset
        .exploreImageCategory
    );

  const description =
    clean(
      image.dataset
        .exploreImageDescription
    );

  if (!name) {
    return;
  }

  const cacheKey =
    `${name.toLowerCase()}|${destination.toLowerCase()}|${category.toLowerCase()}`;

  let imageUrl =
    exploreImageCache.get(
      cacheKey
    );

  if (imageUrl === undefined) {
    imageUrl =
      await findExploreImage(
        name,
        destination,
        category,
        description
      );

    exploreImageCache.set(
      cacheKey,
      imageUrl || null
    );
  }

  if (!imageUrl) {
    return;
  }

  const fallback =
    image.nextElementSibling;

  image.onload = () => {
    image.style.display =
      "block";

    fallback?.classList.remove(
      "visible"
    );
  };

  image.onerror = () => {
    image.style.display =
      "none";

    fallback?.classList.add(
      "visible"
    );
  };

  const displayImageUrl =
    imageUrl
      .replace(
        "https://thumb.wikimedia.org/",
        "https://upload.wikimedia.org/"
      )
      .split("?")[0];

  try {
    const response =
      await fetch(
        displayImageUrl
      );

    if (!response.ok) {
      throw new Error(
        `Image request failed: ${response.status}`
      );
    }

    const blob =
      await response.blob();

    const objectUrl =
      URL.createObjectURL(
        blob
      );

    image.onload = () => {
      image.style.display =
        "block";

      image.style.opacity =
        "1";

      fallback?.classList.remove(
        "visible"
      );
    };

    image.onerror = () => {
      image.style.display =
        "none";

      fallback?.classList.add(
        "visible"
      );

      URL.revokeObjectURL(
        objectUrl
      );
    };

    image.src =
      objectUrl;
  } catch (error) {
    console.warn(
      "[TrackWorld] Explore image failed:",
      name,
      error
    );

    image.style.display =
      "none";

    fallback?.classList.add(
      "visible"
    );
  }
}

async function findExploreImage(
  name,
  destination,
  category = "",
  description = ""
) {
  if (
    isFoodExploreItem(
      category
    )
  ) {
    const foodQuery =
      buildFoodImageQuery(
        name,
        description,
        destination
      );

    return searchCommonsImage(
      foodQuery
    );
  }

  const query =
    [name, destination]
      .filter(Boolean)
      .join(" ");

  const wikipediaImage =
    await searchWikipediaImage(
      query
    );

  if (wikipediaImage) {
    return wikipediaImage;
  }

  return searchCommonsImage(
    query
  );
}

function isFoodExploreItem(
  category
) {
  const value =
    clean(
      category
    ).toLowerCase();

  return [
    "restaurant",
    "cafe",
    "café",
    "food",
    "bakery",
    "pizzeria",
    "trattoria",
    "gelateria",
    "gelato",
    "dining",
  ].some(
    type =>
      value.includes(
        type
      )
  );
}

function buildFoodImageQuery(
  name,
  description,
  destination
) {
  const value =
    `${name} ${description}`
      .toLowerCase();

  if (
    value.includes("carbonara")
  ) {
    return "spaghetti carbonara";
  }

  if (
    value.includes("cacio e pepe")
  ) {
    return "cacio e pepe pasta";
  }

  if (
    value.includes("amatriciana")
  ) {
    return "pasta amatriciana";
  }

  if (
    value.includes("pizza") ||
    value.includes("pizzarium")
  ) {
    return "pizza al taglio";
  }

  if (
    value.includes("gelato") ||
    value.includes("gelateria") ||
    value.includes("ice cream") ||
    value.includes("giolitti")
  ) {
    return "Italian gelato";
  }

  if (
    value.includes("bakery") ||
    value.includes("bread") ||
    value.includes("forno")
  ) {
    return "Italian bread bakery";
  }

  if (
    value.includes("salumeria")
  ) {
    return "Italian salumi";
  }

  if (
    value.includes("traditional roman") ||
    value.includes("roman dishes")
  ) {
    return "Roman cuisine pasta";
  }

  if (
    value.includes("classic roman") ||
    value.includes("roman cuisine")
  ) {
    return "saltimbocca alla romana";
  }

  if (
    value.includes("seafood")
  ) {
    return "Italian seafood dish";
  }

  if (
    value.includes("pasta")
  ) {
    return "Italian pasta";
  }

  if (
    value.includes("restaurant") ||
    value.includes("dinner") ||
    value.includes("trattoria")
  ) {
    return "Italian pasta Rome";
  }

  return "Roman cuisine";
}

async function searchExactFoodImage(
  name,
  destination
) {
  try {
    const query =
      `"${name}" ${destination}`;

    const params =
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: "12",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "1000",
        format: "json",
        origin: "*",
      });

    const response =
      await fetch(
        `https://commons.wikimedia.org/w/api.php?${params.toString()}`
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const pages =
      Object.values(
        data?.query?.pages ?? {}
      ).sort(
        (a, b) =>
          Number(
            a?.index ?? 999
          ) -
          Number(
            b?.index ?? 999
          )
      );

    for (const page of pages) {
      if (
        !foodImageTitleMatches(
          page?.title,
          name
        )
      ) {
        continue;
      }

      const info =
        page?.imageinfo?.[0];

      const mime =
        clean(
          info?.mime
        ).toLowerCase();

      if (
        mime &&
        !mime.startsWith(
          "image/"
        )
      ) {
        continue;
      }

      if (
        mime ===
        "image/svg+xml"
      ) {
        continue;
      }

      const url =
        clean(
          info?.thumburl ??
            info?.url
        );

      if (url) {
        return url;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function foodImageTitleMatches(
  title,
  name
) {
  const normalise =
    value =>
      clean(
        value
      )
        .toLowerCase()
        .replace(
          /^file:/,
          ""
        )
        .replace(
          /\.[a-z0-9]+$/i,
          ""
        )
        .replace(
          /[^a-z0-9]+/g,
          " "
        )
        .trim();

  const titleValue =
    normalise(
      title
    );

  const nameValue =
    normalise(
      name
    );

  const ignored =
    new Set([
      "a",
      "al",
      "alla",
      "da",
      "di",
      "del",
      "della",
      "the",
      "and",
      "con",
    ]);

  const tokens =
    nameValue
      .split(" ")
      .filter(
        token =>
          token.length >= 2 &&
          !ignored.has(
            token
          )
      );

  if (!tokens.length) {
    return false;
  }

  const matches =
    tokens.filter(
      token =>
        titleValue.includes(
          token
        )
    ).length;

  if (tokens.length === 1) {
    return matches === 1;
  }

  if (tokens.length === 2) {
    return matches === 2;
  }

  return matches >= 2;
}

async function searchWikipediaImage(
  query
) {
  try {
    const params =
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "0",
        gsrlimit: "5",
        prop: "pageimages",
        piprop: "thumbnail",
        pithumbsize: "1000",
        format: "json",
        origin: "*",
      });

    const response =
      await fetch(
        `https://en.wikipedia.org/w/api.php?${params.toString()}`
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const pages =
      Object.values(
        data?.query?.pages ?? {}
      ).sort(
        (a, b) =>
          Number(
            a?.index ?? 999
          ) -
          Number(
            b?.index ?? 999
          )
      );

    for (const page of pages) {
      const url =
        clean(
          page?.thumbnail?.source
        );

      if (url) {
        return url;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function searchCommonsImage(
  query
) {
  try {
    const params =
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "1000",
        format: "json",
        origin: "*",
      });

    const response =
      await fetch(
        `https://commons.wikimedia.org/w/api.php?${params.toString()}`
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const pages =
      Object.values(
        data?.query?.pages ?? {}
      ).sort(
        (a, b) =>
          Number(
            a?.index ?? 999
          ) -
          Number(
            b?.index ?? 999
          )
      );

    for (const page of pages) {
      const info =
        page?.imageinfo?.[0];

      const mime =
        clean(
          info?.mime
        ).toLowerCase();

      if (
        mime &&
        !mime.startsWith(
          "image/"
        )
      ) {
        continue;
      }

      const url =
        clean(
          info?.thumburl ??
            info?.url
        );

      if (url) {
        return url;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Save Trip                                                                  */
/* -------------------------------------------------------------------------- */

function saveCurrentTrip() {
  if (!state.trip) {
    showToast(
      "Generate a trip before saving."
    );
    return;
  }

  const current =
    safeParse(
      localStorage.getItem(
        STORAGE_KEYS.savedTrips
      )
    );

  const trips =
    Array.isArray(current)
      ? current
      : [];

  const record = {
    id:
      state.itinerary
        ?.requestId ??
      cryptoSafeId(),

    savedAt:
      Date.now(),

    trip:
      state.trip.raw ??
      state.trip,
  };

  const filtered =
    trips.filter(
      (item) =>
        item.id !== record.id
    );

  filtered.unshift(record);

  localStorage.setItem(
    STORAGE_KEYS.savedTrips,
    JSON.stringify(
      filtered.slice(0, 25)
    )
  );

  localStorage.setItem(
    STORAGE_KEYS.activeTrip,
    JSON.stringify(
      state.trip.raw ??
        state.trip
    )
  );

  showToast(
    "Trip saved."
  );
}

/* -------------------------------------------------------------------------- */
/* Travel Expert                                                              */
/* -------------------------------------------------------------------------- */

function expertText(value, fallback = "Not provided") {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return String(value);
}

function expertLocationName(location) {
  if (!location) {
    return "Not provided";
  }

  if (typeof location === "string") {
    return location;
  }

  return (
    location.city ||
    location.name ||
    location.label ||
    location.displayName ||
    "Not provided"
  );
}

function expertList(value, fallback = "None") {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items =
    value
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.name ||
            item?.title ||
            ""
      )
      .filter(Boolean);

  return (
    items.join(", ") ||
    fallback
  );
}

function expertTripValues() {
  const trip =
    state.trip || {};

  const route =
    trip.route || {};

  const preferences =
    trip.preferences || {};

  const travellers =
    trip.travellers || {};

  const origin =
    expertLocationName(
      route.origin ||
      trip.origin
    );

  const destination =
    expertLocationName(
      route.destination ||
      trip.destination
    );

  const adults =
    Number(
      travellers.adults ??
      trip.adults ??
      1
    );

  const children =
    Number(
      travellers.children ??
      trip.children ??
      0
    );

  return {
    trip,
    preferences,
    origin,
    destination,
    adults,
    children
  };
}

function expertPlanReference() {
  const { trip } =
    expertTripValues();

  return (
    trip.requestId ||
    trip.reference ||
    trip.itinerary?.requestId ||
    trip.itinerary?.reference ||
    trip.title ||
    trip.itinerary?.title ||
    "Active Trip Hub itinerary"
  );
}

function buildExpertAppointmentRequest() {
  const {
    trip,
    preferences,
    origin,
    destination,
    adults,
    children
  } = expertTripValues();

  const interests =
    preferences.interests ??
    trip.interests;

  const services =
    preferences.services ??
    trip.services;

  const occasion =
    preferences.occasion ??
    trip.occasion;

  const hotel =
    preferences.hotel ??
    preferences.stay ??
    trip.hotel;

  const pace =
    preferences.pace ??
    trip.pace;

  const comments =
    preferences.comments ??
    preferences.requirements ??
    trip.comments;

  const lines = [
    "TRACKWORLD CONSULTATION REQUEST — NOT SENT",
    "",
    `Plan reference: ${expertPlanReference()}`,
    `Name: ${elements.expertCustomerName?.value.trim() || "Not provided"}`,
    `Email: ${elements.expertEmail?.value.trim() || "Not provided"}`,
    `Phone: ${elements.expertPhone?.value.trim() || "Not provided"}`,
    `Preferred date: ${elements.expertPreferredDate?.value || "Not provided"}`,
    `Preferred time: ${elements.expertPreferredTime?.value || "No preference"}`,
    "",
    `Route: ${origin} to ${destination}`,
    `Dates: ${expertText(trip.start)} to ${expertText(trip.end)}`,
    `Travellers: ${adults} adults, ${children} children`,
    `Occasion: ${expertText(occasion, "Not specified")}`,
    `Stay: ${expertText(hotel, "Not specified")}`,
    `Pace: ${expertText(pace, "Not specified")}`,
    `Interests: ${expertList(interests, "Open")}`,
    `Services: ${expertList(services, "None")}`,
    `Requirements: ${expertText(comments, "None")}`,
    "",
    "This consultation request was prepared locally in TrackWorld.",
    "Nothing has been sent, booked or reserved."
  ];

  return lines.join("\n");
}

function downloadExpertAppointmentRequest(text) {
  const blob =
    new Blob(
      [text],
      {
        type:
          "text/plain;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "TrackWorld-Vacations-consultation-request.txt";

  document.body.appendChild(
    link
  );

  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function openExpertDialog() {
  expertAppointmentRequest = "";

  if (
    elements.expertAppointmentStatus
  ) {
    elements.expertAppointmentStatus
      .textContent = "";
  }

  if (
    elements.expertDownloadRequest
  ) {
    elements.expertDownloadRequest
      .hidden = true;
  }

  if (
    elements.expertPreferredDate
  ) {
    const today =
      new Date();

    const localToday =
      [
        today.getFullYear(),
        String(
          today.getMonth() + 1
        ).padStart(2, "0"),
        String(
          today.getDate()
        ).padStart(2, "0")
      ].join("-");

    elements.expertPreferredDate
      .min = localToday;
  }

  if (
    elements.expertPlanReference
  ) {
    elements.expertPlanReference
      .textContent =
        expertPlanReference();
  }


  if (
    !elements.expertDialog
  ) {
    return;
  }

  const trip =
    state.trip;

  if (trip) {
    elements.expertTripSummary
      .innerHTML =
      `
        <strong>
          ${escapeHtml(
            trip.route.origin
              .name
          )}
          →
          ${escapeHtml(
            trip.route
              .destination.name
          )}
        </strong>
        <br>
        ${escapeHtml(
          formatDateRange(
            trip.start,
            trip.end
          )
        )}
        <br>
        ${escapeHtml(
          travellerLabel(
            trip.adults,
            trip.children
          )
        )}
      `;
  } else {
    elements.expertTripSummary
      .textContent =
      "Create a trip in the planner to prepare your consultation.";
  }

  if (
    typeof elements
      .expertDialog
      .showModal ===
    "function"
  ) {
    elements.expertDialog
      .showModal();
  }
}

/* -------------------------------------------------------------------------- */
/* ElevenLabs Assistant                                                       */
/* -------------------------------------------------------------------------- */

function openAssistant() {
  const assistant =
    state.status
      ?.client
      ?.features
      ?.assistant;

  if (!assistant) {
    showToast(
      "AI Travel Assistant is currently unavailable."
    );
    return;
  }

  const agentId =
    "agent_6601m4d2fbz3e8ks75pwep5hspee";

  const branchId =
    "agtbrch_4001m4d2fe0jegj94qv846y7vgr4";

  const url =
    new URL(
      "https://elevenlabs.io/app/talk-to"
    );

  url.searchParams.set(
    "agent_id",
    agentId
  );

  url.searchParams.set(
    "branch_id",
    branchId
  );

  const tripContext =
    buildAssistantTripContext();

  if (tripContext) {
    url.searchParams.set(
      "var_trip_context",
      tripContext
    );
  }

  window.open(
    url.toString(),
    "_blank",
    "noopener,noreferrer"
  );
}

function buildAssistantTripContext() {
  if (!state.trip) {
    return "";
  }

  const trip =
    state.trip;

  const origin =
    trip.route.origin;

  const destination =
    trip.route.destination;

  const itineraryDays =
    Array.isArray(
      state.itinerary?.days
    )
      ? state.itinerary.days
      : [];

  const itinerarySummary =
    itineraryDays
      .map(
        (day, index) => {
          const activities =
            Array.isArray(
              day?.items
            )
              ? day.items
                  .map((item) => {
                    const time =
                      clean(
                        item?.time
                      );

                    const title =
                      clean(
                        item?.title
                      );

                    return [
                      time,
                      title,
                    ]
                      .filter(Boolean)
                      .join(" ");
                  })
                  .filter(Boolean)
                  .join("; ")
              : "";

          return [
            `Day ${index + 1}`,
            clean(day?.title),
            clean(day?.area),
            activities,
          ]
            .filter(Boolean)
            .join(" | ");
        }
      )
      .join("\n");

  const input =
    trip.input ?? {};

  const interests =
    Array.isArray(
      input.interests
    )
      ? input.interests.join(", ")
      : clean(
          input.interests
        );

  const services =
    Array.isArray(
      input.services
    )
      ? input.services.join(", ")
      : clean(
          input.services
        );

  const context = [
    "CURRENT TRACKWORLD TRIP",
    `Trip: ${
      trip.tripTitle ||
      destination.name
    }`,
    `Route: ${
      origin.name
    } (${airportCode(origin) || "airport pending"}) to ${
      destination.name
    } (${airportCode(destination) || "airport pending"})`,
    `Travel dates: ${
      trip.start
    } to ${
      trip.end
    }`,
    `Duration: ${
      trip.days
    } days`,
    `Travellers: ${
      travellerLabel(
        trip.adults,
        trip.children
      )
    }`,
    trip.summary
      ? `Trip summary: ${trip.summary}`
      : "",
    input.budget
      ? `Budget: INR ${input.budget}`
      : "",
    input.budgetType
      ? `Budget type: ${input.budgetType}`
      : "",
    input.hotel
      ? `Hotel preference: ${input.hotel}`
      : "",
    input.pace
      ? `Travel pace: ${input.pace}`
      : "",
    input.occasion
      ? `Occasion: ${input.occasion}`
      : "",
    interests
      ? `Interests: ${interests}`
      : "",
    services
      ? `Requested services: ${services}`
      : "",
    input.comments
      ? `Traveller comments: ${input.comments}`
      : "",
    itinerarySummary
      ? `PLANNED ITINERARY:\n${itinerarySummary}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return context.slice(
    0,
    7000
  );
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

async function api(
  path,
  options = {}
) {
  const request = {
    method:
      options.method ??
      "GET",

    headers: {
      Accept:
        "application/json",

      ...(options.headers ??
        {}),
    },
  };

  if (
    options.body !==
    undefined
  ) {
    request.headers[
      "Content-Type"
    ] =
      "application/json";

    request.body =
      JSON.stringify(
        options.body
      );
  }

  const response =
    await fetch(
      path,
      request
    );

  let payload;

  try {
    payload =
      await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error
        ?.message ??
      payload?.message ??
      `Request failed (${response.status}).`;

    throw new Error(message);
  }

  if (
    payload?.ok === false
  ) {
    throw new Error(
      payload?.error
        ?.message ??
        "The request could not be completed."
    );
  }

  return payload;
}

function unwrap(payload) {
  if (
    payload &&
    payload.ok === true &&
    payload.data !==
      undefined
  ) {
    return payload.data;
  }

  return payload;
}

/* -------------------------------------------------------------------------- */
/* Request Helpers                                                            */
/* -------------------------------------------------------------------------- */

function locationRequestValue(
  location
) {
  if (
    !location ||
    typeof location !==
      "object"
  ) {
    return location;
  }

  const result = {
    name:
      location.name,
  };

  if (location.geoNameId) {
    result.geoNameId =
      location.geoNameId;
  }

  if (location.city) {
    result.city =
      location.city;
  }

  if (location.region) {
    result.region =
      location.region;
  }

  if (location.country) {
    result.country =
      location.country;
  }

  if (
    location.countryCode
  ) {
    result.countryCode =
      location.countryCode;
  }

  if (
    location.latitude !==
    null
  ) {
    result.latitude =
      location.latitude;
  }

  if (
    location.longitude !==
    null
  ) {
    result.longitude =
      location.longitude;
  }

  if (location.airport) {
    result.airport =
      location.airport;
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function toInteger(
  value,
  fallback = 0
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}

function numberOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function calculateDays(
  start,
  end
) {
  const startDate =
    parseDate(start);

  const endDate =
    parseDate(end);

  if (
    !startDate ||
    !endDate
  ) {
    return 1;
  }

  const difference =
    Math.round(
      (
        endDate.getTime() -
        startDate.getTime()
      ) /
        86400000
    );

  return Math.max(
    1,
    difference + 1
  );
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function formatDateRange(
  start,
  end
) {
  const first =
    parseDate(start);

  const second =
    parseDate(end);

  if (!first && !second) {
    return "Travel dates";
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );

  if (
    first &&
    second
  ) {
    return `${formatter.format(first)} – ${formatter.format(second)}`;
  }

  return formatter.format(
    first ?? second
  );
}

function shortDate(value) {
  const date =
    parseDate(value);

  if (!date) {
    return clean(value) ||
      "Day";
  }

  return new Intl
    .DateTimeFormat(
      "en-IN",
      {
        day: "numeric",
        month: "short",
      }
    )
    .format(date);
}

function travellerLabel(
  adults,
  children
) {
  const parts = [
    `${adults} ${
      adults === 1
        ? "adult"
        : "adults"
    }`,
  ];

  if (children > 0) {
    parts.push(
      `${children} ${
        children === 1
          ? "child"
          : "children"
      }`
    );
  }

  return parts.join(", ");
}

function airportCode(
  location
) {
  return clean(
    location?.airport?.iata ??
      location?.airport
        ?.iataCode ??
      location?.iata
  ).toUpperCase();
}

function airportLabel(
  location
) {
  const airport =
    location?.airport;

  if (!airport) {
    return location?.country ||
      "Airport information";
  }

  const code =
    airportCode(location);

  const name =
    clean(
      airport.name ??
        airport.airportName
    );

  if (
    code &&
    name
  ) {
    return `${code} · ${name}`;
  }

  return code ||
    name ||
    "Airport information";
}

function flightLocationLabel(
  location
) {
  const code =
    airportCode(location);

  if (code) {
    return `${location.name} (${code})`;
  }

  return location.name ||
    "—";
}

function createRouteSummary(
  trip
) {
  const origin =
    trip.route.origin.name;

  const destination =
    trip.route
      .destination.name;

  if (
    origin &&
    destination
  ) {
    return `${origin} to ${destination} · ${trip.days} ${
      trip.days === 1
        ? "day"
        : "days"
    }`;
  }

  return "Your travel plan in one place.";
}

function formatMoney(
  value,
  currency = "INR"
) {
  const number =
    extractNumericPrice(
      value
    );

  if (number === null) {
    return "View fare";
  }

  try {
    return new Intl
      .NumberFormat(
        "en-IN",
        {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }
      )
      .format(number);
  } catch {
    return `${currency} ${formatNumber(number)}`;
  }
}

function extractNumericPrice(
  value
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return extractNumericPrice(
      value.amount ??
        value.value ??
        value.extracted_value ??
        value.extracted_price
    );
  }

  if (
    typeof value ===
    "string"
  ) {
    const numeric =
      value.replace(
        /[^0-9.]/g,
        ""
      );

    if (!numeric) {
      return null;
    }

    const parsed =
      Number(numeric);

    return Number.isFinite(
      parsed
    )
      ? parsed
      : null;
  }

  return null;
}

function formatNumber(value) {
  return new Intl
    .NumberFormat(
      "en-IN",
      {
        maximumFractionDigits: 4,
      }
    )
    .format(value);
}

function timeOnly(value) {
  const text =
    clean(value);

  if (!text) {
    return "—";
  }

  const match =
    text.match(
      /(\d{1,2}:\d{2})(?:\s?[AP]M)?/i
    );

  if (match) {
    const suffix =
      text.match(
        /\b(?:AM|PM)\b/i
      );

    return `${match[1]}${
      suffix
        ? ` ${suffix[0].toUpperCase()}`
        : ""
    }`;
  }

  return text;
}

function stopLabel(flight) {
  const stops =
    flight.stops ??
    flight.stopCount ??
    flight.numberOfStops;

  if (
    Number(stops) === 0
  ) {
    return "Non-stop";
  }

  if (
    Number.isFinite(
      Number(stops)
    )
  ) {
    return `${stops} ${
      Number(stops) === 1
        ? "stop"
        : "stops"
    }`;
  }

  return "Flight";
}

function activityLabel(type) {
  const labels = {
    preparation:
      "Start",

    morning:
      "Morning",

    midday:
      "Midday",

    afternoon:
      "Afternoon",

    evening:
      "Evening",
  };

  return (
    labels[
      clean(type)
        .toLowerCase()
    ] ??
    "Activity"
  );
}

function humanCategory(
  value
) {
  const text =
    clean(value);

  if (!text) {
    return "Explore";
  }

  return text
    .split(/[._-]/)
    .filter(Boolean)
    .slice(-2)
    .map(
      (part) =>
        part.charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(" · ");
}

function formatDistance(
  metres
) {
  if (
    !Number.isFinite(
      metres
    )
  ) {
    return "";
  }

  if (metres < 1000) {
    return `${Math.round(metres)} m`;
  }

  return `${(
    metres / 1000
  ).toFixed(1)} km`;
}

/* -------------------------------------------------------------------------- */
/* Rendering Helpers                                                          */
/* -------------------------------------------------------------------------- */

function setText(
  element,
  value
) {
  if (element) {
    element.textContent =
      value ?? "";
  }
}

function notice(
  message,
  error = false
) {
  return `
    <div class="notice${
      error
        ? " error"
        : ""
    }">
      ${escapeHtml(message)}
    </div>
  `;
}

function loading(message) {
  return `
    <div class="loading-state full-width">
      <div>
        <div class="loading-spinner"></div>
        ${escapeHtml(message)}
      </div>
    </div>
  `;
}

function setButtonLoading(
  button,
  isLoading,
  label
) {
  if (!button) {
    return;
  }

  button.disabled =
    isLoading;

  button.textContent =
    label;
}

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent =
    message;

  elements.toast.classList.add(
    "visible"
  );

  window.clearTimeout(
    showToast.timer
  );

  showToast.timer =
    window.setTimeout(
      () => {
        elements.toast
          ?.classList.remove(
            "visible"
          );
      },
      2500
    );
}

function extractArray(
  source,
  keys
) {
  if (
    Array.isArray(source)
  ) {
    return source;
  }

  if (
    !source ||
    typeof source !==
      "object"
  ) {
    return [];
  }

  for (const key of keys) {
    if (
      Array.isArray(
        source[key]
      )
    ) {
      return source[key];
    }
  }

  return [];
}

function escapeHtml(value) {
  return clean(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function cryptoSafeId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID ===
      "function"
  ) {
    return globalThis.crypto
      .randomUUID();
  }

  return `trip-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

/* ==========================================================================
   Return to live planner
   ========================================================================== */

document
  .getElementById(
    "backToPlanner"
  )
  ?.addEventListener(
    "click",
    event => {
      if (
        window.opener &&
        !window.opener.closed
      ) {
        event.preventDefault();

        window.opener.focus();

        window.close();
      }
    }
  );
