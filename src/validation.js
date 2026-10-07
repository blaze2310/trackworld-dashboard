/**
 * TrackWorld AI Travel Planner
 * Validation and sanitisation layer
 *
 * IMPORTANT:
 * The existing TrackWorld frontend contract is preserved:
 *
 * {
 *   type,
 *   origin,
 *   destination,
 *   start,
 *   end,
 *   adults,
 *   children,
 *   budget,
 *   budgetType,
 *   occasion,
 *   hotel,
 *   pace,
 *   interests,
 *   services,
 *   comments
 * }
 *
 * New TrackWorld services may additionally pass enriched
 * location objects containing coordinates, airport and country data.
 */

/* -------------------------------------------------------------------------- */
/*                                   Limits                                   */
/* -------------------------------------------------------------------------- */

export const LIMITS = Object.freeze({
  maxTripDays: 30,

  minAdults: 1,
  maxAdults: 100,

  minChildren: 0,
  maxChildren: 100,

  minBudget: 1000,
  maxBudget: 100_000_000,

  maxLocationLength: 100,
  maxCommentsLength: 2000,

  maxPreferenceLength: 100,
  maxPreferenceItems: 30,

  minPlaceQueryLength: 2,
  maxPlaceQueryLength: 100,

  defaultPlaceLimit: 8,
  maxPlaceLimit: 20,
});

/* -------------------------------------------------------------------------- */
/*                              Allowed Values                                */
/* -------------------------------------------------------------------------- */

const TRIP_TYPES =
  new Set([
    "Domestic",
    "International",
  ]);

const BUDGET_TYPES =
  new Set([
    "total",
    "person",
  ]);

const PACES =
  new Set([
    "Balanced",
    "Relaxed",
    "Activity-packed",
  ]);

/*
 * These values correspond to the current frontend.
 * We intentionally do not make occasion/hotel/interests/services
 * strict enums because the final frontend may expand those choices.
 */

/* -------------------------------------------------------------------------- */
/*                              Validation Error                              */
/* -------------------------------------------------------------------------- */

export class ValidationError extends Error {
  constructor(
    message,
    {
      code = "VALIDATION_ERROR",
      field = null,
      status = 400,
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "ValidationError";

    this.code =
      code;

    this.field =
      field;

    this.status =
      status;

    this.details =
      details;
  }
}

/* -------------------------------------------------------------------------- */
/*                              Basic Helpers                                 */
/* -------------------------------------------------------------------------- */

export function isPlainObject(
  value
) {
  return Boolean(
    value &&
      typeof value ===
        "object" &&
      !Array.isArray(value)
  );
}

export function cleanString(
  value,
  options = {}
) {
  const {
    maxLength = 500,
    fallback = "",
    trim = true,
  } = options;

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  let result =
    String(value);

  if (trim) {
    result =
      result.trim();
  }

  /*
   * Remove null bytes and other control characters
   * while preserving normal spaces and line breaks.
   */
  result =
    result.replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
      ""
    );

  if (
    Number.isFinite(maxLength) &&
    maxLength >= 0
  ) {
    result =
      result.slice(
        0,
        maxLength
      );
  }

  return result;
}

export function cleanSingleLine(
  value,
  options = {}
) {
  return cleanString(
    value,
    options
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

export function cleanStringArray(
  value,
  options = {}
) {
  const {
    maxItems =
      LIMITS.maxPreferenceItems,

    maxLength =
      LIMITS.maxPreferenceLength,
  } = options;

  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  const seen =
    new Set();

  const output =
    [];

  for (
    const item of value
  ) {
    const cleaned =
      cleanSingleLine(
        item,
        {
          maxLength,
        }
      );

    if (
      !cleaned ||
      seen.has(cleaned)
    ) {
      continue;
    }

    seen.add(cleaned);
    output.push(cleaned);

    if (
      output.length >=
      maxItems
    ) {
      break;
    }
  }

  return output;
}

export function toInteger(
  value,
  {
    fallback = null,
    min = null,
    max = null,
  } = {}
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    !Number.isInteger(number)
  ) {
    return fallback;
  }

  if (
    min !== null &&
    number < min
  ) {
    return fallback;
  }

  if (
    max !== null &&
    number > max
  ) {
    return fallback;
  }

  return number;
}

export function toNumber(
  value,
  {
    fallback = null,
    min = null,
    max = null,
  } = {}
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  if (
    min !== null &&
    number < min
  ) {
    return fallback;
  }

  if (
    max !== null &&
    number > max
  ) {
    return fallback;
  }

  return number;
}

export function toBoolean(
  value,
  fallback = false
) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value !== 0;
  }

  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/*                                  Dates                                     */
/* -------------------------------------------------------------------------- */

export function isIsoDate(
  value
) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "")
  );
}

export function parseIsoDate(
  value
) {
  if (
    !isIsoDate(value)
  ) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12,
        0,
        0
      )
    );

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    return null;
  }

  return date;
}

export function todayIso() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

export function differenceInDays(
  start,
  end
) {
  const startDate =
    typeof start ===
    "string"
      ? parseIsoDate(start)
      : start;

  const endDate =
    typeof end ===
    "string"
      ? parseIsoDate(end)
      : end;

  if (
    !(startDate instanceof Date) ||
    Number.isNaN(
      startDate.getTime()
    ) ||
    !(endDate instanceof Date) ||
    Number.isNaN(
      endDate.getTime()
    )
  ) {
    return null;
  }

  return Math.round(
    (
      endDate.getTime() -
      startDate.getTime()
    ) /
      86_400_000
  );
}

/**
 * The current TrackWorld frontend treats both
 * departure and return date as itinerary days.
 *
 * Example:
 * 1 Oct -> 5 Oct = 5 itinerary days.
 */
export function tripDayCount(
  startOrTrip,
  maybeEnd
) {
  let start =
    startOrTrip;

  let end =
    maybeEnd;

  if (
    isPlainObject(
      startOrTrip
    )
  ) {
    start =
      startOrTrip.start ??
      startOrTrip.startDate;

    end =
      startOrTrip.end ??
      startOrTrip.endDate;
  }

  const difference =
    differenceInDays(
      start,
      end
    );

  if (
    difference === null
  ) {
    return 0;
  }

  return difference + 1;
}

/* -------------------------------------------------------------------------- */
/*                              Location Objects                              */
/* -------------------------------------------------------------------------- */

export function sanitiseAirport(
  value
) {
  if (
    !isPlainObject(value)
  ) {
    return null;
  }

  const iata =
    cleanSingleLine(
      value.iata ||
        value.iataCode ||
        value.code,
      {
        maxLength: 3,
      }
    ).toUpperCase();

  const name =
    cleanSingleLine(
      value.name,
      {
        maxLength: 150,
      }
    );

  if (
    !iata &&
    !name
  ) {
    return null;
  }

  return {
    ...(iata
      ? {
          iata,
        }
      : {}),

    ...(name
      ? {
          name,
        }
      : {}),

    ...(value.type
      ? {
          type:
            cleanSingleLine(
              value.type,
              {
                maxLength: 50,
              }
            ),
        }
      : {}),

    ...(typeof value.scheduledService ===
      "boolean"
      ? {
          scheduledService:
            value.scheduledService,
        }
      : {}),

    ...(Number.isFinite(
      Number(value.latitude)
    )
      ? {
          latitude:
            Number(
              value.latitude
            ),
        }
      : {}),

    ...(Number.isFinite(
      Number(value.longitude)
    )
      ? {
          longitude:
            Number(
              value.longitude
            ),
        }
      : {}),

    ...(Number.isFinite(
      Number(value.distanceKm)
    )
      ? {
          distanceKm:
            Number(
              value.distanceKm
            ),
        }
      : {}),
  };
}

export function sanitiseLocation(
  value
) {
  /*
   * Existing frontend sends plain city names.
   */
  if (
    typeof value ===
    "string"
  ) {
    const name =
      cleanSingleLine(
        value,
        {
          maxLength:
            LIMITS.maxLocationLength,
        }
      );

    return name
      ? {
          name,
        }
      : null;
  }

  /*
   * Final TrackWorld modules can send the
   * enriched location object instead.
   */
  if (
    !isPlainObject(value)
  ) {
    return null;
  }

  const name =
    cleanSingleLine(
      value.name ||
        value.city ||
        value.asciiName,
      {
        maxLength:
          LIMITS.maxLocationLength,
      }
    );

  if (!name) {
    return null;
  }

  const latitude =
    toNumber(
      value.latitude ??
        value.lat,
      {
        min: -90,
        max: 90,
      }
    );

  const longitude =
    toNumber(
      value.longitude ??
        value.lon ??
        value.lng,
      {
        min: -180,
        max: 180,
      }
    );

  const countryCode =
    cleanSingleLine(
      value.countryCode,
      {
        maxLength: 2,
      }
    ).toUpperCase();

  const country =
    cleanSingleLine(
      value.country,
      {
        maxLength: 100,
      }
    );

  const region =
    cleanSingleLine(
      value.region ||
        value.adminName,
      {
        maxLength: 100,
      }
    );

  const geoNameId =
    toInteger(
      value.geoNameId ??
        value.geonameId ??
        value.id,
      {
        min: 1,
      }
    );

  const airport =
    sanitiseAirport(
      value.airport
    );

  return {
    name,

    ...(region
      ? {
          region,
        }
      : {}),

    ...(country
      ? {
          country,
        }
      : {}),

    ...(countryCode
      ? {
          countryCode,
        }
      : {}),

    ...(geoNameId
      ? {
          geoNameId,
        }
      : {}),

    ...(latitude !== null
      ? {
          latitude,
        }
      : {}),

    ...(longitude !== null
      ? {
          longitude,
        }
      : {}),

    ...(airport
      ? {
          airport,
        }
      : {}),

    ...(value.currency
      ? {
          currency:
            cleanSingleLine(
              value.currency,
              {
                maxLength: 3,
              }
            ).toUpperCase(),
        }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/*                        Traveller Preference Object                         */
/* -------------------------------------------------------------------------- */

export function sanitiseTravellerPreferences(
  value = {}
) {
  if (
    !isPlainObject(value)
  ) {
    value = {};
  }

  return {
    adults:
      toInteger(
        value.adults,
        {
          fallback: 1,
          min:
            LIMITS.minAdults,
          max:
            LIMITS.maxAdults,
        }
      ),

    children:
      toInteger(
        value.children,
        {
          fallback: 0,
          min:
            LIMITS.minChildren,
          max:
            LIMITS.maxChildren,
        }
      ),

    budget:
      toNumber(
        value.budget,
        {
          fallback: null,
          min:
            LIMITS.minBudget,
          max:
            LIMITS.maxBudget,
        }
      ),

    budgetType:
      BUDGET_TYPES.has(
        value.budgetType
      )
        ? value.budgetType
        : "total",

    occasion:
      cleanSingleLine(
        value.occasion,
        {
          maxLength: 100,
        }
      ),

    hotel:
      cleanSingleLine(
        value.hotel ??
          value.stayPreference,
        {
          maxLength: 100,
        }
      ),

    pace:
      PACES.has(
        value.pace
      )
        ? value.pace
        : "Balanced",

    interests:
      cleanStringArray(
        value.interests
      ),

    services:
      cleanStringArray(
        value.services
      ),

    comments:
      cleanString(
        value.comments ??
          value.additionalRequirements,
        {
          maxLength:
            LIMITS.maxCommentsLength,
        }
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                          Existing Trip Validation                          */
/* -------------------------------------------------------------------------- */

export function validateTripRequest(
  payload
) {
  if (
    !isPlainObject(payload)
  ) {
    throw new ValidationError(
      "Invalid trip request."
    );
  }

  const type =
    cleanSingleLine(
      payload.type ??
        payload.tripType,
      {
        maxLength: 20,
      }
    );

  if (
    !TRIP_TYPES.has(type)
  ) {
    throw new ValidationError(
      "Select either Domestic or International travel.",
      {
        field: "type",
      }
    );
  }

  const originLocation =
    sanitiseLocation(
      payload.origin
    );

  const destinationLocation =
    sanitiseLocation(
      payload.destination
    );

  if (
    !originLocation?.name ||
    !destinationLocation?.name
  ) {
    throw new ValidationError(
      "Please enter both your departure city and destination.",
      {
        field:
          !originLocation?.name
            ? "origin"
            : "destination",
      }
    );
  }

  const start =
    cleanSingleLine(
      payload.start ??
        payload.startDate,
      {
        maxLength: 10,
      }
    );

  const end =
    cleanSingleLine(
      payload.end ??
        payload.endDate,
      {
        maxLength: 10,
      }
    );

  if (
    !parseIsoDate(start) ||
    !parseIsoDate(end)
  ) {
    throw new ValidationError(
      "Please select your travel dates.",
      {
        field: "dates",
      }
    );
  }

  const days =
    tripDayCount(
      start,
      end
    );

  if (
    days < 1
  ) {
    throw new ValidationError(
      "The return date must be the same as or later than the departure date.",
      {
        field: "end",
      }
    );
  }

  if (
    days >
    LIMITS.maxTripDays
  ) {
    throw new ValidationError(
      `This planner supports trips of up to ${LIMITS.maxTripDays} days.`,
      {
        field: "end",
      }
    );
  }

  const preferences =
    sanitiseTravellerPreferences(
      payload
    );

  if (
    !Number.isInteger(
      preferences.adults
    ) ||
    preferences.adults <
      LIMITS.minAdults
  ) {
    throw new ValidationError(
      "At least one adult is required.",
      {
        field: "adults",
      }
    );
  }

  if (
    !Number.isInteger(
      preferences.children
    ) ||
    preferences.children <
      LIMITS.minChildren
  ) {
    throw new ValidationError(
      "Enter a valid number of children.",
      {
        field: "children",
      }
    );
  }

  if (
    !Number.isFinite(
      preferences.budget
    ) ||
    preferences.budget <
      LIMITS.minBudget
  ) {
    throw new ValidationError(
      "Enter a budget of at least ₹1,000.",
      {
        field: "budget",
      }
    );
  }

  /*
   * If the request already contains canonical location
   * metadata, enforce Domestic mode server-side as well.
   *
   * Plain legacy city strings are resolved by location-data.js
   * before the final Domestic check in routes.js.
   */
  if (
    type ===
      "Domestic" &&
    originLocation.countryCode &&
    originLocation.countryCode !==
      "IN"
  ) {
    throw new ValidationError(
      "Domestic trips require an Indian departure city.",
      {
        field: "origin",
      }
    );
  }

  if (
    type ===
      "Domestic" &&
    destinationLocation.countryCode &&
    destinationLocation.countryCode !==
      "IN"
  ) {
    throw new ValidationError(
      "Domestic trips require an Indian destination.",
      {
        field:
          "destination",
      }
    );
  }

  /*
   * IMPORTANT:
   * Return the current frontend names.
   *
   * This is deliberate compatibility with public/app.js.
   */
  return {
    type,

    origin:
      originLocation.name,

    destination:
      destinationLocation.name,

    start,

    end,

    adults:
      preferences.adults,

    children:
      preferences.children,

    budget:
      preferences.budget,

    budgetType:
      preferences.budgetType,

    occasion:
      preferences.occasion,

    hotel:
      preferences.hotel,

    pace:
      preferences.pace,

    interests:
      preferences.interests,

    services:
      preferences.services,

    comments:
      preferences.comments,

    /*
     * Keep enriched objects separately.
     * They are ignored by the current frontend but are
     * available to the final backend architecture.
     */
    originLocation,

    destinationLocation,

    days,
  };
}

/* -------------------------------------------------------------------------- */
/*                               Flight Search                                */
/* -------------------------------------------------------------------------- */

export function validateFlightRequest(
  payload
) {
  if (
    !isPlainObject(payload)
  ) {
    throw new ValidationError(
      "Invalid flight search request."
    );
  }

  const origin =
    sanitiseLocation(
      payload.origin
    );

  const destination =
    sanitiseLocation(
      payload.destination
    );

  if (
    !origin ||
    !destination
  ) {
    throw new ValidationError(
      "Origin and destination are required for flight search."
    );
  }

  const departureDate =
    cleanSingleLine(
      payload.departureDate ??
        payload.start,
      {
        maxLength: 10,
      }
    );

  const returnDate =
    cleanSingleLine(
      payload.returnDate ??
        payload.end,
      {
        maxLength: 10,
      }
    );

  if (
    !parseIsoDate(
      departureDate
    )
  ) {
    throw new ValidationError(
      "A valid departure date is required.",
      {
        field:
          "departureDate",
      }
    );
  }

  if (
    returnDate &&
    !parseIsoDate(returnDate)
  ) {
    throw new ValidationError(
      "Enter a valid return date.",
      {
        field:
          "returnDate",
      }
    );
  }

  if (
    returnDate &&
    differenceInDays(
      departureDate,
      returnDate
    ) < 0
  ) {
    throw new ValidationError(
      "The return date cannot be before the departure date.",
      {
        field:
          "returnDate",
      }
    );
  }

  const adults =
    toInteger(
      payload.adults,
      {
        fallback: 1,
        min: 1,
        max: 9,
      }
    );

  const children =
    toInteger(
      payload.children,
      {
        fallback: 0,
        min: 0,
        max: 8,
      }
    );

  return {
    origin,
    destination,
    departureDate,

    ...(returnDate
      ? {
          returnDate,
        }
      : {}),

    adults,
    children,

    travelClass:
      cleanSingleLine(
        payload.travelClass,
        {
          maxLength: 30,
          fallback:
            "Economy",
        }
      ),

    currency:
      cleanSingleLine(
        payload.currency,
        {
          maxLength: 3,
          fallback: "INR",
        }
      ).toUpperCase(),
  };
}

/* -------------------------------------------------------------------------- */
/*                                Stay Search                                 */
/* -------------------------------------------------------------------------- */

export function validateStayRequest(
  payload
) {
  if (
    !isPlainObject(payload)
  ) {
    throw new ValidationError(
      "Invalid stay search request."
    );
  }

  const destination =
    sanitiseLocation(
      payload.destination
    );

  if (!destination) {
    throw new ValidationError(
      "A destination is required for stay search.",
      {
        field:
          "destination",
      }
    );
  }

  const checkIn =
    cleanSingleLine(
      payload.checkIn ??
        payload.start,
      {
        maxLength: 10,
      }
    );

  const checkOut =
    cleanSingleLine(
      payload.checkOut ??
        payload.end,
      {
        maxLength: 10,
      }
    );

  if (
    !parseIsoDate(checkIn) ||
    !parseIsoDate(checkOut)
  ) {
    throw new ValidationError(
      "Valid check-in and check-out dates are required."
    );
  }

  if (
    differenceInDays(
      checkIn,
      checkOut
    ) < 1
  ) {
    throw new ValidationError(
      "Check-out must be after check-in.",
      {
        field:
          "checkOut",
      }
    );
  }

  return {
    destination,
    checkIn,
    checkOut,

    adults:
      toInteger(
        payload.adults,
        {
          fallback: 2,
          min: 1,
          max: 20,
        }
      ),

    children:
      toInteger(
        payload.children,
        {
          fallback: 0,
          min: 0,
          max: 20,
        }
      ),

    rooms:
      toInteger(
        payload.rooms,
        {
          fallback: 1,
          min: 1,
          max: 10,
        }
      ),

    currency:
      cleanSingleLine(
        payload.currency,
        {
          maxLength: 3,
          fallback: "INR",
        }
      ).toUpperCase(),

    hotelPreference:
      cleanSingleLine(
        payload.hotelPreference ??
          payload.hotel,
        {
          maxLength: 100,
        }
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Explore Search                                */
/* -------------------------------------------------------------------------- */

export function validateExploreRequest(
  payload
) {
  if (
    !isPlainObject(payload)
  ) {
    throw new ValidationError(
      "Invalid explore request."
    );
  }

  const destination =
    sanitiseLocation(
      payload.destination
    );

  if (
    !destination
  ) {
    throw new ValidationError(
      "A destination is required.",
      {
        field:
          "destination",
      }
    );
  }

  if (
    !Number.isFinite(
      destination.latitude
    ) ||
    !Number.isFinite(
      destination.longitude
    )
  ) {
    throw new ValidationError(
      "Destination coordinates are required for nearby recommendations.",
      {
        field:
          "destination",
      }
    );
  }

  return {
    destination,

    categories:
      cleanStringArray(
        payload.categories,
        {
          maxItems: 10,
          maxLength: 80,
        }
      ),

    limit:
      toInteger(
        payload.limit,
        {
          fallback: 12,
          min: 1,
          max: 30,
        }
      ),

    radiusMeters:
      toInteger(
        payload.radiusMeters ??
          payload.radius,
        {
          fallback: 15_000,
          min: 500,
          max: 50_000,
        }
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Weather                                    */
/* -------------------------------------------------------------------------- */

export function validateWeatherRequest(
  payload
) {
  if (
    !isPlainObject(payload)
  ) {
    throw new ValidationError(
      "Invalid weather request."
    );
  }

  const destination =
    sanitiseLocation(
      payload.destination
    );

  if (
    !destination ||
    !Number.isFinite(
      destination.latitude
    ) ||
    !Number.isFinite(
      destination.longitude
    )
  ) {
    throw new ValidationError(
      "Destination coordinates are required for weather information.",
      {
        field:
          "destination",
      }
    );
  }

  const start =
    cleanSingleLine(
      payload.start ??
        payload.startDate,
      {
        maxLength: 10,
      }
    );

  const end =
    cleanSingleLine(
      payload.end ??
        payload.endDate,
      {
        maxLength: 10,
      }
    );

  if (
    !parseIsoDate(start) ||
    !parseIsoDate(end)
  ) {
    throw new ValidationError(
      "Valid travel dates are required for weather information."
    );
  }

  return {
    destination,
    start,
    end,
  };
}

/* -------------------------------------------------------------------------- */
/*                                Currency                                    */
/* -------------------------------------------------------------------------- */

export function validateCurrencyRequest(
  payload
) {
  if (
    !isPlainObject(payload)
  ) {
    throw new ValidationError(
      "Invalid currency request."
    );
  }

  const from =
    cleanSingleLine(
      payload.from ??
        "INR",
      {
        maxLength: 3,
      }
    ).toUpperCase();

  const to =
    cleanSingleLine(
      payload.to ??
        payload.currency,
      {
        maxLength: 3,
      }
    ).toUpperCase();

  const amount =
    toNumber(
      payload.amount,
      {
        fallback: 1,
        min: 0,
        max:
          1_000_000_000,
      }
    );

  if (
    !/^[A-Z]{3}$/.test(
      from
    ) ||
    !/^[A-Z]{3}$/.test(
      to
    )
  ) {
    throw new ValidationError(
      "Enter valid three-letter currency codes."
    );
  }

  return {
    from,
    to,
    amount,
  };
}

/* -------------------------------------------------------------------------- */
/*                             City Search Query                              */
/* -------------------------------------------------------------------------- */

export function validatePlaceQuery(
  input
) {
  const source =
    isPlainObject(input)
      ? input
      : {
          q: input,
        };

  const q =
    cleanSingleLine(
      source.q ??
        source.query,
      {
        maxLength:
          LIMITS.maxPlaceQueryLength,
      }
    );

  if (
    q.length <
    LIMITS.minPlaceQueryLength
  ) {
    throw new ValidationError(
      `Type at least ${LIMITS.minPlaceQueryLength} letters to search cities.`,
      {
        field: "q",
      }
    );
  }

  const mode =
    cleanSingleLine(
      source.mode,
      {
        maxLength: 20,
        fallback:
          "International",
      }
    );

  const limit =
    toInteger(
      source.limit,
      {
        fallback:
          LIMITS.defaultPlaceLimit,

        min: 1,

        max:
          LIMITS.maxPlaceLimit,
      }
    );

  return {
    q,

    mode:
      mode ===
      "Domestic"
        ? "Domestic"
        : "International",

    limit,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Gemini Prompt Formatting                          */
/* -------------------------------------------------------------------------- */

export function formatUserDataForPrompt(
  value
) {
  /*
   * Traveller-entered text is serialised as JSON rather
   * than interpolated as instructions.
   *
   * The Gemini system prompt is still responsible for
   * explicitly treating this block as untrusted user data.
   */
  return JSON.stringify(
    value,
    null,
    2
  );
}

/* -------------------------------------------------------------------------- */
/*                           Public Client Config                             */
/* -------------------------------------------------------------------------- */

export function getPublicClientConfig(
  config = {}
) {
  /*
   * Never expose API keys or provider secrets.
   *
   * This is deliberately limited to information the
   * browser may safely know.
   */
  return {
    brand:
      config.brand?.name ||
      "TrackWorld Vacations",

    company:
      config.brand?.company ||
      "TrackWorld Vacations Pvt. Ltd.",

    itinerarySchemaVersion:
      Number(
        config.itinerary
          ?.schemaVersion
      ) || 4,

    maxTripDays:
      LIMITS.maxTripDays,

    features: {
      flights:
        Boolean(
          config.providers
            ?.serpApi
            ?.enabled
        ),

      stays:
        Boolean(
          config.providers
            ?.serpApi
            ?.enabled
        ),

      explore:
        Boolean(
          config.providers
            ?.geoapify
            ?.enabled
        ),

      weather:
        true,

      currency:
        true,

      assistant:
        Boolean(
          config.elevenLabs
            ?.agentId
        ),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                             Error Formatting                               */
/* -------------------------------------------------------------------------- */

export function validationErrorResponse(
  error
) {
  if (
    error instanceof
    ValidationError
  ) {
    return {
      status:
        error.status || 400,

      body: {
        error:
          error.message,

        code:
          error.code,

        ...(error.field
          ? {
              field:
                error.field,
            }
          : {}),
      },
    };
  }

  return {
    status: 500,

    body: {
      error:
        "The request could not be processed.",
      code:
        "INTERNAL_ERROR",
    },
  };
}