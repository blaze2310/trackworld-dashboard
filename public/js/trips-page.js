import {
  getSavedTrips,
  deleteSavedTrip,
  setActiveTrip,
} from "./state.js";

const elements = {};

document.addEventListener(
  "DOMContentLoaded",
  init
);

function init() {
  cacheElements();
  render();
  bindActions();
}

function cacheElements() {
  elements.grid =
    document.getElementById(
      "tripsGrid"
    );

  elements.empty =
    document.getElementById(
      "emptyState"
    );

  elements.count =
    document.getElementById(
      "savedTripCount"
    );

  elements.nextDestination =
    document.getElementById(
      "nextDestination"
    );

  elements.nextJourneyDate =
    document.getElementById(
      "nextJourneyDate"
    );

  elements.toast =
    document.getElementById(
      "toast"
    );
}

function bindActions() {
  elements.grid
    ?.addEventListener(
      "click",
      event => {
        const openButton =
          event.target.closest(
            "[data-open-trip]"
          );

        if (openButton) {
          openTrip(
            openButton.dataset
              .openTrip
          );

          return;
        }

        const deleteButton =
          event.target.closest(
            "[data-delete-trip]"
          );

        if (deleteButton) {
          removeTrip(
            deleteButton.dataset
              .deleteTrip
          );
        }
      }
    );
}

function render() {
  const trips =
    getSavedTrips()
      .slice()
      .sort(
        (a, b) =>
          Number(
            b.savedAt ?? 0
          ) -
          Number(
            a.savedAt ?? 0
          )
      );

  elements.count.textContent =
    String(trips.length);

  renderNextJourney(trips);

  if (!trips.length) {
    elements.grid.innerHTML =
      "";

    elements.empty.hidden =
      false;

    return;
  }

  elements.empty.hidden =
    true;

  elements.grid.innerHTML =
    trips
      .map(renderTripCard)
      .join("");
}

function renderTripCard(record) {
  const trip =
    extractTrip(record);

  const itinerary =
    trip?.itinerary ??
    trip?.result ??
    trip?.data ??
    trip;

  const input =
    trip?.input ??
    itinerary?.input ??
    {};

  const route =
    trip?.route ??
    itinerary?.route ??
    {};

  const origin =
    normaliseLocation(
      route?.origin ??
      trip?.originLocation ??
      input?.originLocation ??
      input?.origin ??
      record?.origin
    );

  const destination =
    normaliseLocation(
      route?.destination ??
      trip?.destinationLocation ??
      input?.destinationLocation ??
      input?.destination ??
      record?.destination
    );

  const title =
    clean(
      record?.title ??
      itinerary?.tripTitle ??
      trip?.tripTitle
    ) ||
    (
      destination.name
        ? `${destination.name} journey`
        : "Saved journey"
    );

  const start =
    record?.start ??
    trip?.start ??
    input?.start ??
    input?.startDate ??
    "";

  const end =
    record?.end ??
    trip?.end ??
    input?.end ??
    input?.endDate ??
    "";

  const adults =
    number(
      trip?.traveller?.adults ??
      trip?.adults ??
      input?.adults,
      1
    );

  const children =
    number(
      trip?.traveller?.children ??
      trip?.children ??
      input?.children,
      0
    );

  return `
    <article class="trip-card">
      <div class="trip-card-hero">
        <span>
          Saved journey
        </span>

        <h3>
          ${escapeHtml(
            destination.name ||
            title
          )}
        </h3>

        <p>
          ${escapeHtml(
            formatDateRange(
              start,
              end
            )
          )}
        </p>
      </div>

      <div class="trip-card-body">
        <div class="trip-route">
          <span>
            ${escapeHtml(
              origin.name ||
              "Origin"
            )}
          </span>

          <span
            class="trip-route-arrow"
          >
            →
          </span>

          <span>
            ${escapeHtml(
              destination.name ||
              "Destination"
            )}
          </span>
        </div>

        <div class="trip-meta">
          <div>
            <span>Trip</span>

            <strong>
              ${escapeHtml(title)}
            </strong>
          </div>

          <div>
            <span>Travellers</span>

            <strong>
              ${escapeHtml(
                travellerLabel(
                  adults,
                  children
                )
              )}
            </strong>
          </div>
        </div>

        <div class="trip-actions">
          <button
            class="open-trip-button"
            type="button"
            data-open-trip="${escapeHtml(
              record.id
            )}"
          >
            Open trip
          </button>

          <button
            class="delete-trip-button"
            type="button"
            data-delete-trip="${escapeHtml(
              record.id
            )}"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderNextJourney(
  trips
) {
  const now =
    startOfToday();

  const upcoming =
    trips
      .map(record => {
        const trip =
          extractTrip(record);

        const itinerary =
          trip?.itinerary ??
          trip?.result ??
          trip?.data ??
          trip;

        const input =
          trip?.input ??
          itinerary?.input ??
          {};

        const route =
          trip?.route ??
          itinerary?.route ??
          {};

        const destination =
          normaliseLocation(
            route?.destination ??
            trip
              ?.destinationLocation ??
            input
              ?.destinationLocation ??
            input?.destination ??
            record?.destination
          );

        const start =
          record?.start ??
          trip?.start ??
          input?.start ??
          input?.startDate ??
          "";

        const date =
          parseDate(start);

        return {
          record,
          destination,
          start,
          date,
        };
      })
      .filter(
        item =>
          item.date &&
          item.date >= now
      )
      .sort(
        (a, b) =>
          a.date - b.date
      )[0];

  if (!upcoming) {
    elements.nextDestination
      .textContent =
      "—";

    elements.nextJourneyDate
      .textContent =
      "No upcoming journey";

    return;
  }

  elements.nextDestination
    .textContent =
    upcoming.destination.name ||
    "Upcoming trip";

  elements.nextJourneyDate
    .textContent =
    formatDate(
      upcoming.start
    );
}

function openTrip(id) {
  const record =
    getSavedTrips()
      .find(
        item =>
          String(item.id) ===
          String(id)
      );

  if (!record) {
    showToast(
      "Saved trip could not be found."
    );

    return;
  }

  const trip =
    extractTrip(record);

  if (!trip) {
    showToast(
      "This saved trip cannot be opened."
    );

    return;
  }

  const saved =
    setActiveTrip(trip);

  if (!saved) {
    showToast(
      "Trip could not be opened."
    );

    return;
  }

  window.location.href =
    "/trip.html";
}

function removeTrip(id) {
  const record =
    getSavedTrips()
      .find(
        item =>
          String(item.id) ===
          String(id)
      );

  if (!record) {
    return;
  }

  const trip =
    extractTrip(record);

  const destination =
    destinationName(trip) ||
    "this trip";

  const confirmed =
    window.confirm(
      `Delete ${destination}?`
    );

  if (!confirmed) {
    return;
  }

  const deleted =
    deleteSavedTrip(id);

  if (!deleted) {
    showToast(
      "Trip could not be deleted."
    );

    return;
  }

  showToast(
    "Trip deleted."
  );

  render();
}

function extractTrip(record) {
  return (
    record?.trip ??
    record?.data?.trip ??
    record ??
    null
  );
}

function destinationName(trip) {
  const itinerary =
    trip?.itinerary ??
    trip?.result ??
    trip?.data ??
    trip;

  const input =
    trip?.input ??
    itinerary?.input ??
    {};

  const route =
    trip?.route ??
    itinerary?.route ??
    {};

  return normaliseLocation(
    route?.destination ??
    trip?.destinationLocation ??
    input?.destinationLocation ??
    input?.destination
  ).name;
}

function normaliseLocation(
  value
) {
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
    };
  }

  return {
    name:
      clean(value),

    country: "",
  };
}

function travellerLabel(
  adults,
  children
) {
  const parts = [];

  if (adults) {
    parts.push(
      `${adults} ${
        adults === 1
          ? "adult"
          : "adults"
      }`
    );
  }

  if (children) {
    parts.push(
      `${children} ${
        children === 1
          ? "child"
          : "children"
      }`
    );
  }

  return (
    parts.join(", ") ||
    "Travellers"
  );
}

function formatDateRange(
  start,
  end
) {
  if (!start && !end) {
    return "Travel dates";
  }

  if (!end || start === end) {
    return formatDate(start);
  }

  return `${formatDate(
    start
  )} – ${formatDate(end)}`;
}

function formatDate(value) {
  const date =
    parseDate(value);

  if (!date) {
    return clean(value) ||
      "Travel dates";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
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

function startOfToday() {
  const date =
    new Date();

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date;
}

function number(
  value,
  fallback = 0
) {
  const result =
    Number(value);

  return Number.isFinite(result)
    ? result
    : fallback;
}

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

let toastTimer = null;

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent =
    message;

  elements.toast.classList
    .add("show");

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(
      () => {
        elements.toast
          ?.classList
          .remove("show");
      },
      2400
    );
}