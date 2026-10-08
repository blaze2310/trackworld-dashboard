/**
 * TrackWorld AI Travel Planner
 * Central application configuration
 *
 * Single source of truth for:
 * - environment variables
 * - provider configuration
 * - local data files
 * - application limits
 * - caching
 * - rate limiting
 * - network timeouts
 *
 * Secrets are never exposed to the browser.
 */

import "dotenv/config";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function envString(name, fallback = "") {
  const value = process.env[name];

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function envInteger(
  name,
  fallback,
  {
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
  } = {}
) {
  const raw = process.env[name];

  if (
    raw === undefined ||
    raw === null ||
    raw === ""
  ) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    Math.max(parsed, min),
    max
  );
}

function minutes(value) {
  return value * 60 * 1000;
}

function seconds(value) {
  return value * 1000;
}

/* -------------------------------------------------------------------------- */
/* Runtime                                                                    */
/* -------------------------------------------------------------------------- */

const NODE_ENV = envString(
  "NODE_ENV",
  "development"
);

const IS_PRODUCTION =
  NODE_ENV === "production";

const PORT = envInteger(
  "PORT",
  3000,
  {
    min: 1,
    max: 65535,
  }
);

/* -------------------------------------------------------------------------- */
/* Gemini                                                                     */
/* -------------------------------------------------------------------------- */

const AI_MODE = envString(
  "AI_MODE",
  "gemini"
);

const GEMINI_API_KEY =
  envString("GEMINI_API_KEY");

const GEMINI_MODEL =
  envString(
    "GEMINI_MODEL",
    "gemini-3.6-flash"
  );

const GEMINI_REQUEST_LIMIT =
  envInteger(
    "MAX_GEMINI_REQUESTS",
    envInteger(
      "GEMINI_REQUEST_LIMIT",
      10,
      {
        min: 1,
        max: 10000,
      }
    ),
    {
      min: 1,
      max: 10000,
    }
  );

const GEMINI_TIMEOUT_MS =
  envInteger(
    "GEMINI_TIMEOUT_MS",
    45000,
    {
      min: 5000,
      max: 120000,
    }
  );

const ITINERARY_SCHEMA_VERSION = 4;

/* -------------------------------------------------------------------------- */
/* SerpApi                                                                    */
/* -------------------------------------------------------------------------- */

const SERPAPI_API_KEY =
  envString(
    "SERPAPI_API_KEY",
    envString("SERPAPI_KEY")
  );

const SERPAPI_BASE_URL =
  envString(
    "SERPAPI_BASE_URL",
    "https://serpapi.com/search.json"
  );

const SERPAPI_TIMEOUT_MS =
  envInteger(
    "SERPAPI_TIMEOUT_MS",
    20000,
    {
      min: 3000,
      max: 60000,
    }
  );

/* -------------------------------------------------------------------------- */
/* Geoapify                                                                   */
/* -------------------------------------------------------------------------- */

const GEOAPIFY_API_KEY =
  envString("GEOAPIFY_API_KEY");

const GEOAPIFY_BASE_URL =
  envString(
    "GEOAPIFY_BASE_URL",
    "https://api.geoapify.com/v2"
  );

const GEOAPIFY_PLACES_URL =
  `${GEOAPIFY_BASE_URL.replace(/\/+$/, "")}/places`;

const GEOAPIFY_TIMEOUT_MS =
  envInteger(
    "GEOAPIFY_TIMEOUT_MS",
    15000,
    {
      min: 3000,
      max: 60000,
    }
  );

/* -------------------------------------------------------------------------- */
/* Open-Meteo                                                                 */
/* -------------------------------------------------------------------------- */

const OPEN_METEO_BASE_URL =
  envString(
    "OPEN_METEO_BASE_URL",
    "https://api.open-meteo.com/v1"
  );

const OPEN_METEO_FORECAST_URL =
  `${OPEN_METEO_BASE_URL.replace(/\/+$/, "")}/forecast`;

const OPEN_METEO_TIMEOUT_MS =
  envInteger(
    "OPEN_METEO_TIMEOUT_MS",
    15000,
    {
      min: 3000,
      max: 60000,
    }
  );

const WEATHER_FORECAST_MAX_DAYS = 16;

/* -------------------------------------------------------------------------- */
/* Frankfurter                                                                */
/* -------------------------------------------------------------------------- */

const FRANKFURTER_BASE_URL =
  envString(
    "FRANKFURTER_BASE_URL",
    "https://api.frankfurter.app"
  );

const FRANKFURTER_TIMEOUT_MS =
  envInteger(
    "FRANKFURTER_TIMEOUT_MS",
    15000,
    {
      min: 3000,
      max: 60000,
    }
  );

/* -------------------------------------------------------------------------- */
/* ElevenLabs                                                                 */
/* -------------------------------------------------------------------------- */

const ELEVENLABS_AGENT_ID =
  envString(
    "ELEVENLABS_AGENT_ID",
    "agent_6601m4d2fbz3e8ks75pwep5hspee"
  );

const ELEVENLABS_BRANCH_ID =
  envString(
    "ELEVENLABS_BRANCH_ID",
    "agtbrch_4001m4d2fe0jegj94qv846y7vgr4"
  );

const ELEVENLABS_SUPPORT_URL =
  envString(
    "ELEVENLABS_SUPPORT_URL",
    `https://elevenlabs.io/app/talk-to?agent_id=${encodeURIComponent(
      ELEVENLABS_AGENT_ID
    )}&branch_id=${encodeURIComponent(
      ELEVENLABS_BRANCH_ID
    )}`
  );

/* -------------------------------------------------------------------------- */
/* Local Data                                                                 */
/* -------------------------------------------------------------------------- */

const DATA_FILES =
  Object.freeze({
    cities:
      "data/cities.json",

    airports:
      "data/airports.json",
  });

/* -------------------------------------------------------------------------- */
/* Trip Limits                                                                */
/* -------------------------------------------------------------------------- */

const TRIP_LIMITS =
  Object.freeze({
    minDays: 1,
    maxDays: 30,

    minAdults: 1,
    maxAdults: 100,

    minChildren: 0,
    maxChildren: 100,

    minBudgetInr: 1000,
    maxBudgetInr: 100000000,

    maxRequirementsLength: 2000,

    maxInterests: 30,
    maxServices: 30,
  });

/* -------------------------------------------------------------------------- */
/* Search Limits                                                              */
/* -------------------------------------------------------------------------- */

const SEARCH_LIMITS =
  Object.freeze({
    citySuggestions: 8,
    maxCitySuggestions: 20,

    flightResults: 8,
    stayResults: 10,

    attractionResults: 12,
    restaurantResults: 12,
    shoppingResults: 10,
    experienceResults: 10,

    savedPlacesPerCategory: 50,
  });

/* -------------------------------------------------------------------------- */
/* Airport Matching                                                           */
/* -------------------------------------------------------------------------- */

const AIRPORT_SETTINGS =
  Object.freeze({
    preferredRadiusKm: 120,
    extendedRadiusKm: 300,

    preferredTypes: [
      "large_airport",
      "medium_airport",
    ],
  });

/* -------------------------------------------------------------------------- */
/* Cache TTL                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_CACHE_TTL_MINUTES =
  envInteger(
    "CACHE_TTL_MINUTES",
    1440,
    {
      min: 1,
      max: 10080,
    }
  );

const CACHE_TTL =
  Object.freeze({
    itinerary:
      minutes(
        envInteger(
          "ITINERARY_CACHE_TTL_MINUTES",
          1440,
          {
            min: 1,
            max: 10080,
          }
        )
      ),

    flights:
      minutes(
        envInteger(
          "FLIGHT_CACHE_TTL_MINUTES",
          15,
          {
            min: 1,
            max: 1440,
          }
        )
      ),

    stays:
      minutes(
        envInteger(
          "STAY_CACHE_TTL_MINUTES",
          30,
          {
            min: 1,
            max: 1440,
          }
        )
      ),

    explore:
      minutes(
        envInteger(
          "EXPLORE_CACHE_TTL_MINUTES",
          1440,
          {
            min: 1,
            max: 10080,
          }
        )
      ),

    weather:
      minutes(
        envInteger(
          "WEATHER_CACHE_TTL_MINUTES",
          60,
          {
            min: 1,
            max: 1440,
          }
        )
      ),

    currency:
      minutes(
        envInteger(
          "CURRENCY_CACHE_TTL_MINUTES",
          360,
          {
            min: 1,
            max: 10080,
          }
        )
      ),

    default:
      minutes(
        DEFAULT_CACHE_TTL_MINUTES
      ),
  });

/* -------------------------------------------------------------------------- */
/* Rate Limiting                                                              */
/* -------------------------------------------------------------------------- */

const RATE_LIMIT =
  Object.freeze({
    windowMs:
      minutes(
        envInteger(
          "RATE_LIMIT_WINDOW_MINUTES",
          1,
          {
            min: 1,
            max: 60,
          }
        )
      ),

    maxRequests:
      envInteger(
        "RATE_LIMIT_MAX_REQUESTS",
        120,
        {
          min: 10,
          max: 10000,
        }
      ),

    aiWindowMs:
      minutes(
        envInteger(
          "AI_RATE_LIMIT_WINDOW_MINUTES",
          10,
          {
            min: 1,
            max: 1440,
          }
        )
      ),

    aiMaxRequests:
      envInteger(
        "AI_RATE_LIMIT_MAX_REQUESTS",
        20,
        {
          min: 1,
          max: 1000,
        }
      ),
  });

/* -------------------------------------------------------------------------- */
/* Network                                                                    */
/* -------------------------------------------------------------------------- */

const NETWORK =
  Object.freeze({
    defaultTimeoutMs:
      envInteger(
        "API_TIMEOUT_MS",
        15000,
        {
          min: 3000,
          max: 60000,
        }
      ),

    geminiTimeoutMs:
      GEMINI_TIMEOUT_MS,

    serpApiTimeoutMs:
      SERPAPI_TIMEOUT_MS,

    geoapifyTimeoutMs:
      GEOAPIFY_TIMEOUT_MS,

    openMeteoTimeoutMs:
      OPEN_METEO_TIMEOUT_MS,

    frankfurterTimeoutMs:
      FRANKFURTER_TIMEOUT_MS,

    retryDelayMs:
      seconds(1),

    maxRetries: 1,
  });

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

const APP =
  Object.freeze({
    name:
      "TrackWorld AI Travel Planner",

    company:
      "TrackWorld Vacations Pvt. Ltd.",

    environment:
      NODE_ENV,

    isProduction:
      IS_PRODUCTION,

    port:
      PORT,

    defaultCurrency:
      "INR",

    itinerarySchemaVersion:
      ITINERARY_SCHEMA_VERSION,

    itinerarySectionsPerDay:
      5,

    maxTripDays:
      TRIP_LIMITS.maxDays,
  });

/* -------------------------------------------------------------------------- */
/* Provider Status                                                            */
/* -------------------------------------------------------------------------- */

const PROVIDERS =
  Object.freeze({
    gemini: {
      enabled:
        AI_MODE === "gemini" &&
        Boolean(GEMINI_API_KEY),

      model:
        GEMINI_MODEL,
    },

    serpApi: {
      enabled:
        Boolean(
          SERPAPI_API_KEY
        ),
    },

    geoapify: {
      enabled:
        Boolean(
          GEOAPIFY_API_KEY
        ),
    },

    openMeteo: {
      enabled: true,
    },

    frankfurter: {
      enabled: true,
    },

    elevenLabs: {
      enabled:
        Boolean(
          ELEVENLABS_AGENT_ID
        ),

      agentId:
        ELEVENLABS_AGENT_ID,

      branchId:
        ELEVENLABS_BRANCH_ID,

      supportUrl:
        ELEVENLABS_SUPPORT_URL,
    },
  });

/* -------------------------------------------------------------------------- */
/* Startup Warnings                                                           */
/* -------------------------------------------------------------------------- */

function getStartupWarnings() {
  const warnings = [];

  if (!GEMINI_API_KEY) {
    warnings.push(
      "GEMINI_API_KEY is not configured. AI itinerary generation will use the application fallback."
    );
  }

  if (!SERPAPI_API_KEY) {
    warnings.push(
      "SERPAPI_API_KEY is not configured. Flight and stay search will be unavailable."
    );
  }

  if (!GEOAPIFY_API_KEY) {
    warnings.push(
      "GEOAPIFY_API_KEY is not configured. Destination exploration will be unavailable."
    );
  }

  return warnings;
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

export const config =
  Object.freeze({
    app:
      APP,

    gemini: {
      apiKey:
        GEMINI_API_KEY,

      model:
        GEMINI_MODEL,

      requestLimit:
        GEMINI_REQUEST_LIMIT,

      maxRequests:
        GEMINI_REQUEST_LIMIT,

      timeoutMs:
        GEMINI_TIMEOUT_MS,
    },

    serpApi: {
      apiKey:
        SERPAPI_API_KEY,

      baseUrl:
        SERPAPI_BASE_URL,

      timeoutMs:
        SERPAPI_TIMEOUT_MS,
    },

    geoapify: {
      apiKey:
        GEOAPIFY_API_KEY,

      baseUrl:
        GEOAPIFY_BASE_URL,

      placesUrl:
        GEOAPIFY_PLACES_URL,

      timeoutMs:
        GEOAPIFY_TIMEOUT_MS,
    },

    openMeteo: {
      baseUrl:
        OPEN_METEO_BASE_URL,

      forecastUrl:
        OPEN_METEO_FORECAST_URL,

      maxForecastDays:
        WEATHER_FORECAST_MAX_DAYS,

      timeoutMs:
        OPEN_METEO_TIMEOUT_MS,
    },

    frankfurter: {
      baseUrl:
        FRANKFURTER_BASE_URL,

      timeoutMs:
        FRANKFURTER_TIMEOUT_MS,
    },

    elevenLabs: {
      agentId:
        ELEVENLABS_AGENT_ID,

      branchId:
        ELEVENLABS_BRANCH_ID,

      supportUrl:
        ELEVENLABS_SUPPORT_URL,
    },

    dataFiles:
      DATA_FILES,

    tripLimits:
      TRIP_LIMITS,

    searchLimits:
      SEARCH_LIMITS,

    airport:
      AIRPORT_SETTINGS,

    cacheTtl:
      CACHE_TTL,

    rateLimit:
      RATE_LIMIT,

    network:
      NETWORK,

    providers:
      PROVIDERS,

    getStartupWarnings,
  });

export default config;