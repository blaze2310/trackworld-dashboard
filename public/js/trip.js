/**
 * TrackWorld AI Travel Planner
 * Shared Trip Context
 */

import {
  getActiveTrip,
  setActiveTrip,
} from "./state.js";

/* ==========================================================================
   Public API
   ========================================================================== */

export function createTripContext({
  input = {},
  itinerary = null,
  originLocation = null,
  destinationLocation = null,
} = {}) {
  const origin =
    normaliseLocation(
      originLocation ??
        itinerary?.originLocation ??
        input?.originLocation ??
        input?.origin
    );

  const destination =
    normaliseLocation(
      destinationLocation ??
        itinerary?.destinationLocation ??
        input?.destinationLocation ??
        input?.destination
    );

  const start =
    clean(
      input?.start ??
        input?.startDate ??
        itinerary?.start ??
        itinerary?.startDate
    );

  const end =
    clean(
      input?.end ??
        input?.endDate ??
        itinerary?.end ??
        itinerary?.endDate
    );

  const adults =
    integer(
      input?.adults ??
        itinerary?.adults,
      1
    );

  const children =
    integer(
      input?.children ??
        itinerary?.children,
      0
    );

  const itineraryDays =
    Array.isArray(
      itinerary?.days
    )
      ? itinerary.days.length
      : 0;

  const days =
    itineraryDays ||
    calculateInclusiveDays(
      start,
      end
    );

  return {
    version: 1,

    createdAt:
      Date.now(),

    input: {
      ...input,

      origin:
        origin.name ||
        clean(input?.origin),

      destination:
        destination.name ||
        clean(
          input?.destination
        ),

      start,
      end,
      adults,
      children,
    },

    originLocation:
      origin,

    destinationLocation:
      destination,

    route: {
      origin,
      destination,
    },

    start,
    end,

    travellers: {
      adults,
      children,
      total:
        adults + children,
    },

    adults,
    children,

    days:
      Math.max(
        1,
        days
      ),

    tripTitle:
      clean(
        itinerary?.tripTitle
      ),

    summary:
      clean(
        itinerary?.summary
      ),

    itinerary,
  };
}

export function saveActiveTripContext(
  context
) {
  if (!context) {
    return false;
  }

  return setActiveTrip(
    context
  );
}

export function loadActiveTripContext() {
  const stored =
    getActiveTrip();

  if (!stored) {
    return null;
  }

  return normaliseTripContext(
    stored
  );
}

export function normaliseTripContext(
  raw
) {
  if (!raw) {
    return null;
  }

  const itinerary =
    raw.itinerary ??
    raw.result ??
    raw.data?.itinerary ??
    raw.data ??
    null;

  const input =
    raw.input ??
    itinerary?.input ??
    {};

  const origin =
    normaliseLocation(
      raw.originLocation ??
        raw.route?.origin ??
        itinerary?.originLocation ??
        input?.originLocation ??
        input?.origin ??
        raw.origin
    );

  const destination =
    normaliseLocation(
      raw.destinationLocation ??
        raw.route
          ?.destination ??
        itinerary
          ?.destinationLocation ??
        input
          ?.destinationLocation ??
        input?.destination ??
        raw.destination
    );

  const start =
    clean(
      raw.start ??
        input.start ??
        input.startDate ??
        itinerary?.start ??
        itinerary?.startDate
    );

  const end =
    clean(
      raw.end ??
        input.end ??
        input.endDate ??
        itinerary?.end ??
        itinerary?.endDate
    );

  const adults =
    integer(
      raw.travellers?.adults ??
        raw.traveller?.adults ??
        raw.adults ??
        input.adults ??
        itinerary?.adults,
      1
    );

  const children =
    integer(
      raw.travellers?.children ??
        raw.traveller?.children ??
        raw.children ??
        input.children ??
        itinerary?.children,
      0
    );

  const itineraryDays =
    Array.isArray(
      itinerary?.days
    )
      ? itinerary.days.length
      : 0;

  const days =
    integer(
      raw.days,
      itineraryDays ||
        calculateInclusiveDays(
          start,
          end
        )
    );

  return {
    ...raw,

    version:
      raw.version ?? 1,

    input: {
      ...input,

      origin:
        origin.name ||
        clean(input.origin),

      destination:
        destination.name ||
        clean(
          input.destination
        ),

      start,
      end,
      adults,
      children,
    },

    originLocation:
      origin,

    destinationLocation:
      destination,

    route: {
      origin,
      destination,
    },

    start,
    end,

    travellers: {
      adults,
      children,
      total:
        adults + children,
    },

    adults,
    children,

    days:
      Math.max(
        1,
        days
      ),

    tripTitle:
      clean(
        raw.tripTitle ??
          itinerary?.tripTitle
      ),

    summary:
      clean(
        raw.summary ??
          itinerary?.summary
      ),

    itinerary,
  };
}

/* ==========================================================================
   Location
   ========================================================================== */

export function normaliseLocation(
  value
) {
  if (
    typeof value === "string"
  ) {
    return {
      name:
        clean(value),

      country: "",
      countryCode: "",

      latitude: null,
      longitude: null,

      airport: null,
    };
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return {
      name: "",
      country: "",
      countryCode: "",

      latitude: null,
      longitude: null,

      airport: null,
    };
  }

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

export function locationForApi(
  location
) {
  const normalised =
    normaliseLocation(
      location
    );

  if (
    !normalised.name
  ) {
    return "";
  }

  const result = {
    name:
      normalised.name,
  };

  if (
    normalised.country
  ) {
    result.country =
      normalised.country;
  }

  if (
    normalised.countryCode
  ) {
    result.countryCode =
      normalised.countryCode;
  }

  if (
    normalised.latitude !==
    null
  ) {
    result.latitude =
      normalised.latitude;
  }

  if (
    normalised.longitude !==
    null
  ) {
    result.longitude =
      normalised.longitude;
  }

  if (
    normalised.airport
  ) {
    result.airport =
      normalised.airport;
  }

  return result;
}

/* ==========================================================================
   Airport
   ========================================================================== */

export function airportCode(
  location
) {
  const normalised =
    normaliseLocation(
      location
    );

  return clean(
    normalised.airport?.iata ??
      normalised.airport
        ?.iataCode ??
      normalised.iata ??
      normalised.iataCode
  ).toUpperCase();
}

export function airportName(
  location
) {
  const normalised =
    normaliseLocation(
      location
    );

  return clean(
    normalised.airport?.name ??
      normalised.airport
        ?.airportName
  );
}

export function airportLabel(
  location
) {
  const code =
    airportCode(
      location
    );

  const name =
    airportName(
      location
    );

  if (code && name) {
    return `${code} · ${name}`;
  }

  if (code) {
    return code;
  }

  if (name) {
    return name;
  }

  const normalised =
    normaliseLocation(
      location
    );

  return (
    normalised.country ||
    ""
  );
}

/* ==========================================================================
   Dates
   ========================================================================== */

export function calculateInclusiveDays(
  start,
  end
) {
  const first =
    parseDate(start);

  const last =
    parseDate(end);

  if (
    !first ||
    !last
  ) {
    return 1;
  }

  const difference =
    Math.round(
      (
        last.getTime() -
        first.getTime()
      ) /
        86400000
    );

  return Math.max(
    1,
    difference + 1
  );
}

export function formatTripDates(
  start,
  end
) {
  const first =
    parseDate(start);

  const last =
    parseDate(end);

  if (
    !first &&
    !last
  ) {
    return "";
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
    last
  ) {
    return `${formatter.format(first)} – ${formatter.format(last)}`;
  }

  return formatter.format(
    first ?? last
  );
}

/* ==========================================================================
   Travellers
   ========================================================================== */

export function travellerLabel(
  adults = 1,
  children = 0
) {
  const adultCount =
    integer(
      adults,
      1
    );

  const childCount =
    integer(
      children,
      0
    );

  const parts = [
    `${adultCount} ${
      adultCount === 1
        ? "adult"
        : "adults"
    }`,
  ];

  if (
    childCount > 0
  ) {
    parts.push(
      `${childCount} ${
        childCount === 1
          ? "child"
          : "children"
      }`
    );
  }

  return parts.join(", ");
}

/* ==========================================================================
   Trip Summary
   ========================================================================== */

export function tripRouteLabel(
  context
) {
  const trip =
    normaliseTripContext(
      context
    );

  if (!trip) {
    return "";
  }

  const origin =
    trip.route.origin.name;

  const destination =
    trip.route
      .destination.name;

  if (
    origin &&
    destination
  ) {
    return `${origin} → ${destination}`;
  }

  return (
    destination ||
    origin ||
    ""
  );
}

export function tripSummaryLabel(
  context
) {
  const trip =
    normaliseTripContext(
      context
    );

  if (!trip) {
    return "";
  }

  const parts = [];

  const route =
    tripRouteLabel(
      trip
    );

  if (route) {
    parts.push(route);
  }

  const dates =
    formatTripDates(
      trip.start,
      trip.end
    );

  if (dates) {
    parts.push(dates);
  }

  parts.push(
    `${trip.days} ${
      trip.days === 1
        ? "day"
        : "days"
    }`
  );

  parts.push(
    travellerLabel(
      trip.adults,
      trip.children
    )
  );

  return parts.join(" · ");
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function integer(
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

function parseDate(value) {
  const text =
    clean(value);

  if (!text) {
    return null;
  }

  const date =
    new Date(
      `${text}T00:00:00`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}