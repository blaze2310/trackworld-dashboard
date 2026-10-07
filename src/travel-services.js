/**
 * TrackWorld AI Travel Planner
 * External Travel Services
 *
 * Providers:
 * - SerpApi Google Flights
 * - SerpApi Google Hotels
 * - Geoapify Places
 * - Open-Meteo Weather
 * - Frankfurter Currency
 *
 * Design:
 * - Provider calls are made only when their feature is requested.
 * - Responses are normalised before reaching the frontend.
 * - Short-lived in-memory caching reduces repeated API usage.
 * - Network calls have timeouts.
 * - Provider failures do not crash the TrackWorld application.
 * - No service fabricates live prices, availability or weather.
 */

import config from "./config.js";

/* -------------------------------------------------------------------------- */
/*                                   Cache                                    */
/* -------------------------------------------------------------------------- */

const cache = new Map();

const MAX_CACHE_ENTRIES = 500;

function now() {
  return Date.now();
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          stableValue(value[key]),
        ])
    );
  }

  return value;
}

function cacheKey(prefix, payload) {
  return `${prefix}:${JSON.stringify(
    stableValue(payload)
  )}`;
}

function getCached(key) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }

  /*
   * Refresh insertion order so the Map also behaves
   * like a lightweight LRU cache.
   */
  cache.delete(key);
  cache.set(key, entry);

  return entry.value;
}

function setCached(
  key,
  value,
  ttlMs
) {
  cache.delete(key);

  cache.set(key, {
    value,
    expiresAt:
      now() + ttlMs,
  });

  while (
    cache.size >
    MAX_CACHE_ENTRIES
  ) {
    const oldestKey =
      cache
        .keys()
        .next()
        .value;

    cache.delete(
      oldestKey
    );
  }

  return value;
}

function ttlFromConfig(
  name,
  fallbackMinutes
) {
  const configured =
    Number(
      config?.cacheTtl?.[
        name
      ] ??
        config?.cache?.[
          name
        ]
    );

  if (
    Number.isFinite(
      configured
    ) &&
    configured > 0
  ) {
    /*
     * config.js may expose TTLs in milliseconds.
     * Values greater than 10,000 are therefore
     * treated as milliseconds.
     */
    if (
      configured >
      10_000
    ) {
      return configured;
    }

    return (
      configured *
      60_000
    );
  }

  const generic =
    Number(
      process.env
        .CACHE_TTL_MINUTES
    );

  if (
    Number.isFinite(
      generic
    ) &&
    generic > 0
  ) {
    return (
      generic *
      60_000
    );
  }

  return (
    fallbackMinutes *
    60_000
  );
}

const TTL =
  Object.freeze({
    flights:
      ttlFromConfig(
        "flights",
        15
      ),

    stays:
      ttlFromConfig(
        "stays",
        30
      ),

    explore:
      ttlFromConfig(
        "explore",
        60
      ),

    weather:
      ttlFromConfig(
        "weather",
        30
      ),

    currency:
      ttlFromConfig(
        "currency",
        360
      ),
  });

/* -------------------------------------------------------------------------- */
/*                             Cache Maintenance                              */
/* -------------------------------------------------------------------------- */

function cleanExpiredCache() {
  const currentTime =
    now();

  for (
    const [
      key,
      entry,
    ] of cache
  ) {
    if (
      !entry ||
      entry.expiresAt <=
        currentTime
    ) {
      cache.delete(key);
    }
  }
}

export function clearTravelServiceCache() {
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/*                              Basic Helpers                                 */
/* -------------------------------------------------------------------------- */

function cleanString(
  value,
  maxLength = 500
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      maxLength
    );
}

function cleanCode(
  value,
  maxLength = 10
) {
  return cleanString(
    value,
    maxLength
  ).toUpperCase();
}

function numberOrNull(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function integerOrNull(
  value
) {
  const number =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function booleanValue(
  value
) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function safeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function uniqueStrings(
  values,
  limit = 30
) {
  const result = [];

  const seen =
    new Set();

  for (
    const value of
    safeArray(values)
  ) {
    const cleaned =
      cleanString(
        value,
        160
      );

    if (!cleaned) {
      continue;
    }

    const key =
      cleaned.toLowerCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);

    if (
      result.length >=
      limit
    ) {
      break;
    }
  }

  return result;
}

function round(
  value,
  digits = 2
) {
  const number =
    numberOrNull(
      value
    );

  if (
    number === null
  ) {
    return null;
  }

  const factor =
    10 ** digits;

  return (
    Math.round(
      number * factor
    ) / factor
  );
}

function positiveNumber(
  value
) {
  const number =
    numberOrNull(
      value
    );

  return (
    number !== null &&
    number >= 0
  )
    ? number
    : null;
}

function isoDate(
  value
) {
  const candidate =
    cleanString(
      value,
      20
    );

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      candidate
    )
  ) {
    return candidate;
  }

  return "";
}

function toDateOnly(
  value
) {
  const date =
    isoDate(value);

  if (!date) {
    return null;
  }

  const parsed =
    new Date(
      `${date}T00:00:00Z`
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

function daysBetween(
  start,
  end
) {
  const first =
    toDateOnly(start);

  const second =
    toDateOnly(end);

  if (
    !first ||
    !second
  ) {
    return null;
  }

  return Math.round(
    (
      second.getTime() -
      first.getTime()
    ) /
      86_400_000
  );
}

function todayUtc() {
  const current =
    new Date();

  return new Date(
    Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate()
    )
  );
}

function dateDifferenceFromToday(
  date
) {
  const target =
    toDateOnly(date);

  if (!target) {
    return null;
  }

  return Math.floor(
    (
      target.getTime() -
      todayUtc().getTime()
    ) /
      86_400_000
  );
}

/* -------------------------------------------------------------------------- */
/*                          Provider Configuration                            */
/* -------------------------------------------------------------------------- */

function serpApiKey() {
  return cleanString(
    config?.serpApi
      ?.apiKey ||
      process.env
        .SERPAPI_API_KEY ||
      process.env
        .SERP_API_KEY ||
      "",
    500
  );
}

function geoapifyApiKey() {
  return cleanString(
    config?.geoapify
      ?.apiKey ||
      process.env
        .GEOAPIFY_API_KEY ||
      "",
    500
  );
}

function openMeteoBaseUrl() {
  return (
    cleanString(
      config?.openMeteo
        ?.baseUrl ||
        config?.providers
          ?.openMeteo
          ?.baseUrl ||
        process.env
          .OPEN_METEO_BASE_URL ||
        "",
      500
    ) ||
    "https://api.open-meteo.com/v1"
  ).replace(
    /\/+$/,
    ""
  );
}

function frankfurterBaseUrl() {
  return (
    cleanString(
      config?.frankfurter
        ?.baseUrl ||
        config?.providers
          ?.frankfurter
          ?.baseUrl ||
        process.env
          .FRANKFURTER_BASE_URL ||
        "",
      500
    ) ||
    "https://api.frankfurter.app"
  ).replace(
    /\/+$/,
    ""
  );
}

function serpApiBaseUrl() {
  return (
    cleanString(
      config?.serpApi
        ?.baseUrl ||
        config?.providers
          ?.serpApi
          ?.baseUrl ||
        process.env
          .SERPAPI_BASE_URL ||
        "",
      500
    ) ||
    "https://serpapi.com/search.json"
  );
}

function geoapifyBaseUrl() {
  return (
    cleanString(
      config?.geoapify
        ?.baseUrl ||
        config?.providers
          ?.geoapify
          ?.baseUrl ||
        process.env
          .GEOAPIFY_BASE_URL ||
        "",
      500
    ) ||
    "https://api.geoapify.com/v2"
  ).replace(
    /\/+$/,
    ""
  );
}

/* -------------------------------------------------------------------------- */
/*                                Timeouts                                    */
/* -------------------------------------------------------------------------- */

function timeoutFromConfig(
  provider,
  fallbackMs
) {
  const candidates = [
    config?.[
      provider
    ]?.timeoutMs,

    config?.providers?.[
      provider
    ]?.timeoutMs,

    config?.network
      ?.timeoutMs,

    config?.network
      ?.providerTimeoutMs,
  ];

  for (
    const candidate of
    candidates
  ) {
    const number =
      Number(candidate);

    if (
      Number.isFinite(
        number
      ) &&
      number >= 1000
    ) {
      return number;
    }
  }

  return fallbackMs;
}

const TIMEOUTS =
  Object.freeze({
    serpApi:
      timeoutFromConfig(
        "serpApi",
        15_000
      ),

    geoapify:
      timeoutFromConfig(
        "geoapify",
        12_000
      ),

    openMeteo:
      timeoutFromConfig(
        "openMeteo",
        12_000
      ),

    frankfurter:
      timeoutFromConfig(
        "frankfurter",
        10_000
      ),
  });

/* -------------------------------------------------------------------------- */
/*                          Provider Error Safety                             */
/* -------------------------------------------------------------------------- */

function redactSecret(
  input,
  secret
) {
  if (
    !secret ||
    !input
  ) {
    return input;
  }

  return String(input)
    .split(secret)
    .join(
      "[REDACTED]"
    );
}

function sanitiseProviderMessage(
  value
) {
  let output =
    String(
      value || ""
    );

  output =
    redactSecret(
      output,
      serpApiKey()
    );

  output =
    redactSecret(
      output,
      geoapifyApiKey()
    );

  return output
    .replace(
      /([?&](?:api_key|apikey|key)=)[^&\s]+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /(authorization:\s*bearer\s+)\S+/gi,
      "$1[REDACTED]"
    )
    .slice(
      0,
      1800
    );
}

function logProviderError(
  provider,
  error
) {
  const message =
    sanitiseProviderMessage(
      error?.message ||
        String(error)
    );

  console.error(
    `[TrackWorld] ${provider} request failed:`,
    message
  );
}

/* -------------------------------------------------------------------------- */
/*                            Network Utilities                               */
/* -------------------------------------------------------------------------- */

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 12_000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",

            ...(options.headers ||
              {}),
          },
        }
      );

    return response;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "The provider request timed out."
        );

      timeoutError.code =
        "PROVIDER_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(
  url,
  {
    provider =
      "External provider",

    timeoutMs =
      12_000,

    options = {},
  } = {}
) {
  const response =
    await fetchWithTimeout(
      url,
      options,
      timeoutMs
    );

  const contentType =
    response.headers
      .get(
        "content-type"
      )
      ?.toLowerCase() ||
    "";

  let payload = null;

  try {
    if (
      contentType.includes(
        "application/json"
      )
    ) {
      payload =
        await response.json();
    } else {
      const raw =
        await response.text();

      if (raw) {
        try {
          payload =
            JSON.parse(raw);
        } catch {
          payload = {
            message:
              cleanString(
                raw,
                1000
              ),
          };
        }
      }
    }
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const providerMessage =
      cleanString(
        payload?.error ||
          payload?.message ||
          payload?.error_message ||
          "",
        1000
      );

    const error =
      new Error(
        providerMessage ||
          `${provider} returned HTTP ${response.status}.`
      );

    error.statusCode =
      response.status;

    error.provider =
      provider;

    throw error;
  }

  if (
    payload === null ||
    payload === undefined
  ) {
    const error =
      new Error(
        `${provider} returned an empty response.`
      );

    error.provider =
      provider;

    throw error;
  }

  return payload;
}

/* -------------------------------------------------------------------------- */
/*                          URL / Parameter Helpers                           */
/* -------------------------------------------------------------------------- */

function buildUrl(
  base,
  parameters = {}
) {
  const url =
    new URL(base);

  for (
    const [
      key,
      value,
    ] of Object.entries(
      parameters
    )
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value)
    ) {
      if (
        value.length === 0
      ) {
        continue;
      }

      url.searchParams.set(
        key,
        value.join(",")
      );

      continue;
    }

    url.searchParams.set(
      key,
      String(value)
    );
  }

  return url;
}

/* -------------------------------------------------------------------------- */
/*                           Location Utilities                               */
/* -------------------------------------------------------------------------- */

function locationObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value;
}

function locationCity(
  location
) {
  if (
    typeof location ===
    "string"
  ) {
    return cleanString(
      location,
      120
    );
  }

  return cleanString(
    location?.city ||
      location?.name,
    120
  );
}

function locationCountry(
  location
) {
  return cleanString(
    locationObject(
      location
    )?.country,
    120
  );
}

function locationCountryCode(
  location
) {
  return cleanCode(
    locationObject(
      location
    )?.countryCode,
    3
  );
}

function locationLatitude(
  location
) {
  const object =
    locationObject(
      location
    );

  return numberOrNull(
    object?.latitude ??
      object?.lat
  );
}

function locationLongitude(
  location
) {
  const object =
    locationObject(
      location
    );

  return numberOrNull(
    object?.longitude ??
      object?.lon ??
      object?.lng
  );
}

function locationCoordinates(
  location
) {
  const latitude =
    locationLatitude(
      location
    );

  const longitude =
    locationLongitude(
      location
    );

  if (
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function locationAirport(
  location
) {
  const object =
    locationObject(
      location
    );

  if (
    !object?.airport ||
    typeof object.airport !==
      "object"
  ) {
    return null;
  }

  const iata =
    cleanCode(
      object.airport.iata ||
        object.airport
          .iataCode ||
        object.airport.code,
      3
    );

  if (
    !/^[A-Z]{3}$/.test(
      iata
    )
  ) {
    return null;
  }

  return {
    iata,

    name:
      cleanString(
        object.airport
          .name,
        180
      ),

    city:
      cleanString(
        object.airport
          .municipality ||
          object.airport
            .city,
        120
      ),

    distanceKm:
      positiveNumber(
        object.airport
          .distanceKm
      ),
  };
}

function locationLabel(
  location
) {
  const city =
    locationCity(
      location
    );

  const country =
    locationCountry(
      location
    );

  return [
    city,
    country,
  ]
    .filter(Boolean)
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/*                          Common Result Helpers                             */
/* -------------------------------------------------------------------------- */

function unavailableResult(
  service,
  message,
  extra = {}
) {
  return {
    available: false,

    service,

    message:
      cleanString(
        message,
        500
      ),

    ...extra,
  };
}

function availableResult(
  service,
  extra = {}
) {
  return {
    available: true,

    service,

    ...extra,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Currency Resolution                               */
/* -------------------------------------------------------------------------- */

/*
 * Currency resolution is deliberately separate from
 * exchange-rate availability.
 *
 * A destination may correctly use a currency even when
 * the selected FX provider does not support that currency.
 */

const COUNTRY_CURRENCY =
  Object.freeze({
    AD: "EUR",
    AE: "AED",
    AF: "AFN",
    AG: "XCD",
    AI: "XCD",
    AL: "ALL",
    AM: "AMD",
    AO: "AOA",
    AR: "ARS",
    AT: "EUR",
    AU: "AUD",
    AW: "AWG",
    AZ: "AZN",

    BA: "BAM",
    BB: "BBD",
    BD: "BDT",
    BE: "EUR",
    BF: "XOF",
    BG: "BGN",
    BH: "BHD",
    BI: "BIF",
    BJ: "XOF",
    BM: "BMD",
    BN: "BND",
    BO: "BOB",
    BR: "BRL",
    BS: "BSD",
    BT: "BTN",
    BW: "BWP",
    BY: "BYN",
    BZ: "BZD",

    CA: "CAD",
    CD: "CDF",
    CF: "XAF",
    CG: "XAF",
    CH: "CHF",
    CI: "XOF",
    CL: "CLP",
    CM: "XAF",
    CN: "CNY",
    CO: "COP",
    CR: "CRC",
    CU: "CUP",
    CV: "CVE",
    CY: "EUR",
    CZ: "CZK",

    DE: "EUR",
    DJ: "DJF",
    DK: "DKK",
    DM: "XCD",
    DO: "DOP",
    DZ: "DZD",

    EC: "USD",
    EE: "EUR",
    EG: "EGP",
    ER: "ERN",
    ES: "EUR",
    ET: "ETB",

    FI: "EUR",
    FJ: "FJD",
    FK: "FKP",
    FR: "EUR",

    GA: "XAF",
    GB: "GBP",
    GD: "XCD",
    GE: "GEL",
    GH: "GHS",
    GI: "GIP",
    GM: "GMD",
    GN: "GNF",
    GQ: "XAF",
    GR: "EUR",
    GT: "GTQ",
    GW: "XOF",
    GY: "GYD",

    HK: "HKD",
    HN: "HNL",
    HR: "EUR",
    HT: "HTG",
    HU: "HUF",

    ID: "IDR",
    IE: "EUR",
    IL: "ILS",
    IN: "INR",
    IQ: "IQD",
    IR: "IRR",
    IS: "ISK",

    IT: "EUR",

    JM: "JMD",
    JO: "JOD",
    JP: "JPY",

    KE: "KES",
    KG: "KGS",
    KH: "KHR",
    KM: "KMF",
    KN: "XCD",
    KP: "KPW",
    KR: "KRW",
    KW: "KWD",
    KY: "KYD",
    KZ: "KZT",

    LA: "LAK",
    LB: "LBP",
    LC: "XCD",
    LI: "CHF",
    LK: "LKR",
    LR: "LRD",
    LS: "LSL",
    LT: "EUR",
    LU: "EUR",
    LV: "EUR",
    LY: "LYD",

    MA: "MAD",
    MC: "EUR",
    MD: "MDL",
    ME: "EUR",
    MG: "MGA",
    MK: "MKD",
    ML: "XOF",
    MM: "MMK",
    MN: "MNT",
    MO: "MOP",
    MR: "MRU",
    MT: "EUR",
    MU: "MUR",
    MV: "MVR",
    MW: "MWK",
    MX: "MXN",
    MY: "MYR",
    MZ: "MZN",

    NA: "NAD",
    NE: "XOF",
    NG: "NGN",
    NI: "NIO",
    NL: "EUR",
    NO: "NOK",
    NP: "NPR",
    NZ: "NZD",

    OM: "OMR",

    PA: "PAB",
    PE: "PEN",
    PG: "PGK",
    PH: "PHP",
    PK: "PKR",
    PL: "PLN",
    PT: "EUR",
    PY: "PYG",

    QA: "QAR",

    RO: "RON",
    RS: "RSD",
    RU: "RUB",
    RW: "RWF",

    SA: "SAR",
    SB: "SBD",
    SC: "SCR",
    SD: "SDG",
    SE: "SEK",
    SG: "SGD",
    SI: "EUR",
    SK: "EUR",
    SL: "SLE",
    SM: "EUR",
    SN: "XOF",
    SO: "SOS",
    SR: "SRD",
    SS: "SSP",
    ST: "STN",
    SV: "USD",
    SY: "SYP",
    SZ: "SZL",

    TH: "THB",
    TJ: "TJS",
    TL: "USD",
    TM: "TMT",
    TN: "TND",
    TO: "TOP",
    TR: "TRY",
    TT: "TTD",
    TW: "TWD",
    TZ: "TZS",

    UA: "UAH",
    UG: "UGX",
    US: "USD",
    UY: "UYU",
    UZ: "UZS",

    VA: "EUR",
    VC: "XCD",
    VE: "VES",
    VN: "VND",
    VU: "VUV",

    WS: "WST",

    YE: "YER",

    ZA: "ZAR",
    ZM: "ZMW",
    ZW: "USD",
  });

const CURRENCY_SYMBOLS =
  Object.freeze({
    AED: "د.إ",
    AUD: "A$",
    BDT: "৳",
    CAD: "C$",
    CHF: "CHF",
    CNY: "¥",
    CZK: "Kč",
    DKK: "kr",
    EGP: "E£",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
    HUF: "Ft",
    IDR: "Rp",
    ILS: "₪",
    INR: "₹",
    JPY: "¥",
    KRW: "₩",
    LKR: "Rs",
    MAD: "د.م.",
    MXN: "MX$",
    MYR: "RM",
    NOK: "kr",
    NZD: "NZ$",
    PHP: "₱",
    PLN: "zł",
    QAR: "ر.ق",
    RON: "lei",
    SAR: "﷼",
    SEK: "kr",
    SGD: "S$",
    THB: "฿",
    TRY: "₺",
    TWD: "NT$",
    USD: "$",
    VND: "₫",
    ZAR: "R",
  });

export function getCurrencyForCountry(
  countryCode
) {
  const code =
    cleanCode(
      countryCode,
      2
    );

  const currency =
    COUNTRY_CURRENCY[
      code
    ] ||
    null;

  if (!currency) {
    return null;
  }

  return {
    countryCode:
      code,

    currency,

    symbol:
      CURRENCY_SYMBOLS[
        currency
      ] ||
      currency,
  };
}
/* -------------------------------------------------------------------------- */
/*                           Currency Service                                 */
/* -------------------------------------------------------------------------- */

function currencySymbol(
  currencyCode
) {
  const code =
    cleanCode(
      currencyCode,
      3
    );

  if (!code) {
    return "";
  }

  if (
    CURRENCY_SYMBOLS[
      code
    ]
  ) {
    return CURRENCY_SYMBOLS[
      code
    ];
  }

  try {
    const parts =
      new Intl.NumberFormat(
        "en",
        {
          style:
            "currency",

          currency:
            code,

          currencyDisplay:
            "narrowSymbol",

          minimumFractionDigits:
            0,

          maximumFractionDigits:
            0,
        }
      ).formatToParts(0);

    return (
      parts.find(
        (part) =>
          part.type ===
          "currency"
      )?.value ||
      code
    );
  } catch {
    return code;
  }
}

async function fetchFrankfurterCurrencies() {
  const key =
    cacheKey(
      "frankfurter-currencies",
      {}
    );

  const cached =
    getCached(key);

  if (cached) {
    return cached;
  }

  try {
    const url =
      `${frankfurterBaseUrl()}/currencies`;

    const response =
      await fetchJson(
        url,
        {
          provider:
            "Frankfurter",

          timeoutMs:
            TIMEOUTS.frankfurter,
        }
      );

    const currencies =
      new Set(
        Object.keys(
          response || {}
        )
          .map(
            (code) =>
              cleanCode(
                code,
                3
              )
          )
          .filter(
            (code) =>
              /^[A-Z]{3}$/.test(
                code
              )
          )
      );

    if (
      currencies.size === 0
    ) {
      return null;
    }

    const value = [
      ...currencies,
    ];

    setCached(
      key,
      value,
      12 * 60 * 60 * 1000
    );

    return value;
  } catch (error) {
    logProviderError(
      "Frankfurter currencies",
      error
    );

    return null;
  }
}

export async function getCurrency(
  request = {}
) {
  cleanExpiredCache();

  const destination =
    request.destination ||
    {};

  const countryCode =
    cleanCode(
      destination
        ?.countryCode ||
        request
          ?.countryCode,
      2
    );

  const resolved =
    getCurrencyForCountry(
      countryCode
    );

  const base =
    cleanCode(
      request?.base ||
        request
          ?.baseCurrency ||
        "INR",
      3
    ) ||
    "INR";

  const explicitTarget =
    cleanCode(
      request?.target ||
        request
          ?.targetCurrency,
      3
    );

  const target =
    explicitTarget ||
    resolved?.currency ||
    "";

  const amount =
    positiveNumber(
      request?.amount
    ) ?? 1;

  if (!target) {
    return unavailableResult(
      "currency",
      "The destination currency could not be determined.",
      {
        provider:
          "Frankfurter",

        base,

        target:
          null,

        countryCode:
          countryCode ||
          null,

        localCurrency:
          null,
      }
    );
  }

  const symbol =
    currencySymbol(
      target
    );

  const baseSymbol =
    currencySymbol(
      base
    );

  /*
   * No provider request is required when both
   * currencies are identical.
   */
  if (
    base === target
  ) {
    return availableResult(
      "currency",
      {
        provider:
          "Local currency resolution",

        source:
          "local",

        base,

        target,

        baseSymbol,

        symbol,

        rate: 1,

        amount,

        convertedAmount:
          round(
            amount,
            2
          ),

        countryCode:
          countryCode ||
          null,

        localCurrency: {
          code:
            target,

          symbol,
        },

        rateAvailable:
          true,

        date:
          new Date()
            .toISOString()
            .slice(0, 10),

        cached:
          false,
      }
    );
  }

  /*
   * First check whether Frankfurter actually
   * supports both currencies.
   *
   * This keeps destination-currency resolution
   * separate from exchange-rate availability.
   */
  const supportedCurrencies =
    await fetchFrankfurterCurrencies();

  if (
    Array.isArray(
      supportedCurrencies
    )
  ) {
    const supported =
      new Set(
        supportedCurrencies
      );

    if (
      !supported.has(
        base
      ) ||
      !supported.has(
        target
      )
    ) {
      return {
        available:
          true,

        service:
          "currency",

        provider:
          "Frankfurter",

        source:
          "local-currency",

        base,

        target,

        baseSymbol,

        symbol,

        rate:
          null,

        amount,

        convertedAmount:
          null,

        countryCode:
          countryCode ||
          null,

        localCurrency: {
          code:
            target,

          symbol,
        },

        rateAvailable:
          false,

        message:
          `The local currency is ${target}. An exchange rate for this currency pair is currently unavailable.`,

        cached:
          false,
      };
    }
  }

  const key =
    cacheKey(
      "currency-rate",
      {
        base,
        target,
      }
    );

  const cached =
    getCached(key);

  if (cached) {
    const rate =
      numberOrNull(
        cached.rate
      );

    return availableResult(
      "currency",
      {
        provider:
          "Frankfurter",

        source:
          "current-rate",

        base,

        target,

        baseSymbol,

        symbol,

        rate,

        amount,

        convertedAmount:
          rate !== null
            ? round(
                amount *
                  rate,
                2
              )
            : null,

        countryCode:
          countryCode ||
          null,

        localCurrency: {
          code:
            target,

          symbol,
        },

        rateAvailable:
          rate !== null,

        date:
          cached.date ||
          null,

        cached:
          true,
      }
    );
  }

  try {
    const url =
      buildUrl(
        `${frankfurterBaseUrl()}/latest`,
        {
          from:
            base,

          to:
            target,
        }
      );

    const response =
      await fetchJson(
        url,
        {
          provider:
            "Frankfurter",

          timeoutMs:
            TIMEOUTS.frankfurter,
        }
      );

    const rate =
      numberOrNull(
        response?.rates?.[
          target
        ]
      );

    if (
      rate === null ||
      rate <= 0
    ) {
      return {
        available:
          true,

        service:
          "currency",

        provider:
          "Frankfurter",

        source:
          "local-currency",

        base,

        target,

        baseSymbol,

        symbol,

        rate:
          null,

        amount,

        convertedAmount:
          null,

        countryCode:
          countryCode ||
          null,

        localCurrency: {
          code:
            target,

          symbol,
        },

        rateAvailable:
          false,

        message:
          `The local currency is ${target}. The current exchange rate is unavailable.`,

        cached:
          false,
      };
    }

    const rateData = {
      rate,

      date:
        cleanString(
          response?.date,
          20
        ) ||
        new Date()
          .toISOString()
          .slice(0, 10),
    };

    setCached(
      key,
      rateData,
      TTL.currency
    );

    return availableResult(
      "currency",
      {
        provider:
          "Frankfurter",

        source:
          "current-rate",

        base,

        target,

        baseSymbol,

        symbol,

        rate,

        amount,

        convertedAmount:
          round(
            amount *
              rate,
            2
          ),

        countryCode:
          countryCode ||
          null,

        localCurrency: {
          code:
            target,

          symbol,
        },

        rateAvailable:
          true,

        date:
          rateData.date,

        cached:
          false,
      }
    );
  } catch (error) {
    logProviderError(
      "Frankfurter",
      error
    );

    /*
     * We still know the destination's local
     * currency even if the exchange-rate provider
     * is temporarily unavailable.
     */
    return {
      available:
        true,

      service:
        "currency",

      provider:
        "Frankfurter",

      source:
        "local-currency",

      base,

      target,

      baseSymbol,

      symbol,

      rate:
        null,

      amount,

      convertedAmount:
        null,

      countryCode:
        countryCode ||
        null,

      localCurrency: {
        code:
          target,

        symbol,
      },

      rateAvailable:
        false,

      message:
        `The local currency is ${target}. The current exchange rate could not be retrieved right now.`,

      cached:
        false,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                           Flight Utilities                                 */
/* -------------------------------------------------------------------------- */

function normaliseFlightAirport(
  airport
) {
  if (
    !airport ||
    typeof airport !==
      "object"
  ) {
    return null;
  }

  const code =
    cleanCode(
      airport.id ||
        airport.code,
      3
    );

  return {
    name:
      cleanString(
        airport.name,
        180
      ),

    code:
      /^[A-Z]{3}$/.test(
        code
      )
        ? code
        : "",

    time:
      cleanString(
        airport.time,
        80
      ),
  };
}

function normaliseFlightLeg(
  flight
) {
  if (
    !flight ||
    typeof flight !==
      "object"
  ) {
    return null;
  }

  const departure =
    normaliseFlightAirport(
      flight
        .departure_airport
    );

  const arrival =
    normaliseFlightAirport(
      flight
        .arrival_airport
    );

  if (
    !departure ||
    !arrival
  ) {
    return null;
  }

  return {
    airline:
      cleanString(
        flight.airline,
        120
      ),

    airlineLogo:
      cleanString(
        flight
          .airline_logo,
        1000
      ),

    flightNumber:
      cleanString(
        flight
          .flight_number,
        40
      ),

    aircraft:
      cleanString(
        flight.airplane,
        120
      ),

    travelClass:
      cleanString(
        flight
          .travel_class,
        80
      ),

    departure,

    arrival,

    durationMinutes:
      positiveNumber(
        flight.duration
      ),

    oftenDelayedBy:
      positiveNumber(
        flight
          .often_delayed_by_over_30_min
      ),

    extensions:
      uniqueStrings(
        flight.extensions,
        10
      ),
  };
}

function normaliseFlightOption(
  option,
  index,
  currency
) {
  if (
    !option ||
    typeof option !==
      "object"
  ) {
    return null;
  }

  const legs =
    safeArray(
      option.flights
    )
      .map(
        normaliseFlightLeg
      )
      .filter(Boolean);

  if (
    legs.length === 0
  ) {
    return null;
  }

  const departure =
    legs[0]
      ?.departure ||
    null;

  const arrival =
    legs[
      legs.length - 1
    ]?.arrival ||
    null;

  const airlines =
    uniqueStrings(
      legs
        .map(
          (leg) =>
            leg.airline
        )
        .filter(Boolean),
      10
    );

  const price =
    positiveNumber(
      option.price
    );

  return {
    id:
      `flight-${index + 1}`,

    price,

    currency:
      cleanCode(
        currency,
        3
      ) ||
      "INR",

    durationMinutes:
      positiveNumber(
        option
          .total_duration
      ),

    stops:
      Math.max(
        0,
        legs.length - 1
      ),

    airlines,

    departure,

    arrival,

    legs,

    carbonEmissions:
      option
        .carbon_emissions &&
      typeof option
        .carbon_emissions ===
        "object"
        ? {
            thisFlight:
              positiveNumber(
                option
                  .carbon_emissions
                  .this_flight
              ),

            typicalForRoute:
              positiveNumber(
                option
                  .carbon_emissions
                  .typical_for_this_route
              ),

            differencePercent:
              numberOrNull(
                option
                  .carbon_emissions
                  .difference_percent
              ),
          }
        : null,

    extensions:
      uniqueStrings(
        option.extensions,
        15
      ),

    bookingToken:
      cleanString(
        option
          .booking_token,
        2000
      ),

    departureToken:
      cleanString(
        option
          .departure_token,
        2000
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                               Flights                                      */
/* -------------------------------------------------------------------------- */

export async function searchFlights(
  request = {}
) {
  cleanExpiredCache();

  const origin =
    request.origin;

  const destination =
    request.destination;

  const originAirport =
    locationAirport(
      origin
    );

  const destinationAirport =
    locationAirport(
      destination
    );

  if (
    !originAirport ||
    !destinationAirport
  ) {
    return unavailableResult(
      "flights",
      "A valid origin and destination airport are required for flight search.",
      {
        provider:
          "SerpApi Google Flights",

        results: [],
      }
    );
  }

  if (
    originAirport.iata ===
    destinationAirport.iata
  ) {
    return unavailableResult(
      "flights",
      "Origin and destination airports must be different.",
      {
        provider:
          "SerpApi Google Flights",

        results: [],
      }
    );
  }

  const departureDate =
    isoDate(
      request
        .departureDate ||
        request
          .outboundDate ||
        request.startDate
    );

  const returnDate =
    isoDate(
      request.returnDate ||
        request.endDate
    );

  if (!departureDate) {
    return unavailableResult(
      "flights",
      "A departure date is required for flight search.",
      {
        provider:
          "SerpApi Google Flights",

        results: [],
      }
    );
  }

  if (
    returnDate &&
    daysBetween(
      departureDate,
      returnDate
    ) < 0
  ) {
    return unavailableResult(
      "flights",
      "The return date cannot be before the departure date.",
      {
        provider:
          "SerpApi Google Flights",

        results: [],
      }
    );
  }

  const adults =
    Math.max(
      1,
      Math.min(
        integerOrNull(
          request.adults
        ) || 1,
        100
      )
    );

  const children =
    Math.max(
      0,
      Math.min(
        integerOrNull(
          request.children
        ) || 0,
        100
      )
    );

  const currency =
    cleanCode(
      request.currency ||
        request
          .displayCurrency ||
        "INR",
      3
    ) ||
    "INR";

  const apiKey =
    serpApiKey();

  if (!apiKey) {
    return unavailableResult(
      "flights",
      "Flight options are currently unavailable.",
      {
        provider:
          "SerpApi Google Flights",

        results: [],

        route: {
          originAirport:
            originAirport.iata,

          destinationAirport:
            destinationAirport.iata,

          departureDate,

          returnDate:
            returnDate ||
            null,
        },
      }
    );
  }

  const cachePayload = {
    origin:
      originAirport.iata,

    destination:
      destinationAirport.iata,

    departureDate,

    returnDate:
      returnDate ||
      null,

    adults,

    children,

    currency,
  };

  const key =
    cacheKey(
      "flights",
      cachePayload
    );

  const cached =
    getCached(key);

  if (cached) {
    return {
      ...cached,

      cached: true,
    };
  }

  try {
    const url =
      buildUrl(
        serpApiBaseUrl(),
        {
          engine:
            "google_flights",

          departure_id:
            originAirport.iata,

          arrival_id:
            destinationAirport.iata,

          outbound_date:
            departureDate,

          return_date:
            returnDate ||
            undefined,

          type:
            returnDate
              ? 1
              : 2,

          adults,

          children:
            children > 0
              ? children
              : undefined,

          currency,

          hl:
            "en",

          api_key:
            apiKey,
        }
      );

    const response =
      await fetchJson(
        url,
        {
          provider:
            "SerpApi Google Flights",

          timeoutMs:
            TIMEOUTS.serpApi,
        }
      );

    if (
      response?.error
    ) {
      throw new Error(
        cleanString(
          response.error,
          1000
        )
      );
    }

    const rawOptions = [
      ...safeArray(
        response
          ?.best_flights
      ),

      ...safeArray(
        response
          ?.other_flights
      ),
    ];

    const responseCurrency =
      cleanCode(
        response
          ?.search_parameters
          ?.currency,
        3
      ) ||
      currency;

    const results =
      rawOptions
        .map(
          (
            option,
            index
          ) =>
            normaliseFlightOption(
              option,
              index,
              responseCurrency
            )
        )
        .filter(Boolean)
        .slice(
          0,
          20
        );

    const result =
      availableResult(
        "flights",
        {
          provider:
            "SerpApi Google Flights",

          source:
            "current-search",

          route: {
            origin: {
              city:
                locationCity(
                  origin
                ),

              country:
                locationCountry(
                  origin
                ),

              airport:
                originAirport,
            },

            destination: {
              city:
                locationCity(
                  destination
                ),

              country:
                locationCountry(
                  destination
                ),

              airport:
                destinationAirport,
            },

            departureDate,

            returnDate:
              returnDate ||
              null,
          },

          travellers: {
            adults,
            children,
          },

          currency:
            responseCurrency,

          results,

          resultCount:
            results.length,

          cached:
            false,

          message:
            results.length
              ? ""
              : "No flight options were returned for this search.",
        }
      );

    setCached(
      key,
      result,
      TTL.flights
    );

    return result;
  } catch (error) {
    logProviderError(
      "SerpApi Google Flights",
      error
    );

    return unavailableResult(
      "flights",
      "Flight options could not be retrieved right now. Your itinerary remains available.",
      {
        provider:
          "SerpApi Google Flights",

        results: [],

        route: {
          originAirport:
            originAirport.iata,

          destinationAirport:
            destinationAirport.iata,

          departureDate,

          returnDate:
            returnDate ||
            null,
        },
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Hotel Utilities                                  */
/* -------------------------------------------------------------------------- */

function extractHotelPrice(
  property
) {
  const candidates = [
    property
      ?.rate_per_night
      ?.extracted_lowest,

    property
      ?.total_rate
      ?.extracted_lowest,

    property
      ?.extracted_price,

    typeof property?.price ===
    "number"
      ? property.price
      : null,
  ];

  for (
    const candidate of
    candidates
  ) {
    const value =
      positiveNumber(
        candidate
      );

    if (
      value !== null
    ) {
      return value;
    }
  }

  return null;
}

function extractHotelPriceText(
  property
) {
  const candidates = [
    property
      ?.rate_per_night
      ?.lowest,

    property
      ?.total_rate
      ?.lowest,

    typeof property?.price ===
    "string"
      ? property.price
      : "",
  ];

  for (
    const candidate of
    candidates
  ) {
    const value =
      cleanString(
        candidate,
        100
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function normaliseHotelImages(
  property
) {
  const candidates = [
    ...safeArray(
      property?.images
    ),

    ...safeArray(
      property
        ?.hotel_images
    ),

    property?.image,

    property?.thumbnail,
  ];

  const images = [];

  const seen =
    new Set();

  for (
    const image of
    candidates
  ) {
    const url =
      typeof image ===
      "string"
        ? cleanString(
            image,
            2000
          )
        : cleanString(
            image
              ?.original_image ||
              image?.image ||
              image?.url ||
              image?.thumbnail,
            2000
          );

    if (
      !url ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);
    images.push(url);

    if (
      images.length >=
      6
    ) {
      break;
    }
  }

  return images;
}

function normaliseHotel(
  property,
  index,
  currency
) {
  if (
    !property ||
    typeof property !==
      "object"
  ) {
    return null;
  }

  const name =
    cleanString(
      property.name,
      200
    );

  if (!name) {
    return null;
  }

  const coordinates =
    property
      .gps_coordinates ||
    {};

  const latitude =
    numberOrNull(
      coordinates
        .latitude
    );

  const longitude =
    numberOrNull(
      coordinates
        .longitude
    );

  const amenities =
    uniqueStrings(
      property.amenities,
      15
    );

  const nearbyPlaces =
    safeArray(
      property
        .nearby_places
    )
      .map(
        (item) =>
          cleanString(
            item?.name ||
              item,
            180
          )
      )
      .filter(Boolean)
      .slice(
        0,
        8
      );

  const propertyToken =
    cleanString(
      property
        .property_token,
      1000
    );

  return {
    id:
      propertyToken ||
      `stay-${index + 1}`,

    propertyToken:
      propertyToken ||
      null,

    name,

    description:
      cleanString(
        property
          .description,
        1200
      ),

    type:
      cleanString(
        property.type,
        100
      ),

    hotelClass:
      cleanString(
        property
          .hotel_class,
        80
      ),

    rating:
      numberOrNull(
        property
          .overall_rating
      ),

    reviews:
      Math.max(
        0,
        integerOrNull(
          property.reviews
        ) || 0
      ),

    price:
      extractHotelPrice(
        property
      ),

    priceText:
      extractHotelPriceText(
        property
      ),

    currency:
      cleanCode(
        currency,
        3
      ) ||
      "INR",

    amenities,

    nearbyPlaces,

    images:
      normaliseHotelImages(
        property
      ),

    coordinates:
      latitude !== null &&
      longitude !== null
        ? {
            latitude,
            longitude,
          }
        : null,

    link:
      cleanString(
        property.link,
        2000
      ),

    checkInTime:
      cleanString(
        property
          .check_in_time,
        80
      ),

    checkOutTime:
      cleanString(
        property
          .check_out_time,
        80
      ),

    ecoCertified:
      booleanValue(
        property
          .eco_certified
      ),
  };
}
/* -------------------------------------------------------------------------- */
/*                                Stays                                       */
/* -------------------------------------------------------------------------- */

export async function searchStays(
  request = {}
) {
  cleanExpiredCache();

  const destination =
    request.destination ||
    {};

  const destinationName =
    locationLabel(
      destination
    ) ||
    locationCity(
      destination
    );

  const checkInDate =
    isoDate(
      request.checkInDate ||
        request.startDate
    );

  const checkOutDate =
    isoDate(
      request.checkOutDate ||
        request.endDate
    );

  if (
    !destinationName
  ) {
    return unavailableResult(
      "stays",
      "A destination is required for stay search.",
      {
        provider:
          "SerpApi Google Hotels",

        results: [],
      }
    );
  }

  if (
    !checkInDate ||
    !checkOutDate
  ) {
    return unavailableResult(
      "stays",
      "Check-in and check-out dates are required for stay search.",
      {
        provider:
          "SerpApi Google Hotels",

        results: [],
      }
    );
  }

  if (
    daysBetween(
      checkInDate,
      checkOutDate
    ) <= 0
  ) {
    return unavailableResult(
      "stays",
      "Check-out must be after check-in.",
      {
        provider:
          "SerpApi Google Hotels",

        results: [],
      }
    );
  }

  const adults =
    Math.max(
      1,
      Math.min(
        integerOrNull(
          request.adults
        ) || 1,
        100
      )
    );

  const children =
    Math.max(
      0,
      Math.min(
        integerOrNull(
          request.children
        ) || 0,
        100
      )
    );

  const rooms =
    Math.max(
      1,
      Math.min(
        integerOrNull(
          request.rooms
        ) || 1,
        20
      )
    );

  const currency =
    cleanCode(
      request.currency ||
        request
          .displayCurrency ||
        "INR",
      3
    ) ||
    "INR";

  const apiKey =
    serpApiKey();

  if (!apiKey) {
    return unavailableResult(
      "stays",
      "Stay options are currently unavailable.",
      {
        provider:
          "SerpApi Google Hotels",

        results: [],

        destination:
          destinationName,

        checkInDate,

        checkOutDate,
      }
    );
  }

  const cachePayload = {
    destination:
      destinationName,

    checkInDate,

    checkOutDate,

    adults,

    children,

    rooms,

    currency,
  };

  const key =
    cacheKey(
      "stays",
      cachePayload
    );

  const cached =
    getCached(key);

  if (cached) {
    return {
      ...cached,

      cached: true,
    };
  }

  try {
    const url =
      buildUrl(
        serpApiBaseUrl(),
        {
          engine:
            "google_hotels",

          q:
            destinationName,

          check_in_date:
            checkInDate,

          check_out_date:
            checkOutDate,

          adults,

          children:
            children > 0
              ? children
              : undefined,

          rooms,

          currency,

          gl:
            locationCountryCode(
              destination
            )
              ?.toLowerCase() ||
            undefined,

          hl:
            "en",

          api_key:
            apiKey,
        }
      );

    const response =
      await fetchJson(
        url,
        {
          provider:
            "SerpApi Google Hotels",

          timeoutMs:
            TIMEOUTS.serpApi,
        }
      );

    if (
      response?.error
    ) {
      throw new Error(
        cleanString(
          response.error,
          1000
        )
      );
    }

    const responseCurrency =
      cleanCode(
        response
          ?.search_parameters
          ?.currency,
        3
      ) ||
      currency;

    const results =
      safeArray(
        response.properties
      )
        .map(
          (
            property,
            index
          ) =>
            normaliseHotel(
              property,
              index,
              responseCurrency
            )
        )
        .filter(Boolean)
        .slice(
          0,
          20
        );

    const result =
      availableResult(
        "stays",
        {
          provider:
            "SerpApi Google Hotels",

          source:
            "current-search",

          destination: {
            city:
              locationCity(
                destination
              ),

            country:
              locationCountry(
                destination
              ),

            countryCode:
              locationCountryCode(
                destination
              ),

            label:
              destinationName,
          },

          checkInDate,

          checkOutDate,

          travellers: {
            adults,
            children,
            rooms,
          },

          currency:
            responseCurrency,

          results,

          resultCount:
            results.length,

          cached:
            false,

          message:
            results.length
              ? ""
              : "No stay options were returned for this search.",
        }
      );

    setCached(
      key,
      result,
      TTL.stays
    );

    return result;
  } catch (error) {
    logProviderError(
      "SerpApi Google Hotels",
      error
    );

    return unavailableResult(
      "stays",
      "Stay options could not be retrieved right now. Your itinerary remains available.",
      {
        provider:
          "SerpApi Google Hotels",

        results: [],

        destination:
          destinationName,

        checkInDate,

        checkOutDate,
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Geoapify Place Categories                          */
/* -------------------------------------------------------------------------- */

const EXPLORE_CATEGORIES =
  Object.freeze({
    attractions: [
      "tourism.sights",
      "entertainment.museum",
      "entertainment.culture",
      "heritage",
    ],

    restaurants: [
      "catering.restaurant",
      "catering.cafe",
    ],

    shopping: [
      "commercial.shopping_mall",
      "commercial.marketplace",
      "commercial.department_store",
      "commercial.gift_and_souvenir",
    ],

    experiences: [
      "entertainment.theme_park",
      "entertainment.water_park",
      "entertainment.zoo",
      "entertainment.aquarium",
      "entertainment.activity_park",
      "leisure.park",
      "leisure.picnic",
      "sport",
    ],
  });

function exploreCategories(
  category
) {
  const cleaned =
    cleanString(
      category,
      40
    ).toLowerCase();

  return (
    EXPLORE_CATEGORIES[
      cleaned
    ] ||
    EXPLORE_CATEGORIES
      .attractions
  );
}

/* -------------------------------------------------------------------------- */
/*                         Geoapify Normalisation                             */
/* -------------------------------------------------------------------------- */

function geoapifyAddress(
  properties
) {
  return cleanString(
    properties
      ?.formatted ||
      [
        properties
          ?.address_line1,

        properties
          ?.address_line2,
      ]
        .filter(Boolean)
        .join(", "),
    300
  );
}

function geoapifyCategoryLabel(
  categories
) {
  const values =
    safeArray(
      categories
    );

  if (
    values.some(
      value =>
        String(value)
          .startsWith(
            "catering.restaurant"
          )
    )
  ) {
    return "Restaurant";
  }

  if (
    values.some(
      value =>
        String(value)
          .startsWith(
            "catering.cafe"
          )
    )
  ) {
    return "Cafe";
  }

  if (
    values.some(
      value =>
        String(value)
          .startsWith(
            "commercial"
          )
    )
  ) {
    return "Shopping";
  }

  if (
    values.some(
      value =>
        String(value)
          .includes(
            "museum"
          )
    )
  ) {
    return "Museum";
  }

  if (
    values.some(
      value =>
        String(value)
          .includes(
            "theme_park"
          )
    )
  ) {
    return "Theme Park";
  }

  if (
    values.some(
      value =>
        String(value)
          .includes(
            "water_park"
          )
    )
  ) {
    return "Water Park";
  }

  if (
    values.some(
      value =>
        String(value)
          .includes(
            "aquarium"
          )
    )
  ) {
    return "Aquarium";
  }

  if (
    values.some(
      value =>
        String(value)
          .includes(
            "zoo"
          )
    )
  ) {
    return "Zoo";
  }

  if (
    values.some(
      value =>
        String(value)
          .includes(
            "sights"
          )
    )
  ) {
    return "Sight";
  }

  if (
    values.some(
      value =>
        String(value)
          .startsWith(
            "tourism"
          )
    )
  ) {
    return "Attraction";
  }

  if (
    values.some(
      value =>
        String(value)
          .startsWith(
            "entertainment"
          )
    )
  ) {
    return "Experience";
  }

  if (
    values.some(
      value =>
        String(value)
          .startsWith(
            "leisure"
          )
    )
  ) {
    return "Experience";
  }

  return "Place";
}

function normaliseGeoapifyPlace(
  feature,
  index
) {
  if (
    !feature ||
    typeof feature !==
      "object"
  ) {
    return null;
  }

  const properties =
    feature.properties ||
    {};

  const coordinates =
    safeArray(
      feature
        ?.geometry
        ?.coordinates
    );

  const longitude =
    numberOrNull(
      coordinates[0] ??
        properties.lon
    );

  const latitude =
    numberOrNull(
      coordinates[1] ??
        properties.lat
    );

  const name =
    cleanString(
      properties.name ||
        properties
          .address_line1,
      200
    );

  if (!name) {
    return null;
  }

  const categories =
    uniqueStrings(
      properties.categories,
      20
    );

  const placeId =
    cleanString(
      properties
        .place_id,
      300
    );

  return {
    id:
      placeId ||
      `place-${index + 1}`,

    placeId:
      placeId ||
      null,

    name,

    category:
      geoapifyCategoryLabel(
        categories
      ),

    categories,

    address:
      geoapifyAddress(
        properties
      ),

    city:
      cleanString(
        properties.city,
        120
      ),

    district:
      cleanString(
        properties
          .district,
        120
      ),

    state:
      cleanString(
        properties.state,
        120
      ),

    country:
      cleanString(
        properties.country,
        120
      ),

    countryCode:
      cleanCode(
        properties
          .country_code,
        2
      ),

    coordinates:
      latitude !== null &&
      longitude !== null
        ? {
            latitude,
            longitude,
          }
        : null,

    distanceMeters:
      positiveNumber(
        properties.distance
      ),

    website:
      cleanString(
        properties.website,
        2000
      ),

    phone:
      cleanString(
        properties
          .contact
          ?.phone ||
          properties.phone,
        80
      ),

    openingHours:
      cleanString(
        properties
          .opening_hours,
        500
      ),

    datasource:
      cleanString(
        properties
          ?.datasource
          ?.sourcename,
        120
      ),

    popularity:
      numberOrNull(
        properties
          ?.rank
          ?.popularity
      ),

    importance:
      numberOrNull(
        properties
          ?.rank
          ?.importance
      ),

    confidence:
      numberOrNull(
        properties
          ?.rank
          ?.confidence
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                         Explore Quality                                    */
/* -------------------------------------------------------------------------- */

const EXPLORE_LOW_VALUE_NAMES =
  Object.freeze([
    "telephone booth",
    "phone booth",
    "body lange",
    "fireworks spot",
    "new legend in town",
  ]);

function exploreNameKey(
  value
) {
  return cleanString(
    value,
    200
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function isLowValueExplorePlace(
  place
) {
  const name =
    exploreNameKey(
      place?.name
    );

  if (!name) {
    return true;
  }

  if (
    EXPLORE_LOW_VALUE_NAMES
      .some(
        blocked =>
          name.includes(
            blocked
          )
      )
  ) {
    return true;
  }

  if (
    /^mv\s*\d+$/i.test(
      name
    )
  ) {
    return true;
  }

  if (
    name.length < 3
  ) {
    return true;
  }

  return false;
}

function explorePlaceScore(
  place,
  category
) {
  let score = 0;

  const categories =
    safeArray(
      place?.categories
    ).map(
      value =>
        String(value)
          .toLowerCase()
    );

  const name =
    exploreNameKey(
      place?.name
    );

  if (
    place?.website
  ) {
    score += 18;
  }

  if (
    place?.phone
  ) {
    score += 6;
  }

  if (
    place?.openingHours
  ) {
    score += 6;
  }

  if (
    place?.address
  ) {
    score += 3;
  }

  const popularity =
    numberOrNull(
      place?.popularity
    );

  const importance =
    numberOrNull(
      place?.importance
    );

  if (
    popularity !== null
  ) {
    score +=
      Math.max(
        0,
        Math.min(
          25,
          popularity * 25
        )
      );
  }

  if (
    importance !== null
  ) {
    score +=
      Math.max(
        0,
        Math.min(
          20,
          importance * 20
        )
      );
  }

  if (
    category ===
    "attractions"
  ) {
    if (
      categories.some(
        value =>
          value.includes(
            "museum"
          )
      )
    ) {
      score += 24;
    }

    if (
      categories.some(
        value =>
          value.includes(
            "sights"
          )
      )
    ) {
      score += 20;
    }

    if (
      categories.some(
        value =>
          value.includes(
            "attraction"
          )
      )
    ) {
      score += 14;
    }

    if (
      categories.some(
        value =>
          value.includes(
            "culture"
          )
      )
    ) {
      score += 14;
    }

    if (
      name.includes(
        "museum"
      )
    ) {
      score += 15;
    }

    if (
      name.includes(
        "tower"
      ) ||
      name.includes(
        "palace"
      ) ||
      name.includes(
        "fort"
      ) ||
      name.includes(
        "mosque"
      ) ||
      name.includes(
        "heritage"
      ) ||
      name.includes(
        "frame"
      )
    ) {
      score += 12;
    }

    if (
      name.includes(
        "statue"
      )
    ) {
      score -= 18;
    }
  }

  if (
    category ===
    "restaurants"
  ) {
    if (
      categories.some(
        value =>
          value.startsWith(
            "catering.restaurant"
          )
      )
    ) {
      score += 18;
    }

    if (
      categories.some(
        value =>
          value.startsWith(
            "catering.cafe"
          )
      )
    ) {
      score += 10;
    }
  }

  if (
    category ===
    "shopping"
  ) {
    if (
      categories.some(
        value =>
          value.includes(
            "shopping_mall"
          )
      )
    ) {
      score += 22;
    }

    if (
      categories.some(
        value =>
          value.includes(
            "marketplace"
          )
      )
    ) {
      score += 18;
    }

    if (
      categories.some(
        value =>
          value.includes(
            "gift_and_souvenir"
          )
      )
    ) {
      score += 8;
    }
  }

  if (
    category ===
    "experiences"
  ) {
    if (
      categories.some(
        value =>
          value.includes(
            "theme_park"
          ) ||
          value.includes(
            "water_park"
          ) ||
          value.includes(
            "aquarium"
          ) ||
          value.includes(
            "zoo"
          )
      )
    ) {
      score += 25;
    }

    if (
      categories.some(
        value =>
          value.startsWith(
            "entertainment"
          )
      )
    ) {
      score += 14;
    }

    if (
      categories.some(
        value =>
          value.startsWith(
            "leisure"
          )
      )
    ) {
      score += 10;
    }
  }

  const distance =
    numberOrNull(
      place?.distanceMeters
    );

  if (
    distance !== null
  ) {
    if (
      distance <= 3000
    ) {
      score += 5;
    } else if (
      distance <= 8000
    ) {
      score += 3;
    } else if (
      distance > 25000
    ) {
      score -= 3;
    }
  }

  return score;
}

function placeMatchesExploreCategory(
  place,
  category
) {
  const categories =
    safeArray(
      place?.categories
    ).map(
      value =>
        String(value)
          .toLowerCase()
    );

  if (
    category ===
    "restaurants"
  ) {
    return categories.some(
      value =>
        value.startsWith(
          "catering.restaurant"
        ) ||
        value.startsWith(
          "catering.cafe"
        )
    );
  }

  if (
    category ===
    "shopping"
  ) {
    return categories.some(
      value =>
        value.includes(
          "shopping_mall"
        ) ||
        value.includes(
          "department_store"
        ) ||
        value.includes(
          "marketplace"
        ) ||
        value.includes(
          "gift_and_souvenir"
        )
    );
  }

  if (
    category ===
    "experiences"
  ) {
    return categories.some(
      value =>
        value.includes(
          "theme_park"
        ) ||
        value.includes(
          "water_park"
        ) ||
        value.includes(
          "aquarium"
        ) ||
        value.includes(
          "zoo"
        ) ||
        value.includes(
          "activity_park"
        ) ||
        value.startsWith(
          "leisure.park"
        ) ||
        value.startsWith(
          "leisure.picnic"
        ) ||
        value.startsWith(
          "sport"
        )
    );
  }

  if (
    category ===
    "attractions"
  ) {
    const attraction =
      categories.some(
        value =>
          value.includes(
            "sights"
          ) ||
          value.includes(
            "museum"
          ) ||
          value.includes(
            "culture"
          ) ||
          value.startsWith(
            "heritage"
          )
      );

    const artworkOnly =
      categories.some(
        value =>
          value.includes(
            "artwork"
          ) ||
          value.includes(
            "sculpture"
          ) ||
          value.includes(
            "statue"
          )
      );

    return (
      attraction &&
      !artworkOnly
    );
  }

  return true;
}

function rankExploreResults(
  places,
  category,
  limit
) {
  const unique =
    new Map();

  const matchingPlaces =
    safeArray(
      places
    ).filter(
      place =>
        placeMatchesExploreCategory(
          place,
          category
        )
    );

  for (
    const place of matchingPlaces
  ) {
    if (
      !place ||
      isLowValueExplorePlace(
        place
      )
    ) {
      continue;
    }

    const nameKey =
      exploreNameKey(
        place.name
      );

    if (!nameKey) {
      continue;
    }

    const previous =
      unique.get(
        nameKey
      );

    if (
      !previous ||
      explorePlaceScore(
        place,
        category
      ) >
        explorePlaceScore(
          previous,
          category
        )
    ) {
      unique.set(
        nameKey,
        place
      );
    }
  }

  return [
    ...unique.values(),
  ]
    .sort(
      (a, b) => {
        const scoreDifference =
          explorePlaceScore(
            b,
            category
          ) -
          explorePlaceScore(
            a,
            category
          );

        if (
          scoreDifference !== 0
        ) {
          return scoreDifference;
        }

        return (
          Number(
            a.distanceMeters ??
              Infinity
          ) -
          Number(
            b.distanceMeters ??
              Infinity
          )
        );
      }
    )
    .slice(
      0,
      limit
    );
}

/* -------------------------------------------------------------------------- */
/*                              Explore Search                                */
/* -------------------------------------------------------------------------- */

export async function searchExplore(
  request = {}
) {
  cleanExpiredCache();

  const destination =
    request.destination ||
    {};

  const coordinates =
    locationCoordinates(
      destination
    );

  if (!coordinates) {
    return unavailableResult(
      "explore",
      "Destination coordinates are required to discover nearby places.",
      {
        provider:
          "Geoapify",

        category:
          cleanString(
            request.category,
            40
          ) ||
          "attractions",

        results: [],
      }
    );
  }

  const category =
    cleanString(
      request.category ||
        "attractions",
      40
    ).toLowerCase();

  const categories =
    exploreCategories(
      category
    );

  const radius =
    Math.max(
      1000,
      Math.min(
        integerOrNull(
          request.radiusMeters ||
            request.radius
        ) ||
          20_000,
        50_000
      )
    );

  const limit =
    Math.max(
      1,
      Math.min(
        integerOrNull(
          request.limit
        ) || 12,
        30
      )
    );

  const providerLimit =
    Math.min(
      50,
      Math.max(
        limit * 3,
        30
      )
    );

  const apiKey =
    geoapifyApiKey();

  if (!apiKey) {
    return unavailableResult(
      "explore",
      "Nearby place discovery is currently unavailable.",
      {
        provider:
          "Geoapify",

        category,

        results: [],
      }
    );
  }

  const cachePayload = {
    latitude:
      round(
        coordinates.latitude,
        5
      ),

    longitude:
      round(
        coordinates.longitude,
        5
      ),

    category,

    radius,

    limit,

    qualityVersion: 4,
  };

  const key =
    cacheKey(
      "explore",
      cachePayload
    );

  const cached =
    getCached(key);

  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  try {
    const url =
      buildUrl(
        `${geoapifyBaseUrl()}/places`,
        {
          categories:
            categories.join(
              ","
            ),

          filter:
            `circle:${coordinates.longitude},${coordinates.latitude},${radius}`,

          bias:
            `proximity:${coordinates.longitude},${coordinates.latitude}`,

          limit:
            providerLimit,

          apiKey,
        }
      );

    const response =
      await fetchJson(
        url,
        {
          provider:
            "Geoapify",

          timeoutMs:
            TIMEOUTS.geoapify,
        }
      );

    const rawResults =
      safeArray(
        response.features
      )
        .map(
          (
            feature,
            index
          ) =>
            normaliseGeoapifyPlace(
              feature,
              index
            )
        )
        .filter(Boolean);

    const results =
      rankExploreResults(
        rawResults,
        category,
        limit
      );

    const result =
      availableResult(
        "explore",
        {
          provider:
            "Geoapify",

          source:
            "nearby-search",

          destination: {
            city:
              locationCity(
                destination
              ),

            country:
              locationCountry(
                destination
              ),

            countryCode:
              locationCountryCode(
                destination
              ),

            coordinates,
          },

          category,

          radiusMeters:
            radius,

          results,

          resultCount:
            results.length,

          attribution:
            "Place information provided by Geoapify and OpenStreetMap contributors.",

          cached:
            false,

          message:
            results.length
              ? ""
              : "No nearby places were returned for this category.",
        }
      );

    setCached(
      key,
      result,
      TTL.explore
    );

    return result;
  } catch (error) {
    logProviderError(
      "Geoapify",
      error
    );

    return unavailableResult(
      "explore",
      "Nearby places could not be retrieved right now.",
      {
        provider:
          "Geoapify",

        category,

        results: [],
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Weather Code Helpers                               */
/* -------------------------------------------------------------------------- */

const WEATHER_CODES =
  Object.freeze({
    0: {
      label:
        "Clear sky",

      icon:
        "clear",
    },

    1: {
      label:
        "Mainly clear",

      icon:
        "clear",
    },

    2: {
      label:
        "Partly cloudy",

      icon:
        "cloud",
    },

    3: {
      label:
        "Overcast",

      icon:
        "cloud",
    },

    45: {
      label:
        "Fog",

      icon:
        "fog",
    },

    48: {
      label:
        "Rime fog",

      icon:
        "fog",
    },

    51: {
      label:
        "Light drizzle",

      icon:
        "rain",
    },

    53: {
      label:
        "Drizzle",

      icon:
        "rain",
    },

    55: {
      label:
        "Heavy drizzle",

      icon:
        "rain",
    },

    56: {
      label:
        "Freezing drizzle",

      icon:
        "rain",
    },

    57: {
      label:
        "Heavy freezing drizzle",

      icon:
        "rain",
    },

    61: {
      label:
        "Light rain",

      icon:
        "rain",
    },

    63: {
      label:
        "Rain",

      icon:
        "rain",
    },

    65: {
      label:
        "Heavy rain",

      icon:
        "rain",
    },

    66: {
      label:
        "Freezing rain",

      icon:
        "rain",
    },

    67: {
      label:
        "Heavy freezing rain",

      icon:
        "rain",
    },

    71: {
      label:
        "Light snow",

      icon:
        "snow",
    },

    73: {
      label:
        "Snow",

      icon:
        "snow",
    },

    75: {
      label:
        "Heavy snow",

      icon:
        "snow",
    },

    77: {
      label:
        "Snow grains",

      icon:
        "snow",
    },

    80: {
      label:
        "Light rain showers",

      icon:
        "rain",
    },

    81: {
      label:
        "Rain showers",

      icon:
        "rain",
    },

    82: {
      label:
        "Heavy rain showers",

      icon:
        "rain",
    },

    85: {
      label:
        "Light snow showers",

      icon:
        "snow",
    },

    86: {
      label:
        "Heavy snow showers",

      icon:
        "snow",
    },

    95: {
      label:
        "Thunderstorm",

      icon:
        "storm",
    },

    96: {
      label:
        "Thunderstorm with hail",

      icon:
        "storm",
    },

    99: {
      label:
        "Severe thunderstorm with hail",

      icon:
        "storm",
    },
  });

function weatherCodeInfo(
  code
) {
  const numeric =
    integerOrNull(
      code
    );

  return (
    WEATHER_CODES[
      numeric
    ] || {
      label:
        "Weather information",

      icon:
        "weather",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                         Weather Normalisation                              */
/* -------------------------------------------------------------------------- */

function normaliseWeatherDays(
  daily
) {
  if (
    !daily ||
    typeof daily !==
      "object"
  ) {
    return [];
  }

  const dates =
    safeArray(
      daily.time
    );

  const maximum =
    safeArray(
      daily
        .temperature_2m_max
    );

  const minimum =
    safeArray(
      daily
        .temperature_2m_min
    );

  const precipitation =
    safeArray(
      daily
        .precipitation_probability_max
    );

  const weatherCodes =
    safeArray(
      daily.weather_code
    );

  const sunrise =
    safeArray(
      daily.sunrise
    );

  const sunset =
    safeArray(
      daily.sunset
    );

  const wind =
    safeArray(
      daily
        .wind_speed_10m_max
    );

  return dates
    .map(
      (
        date,
        index
      ) => {
        const info =
          weatherCodeInfo(
            weatherCodes[
              index
            ]
          );

        return {
          date:
            cleanString(
              date,
              20
            ),

          condition:
            info.label,

          icon:
            info.icon,

          weatherCode:
            integerOrNull(
              weatherCodes[
                index
              ]
            ),

          temperatureMaxC:
            numberOrNull(
              maximum[
                index
              ]
            ),

          temperatureMinC:
            numberOrNull(
              minimum[
                index
              ]
            ),

          precipitationProbability:
            numberOrNull(
              precipitation[
                index
              ]
            ),

          windSpeedMaxKmh:
            numberOrNull(
              wind[
                index
              ]
            ),

          sunrise:
            cleanString(
              sunrise[
                index
              ],
              50
            ),

          sunset:
            cleanString(
              sunset[
                index
              ],
              50
            ),
        };
      }
    )
    .filter(
      (day) =>
        day.date
    );
}
/* -------------------------------------------------------------------------- */
/*                                Weather                                     */
/* -------------------------------------------------------------------------- */

export async function getWeather(
  request = {}
) {
  cleanExpiredCache();

  const destination =
    request.destination ||
    {};

  const coordinates =
    locationCoordinates(
      destination
    );

  const startDate =
    isoDate(
      request.startDate ||
        request.date
    );

  const endDate =
    isoDate(
      request.endDate ||
        startDate
    );

  if (!coordinates) {
    return unavailableResult(
      "weather",
      "Destination coordinates are required for weather information.",
      {
        provider:
          "Open-Meteo",

        days: [],
      }
    );
  }

  if (!startDate) {
    return unavailableResult(
      "weather",
      "A travel date is required for weather information.",
      {
        provider:
          "Open-Meteo",

        days: [],
      }
    );
  }

  if (
    endDate &&
    daysBetween(
      startDate,
      endDate
    ) < 0
  ) {
    return unavailableResult(
      "weather",
      "The weather date range is invalid.",
      {
        provider:
          "Open-Meteo",

        days: [],
      }
    );
  }

  const daysUntilTrip =
    dateDifferenceFromToday(
      startDate
    );

  /*
   * Open-Meteo detailed forecasts are intended for
   * near-term travel planning. For trips outside the
   * supported planning horizon we return a truthful
   * pending state rather than generating weather.
   */
  const FORECAST_HORIZON_DAYS =
    16;

  if (
    daysUntilTrip !==
      null &&
    daysUntilTrip >
      FORECAST_HORIZON_DAYS
  ) {
    return availableResult(
      "weather",
      {
        provider:
          "Open-Meteo",

        source:
          "forecast-pending",

        forecastAvailable:
          false,

        destination: {
          city:
            locationCity(
              destination
            ),

          country:
            locationCountry(
              destination
            ),

          coordinates,
        },

        startDate,

        endDate:
          endDate ||
          startDate,

        daysUntilTrip,

        days: [],

        message:
          "A detailed weather forecast will become available closer to departure.",

        cached:
          false,
      }
    );
  }

  /*
   * Historical dates are not sent to the forecast
   * endpoint.
   */
  if (
    daysUntilTrip !==
      null &&
    daysUntilTrip < 0
  ) {
    return unavailableResult(
      "weather",
      "Weather forecasts are available for upcoming travel dates.",
      {
        provider:
          "Open-Meteo",

        destination: {
          city:
            locationCity(
              destination
            ),

          country:
            locationCountry(
              destination
            ),
        },

        startDate,

        endDate:
          endDate ||
          startDate,

        days: [],
      }
    );
  }

  const requestedEnd =
    endDate ||
    startDate;

  /*
   * A trip can last up to 30 days while the detailed
   * forecast horizon is shorter. Limit the provider
   * request to the available forecast window rather
   * than sending an invalid future end date.
   */
  const today =
    todayUtc();

  const horizonDate =
    new Date(
      today.getTime() +
        FORECAST_HORIZON_DAYS *
          86_400_000
    );

  const horizonDateString =
    horizonDate
      .toISOString()
      .slice(0, 10);

  const providerEndDate =
    requestedEnd >
    horizonDateString
      ? horizonDateString
      : requestedEnd;

  const partialForecast =
    providerEndDate !==
    requestedEnd;

  const cachePayload = {
    latitude:
      round(
        coordinates.latitude,
        5
      ),

    longitude:
      round(
        coordinates.longitude,
        5
      ),

    startDate,

    providerEndDate,
  };

  const key =
    cacheKey(
      "weather",
      cachePayload
    );

  const cached =
    getCached(key);

  if (cached) {
    return {
      ...cached,

      cached: true,
    };
  }

  try {
    const url =
      buildUrl(
        `${openMeteoBaseUrl()}/forecast`,
        {
          latitude:
            coordinates.latitude,

          longitude:
            coordinates.longitude,

          start_date:
            startDate,

          end_date:
            providerEndDate,

          timezone:
            "auto",

          daily: [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "wind_speed_10m_max",
            "sunrise",
            "sunset",
          ].join(","),
        }
      );

    const response =
      await fetchJson(
        url,
        {
          provider:
            "Open-Meteo",

          timeoutMs:
            TIMEOUTS.openMeteo,
        }
      );

    const days =
      normaliseWeatherDays(
        response.daily
      );

    if (
      days.length === 0
    ) {
      throw new Error(
        "Open-Meteo returned no daily forecast data."
      );
    }

    const result =
      availableResult(
        "weather",
        {
          provider:
            "Open-Meteo",

          source:
            "forecast",

          forecastAvailable:
            true,

          partialForecast,

          destination: {
            city:
              locationCity(
                destination
              ),

            country:
              locationCountry(
                destination
              ),

            countryCode:
              locationCountryCode(
                destination
              ),

            coordinates,
          },

          timezone:
            cleanString(
              response.timezone,
              100
            ),

          timezoneAbbreviation:
            cleanString(
              response
                .timezone_abbreviation,
              40
            ),

          elevationMeters:
            numberOrNull(
              response.elevation
            ),

          startDate,

          endDate:
            requestedEnd,

          forecastEndDate:
            providerEndDate,

          days,

          cached:
            false,

          message:
            partialForecast
              ? "Weather is currently available for part of the trip. Additional forecast days will appear closer to departure."
              : "",
        }
      );

    setCached(
      key,
      result,
      TTL.weather
    );

    return result;
  } catch (error) {
    logProviderError(
      "Open-Meteo",
      error
    );

    return unavailableResult(
      "weather",
      "Weather information could not be retrieved right now.",
      {
        provider:
          "Open-Meteo",

        destination: {
          city:
            locationCity(
              destination
            ),

          country:
            locationCountry(
              destination
            ),
        },

        startDate,

        endDate:
          requestedEnd,

        days: [],
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                          Explore Bundle                                    */
/* -------------------------------------------------------------------------- */

export async function getExploreBundle(
  request = {}
) {
  /*
   * Every service catches its own provider failure and
   * returns an unavailable state. Promise.all therefore
   * remains safe and one provider cannot break the rest
   * of the Explore experience.
   */

  const [
    attractions,
    restaurants,
    shopping,
    experiences,
    weather,
    currency,
  ] =
    await Promise.all([
      searchExplore({
        ...request,

        category:
          "attractions",
      }),

      searchExplore({
        ...request,

        category:
          "restaurants",
      }),

      searchExplore({
        ...request,

        category:
          "shopping",
      }),

      searchExplore({
        ...request,

        category:
          "experiences",
      }),

      getWeather({
        destination:
          request.destination,

        startDate:
          request.startDate,

        endDate:
          request.endDate,
      }),

      getCurrency({
        destination:
          request.destination,

        countryCode:
          request.countryCode,

        base:
          request
            .baseCurrency ||
          "INR",

        target:
          request
            .targetCurrency,

        amount:
          request.amount ||
          1,
      }),
    ]);

  return {
    available:
      true,

    service:
      "explore-bundle",

    destination: {
      city:
        locationCity(
          request.destination
        ),

      country:
        locationCountry(
          request.destination
        ),

      countryCode:
        locationCountryCode(
          request.destination
        ),

      coordinates:
        locationCoordinates(
          request.destination
        ),
    },

    attractions,

    restaurants,

    shopping,

    experiences,

    weather,

    currency,
  };
}

/* -------------------------------------------------------------------------- */
/*                         Service Diagnostics                                */
/* -------------------------------------------------------------------------- */

export function getTravelServiceStatus() {
  cleanExpiredCache();

  return {
    flights: {
      provider:
        "SerpApi Google Flights",

      configured:
        Boolean(
          serpApiKey()
        ),

      feature:
        "flights",
    },

    stays: {
      provider:
        "SerpApi Google Hotels",

      configured:
        Boolean(
          serpApiKey()
        ),

      feature:
        "stays",
    },

    explore: {
      provider:
        "Geoapify",

      configured:
        Boolean(
          geoapifyApiKey()
        ),

      features: [
        "attractions",
        "restaurants",
        "shopping",
        "experiences",
      ],
    },

    weather: {
      provider:
        "Open-Meteo",

      configured:
        true,

      requiresApiKey:
        false,
    },

    currency: {
      provider:
        "Frankfurter",

      configured:
        true,

      requiresApiKey:
        false,
    },

    cache: {
      entries:
        cache.size,

      maximumEntries:
        MAX_CACHE_ENTRIES,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                       Provider Configuration Summary                       */
/* -------------------------------------------------------------------------- */

export function getTravelProviderConfig() {
  return {
    serpApi: {
      configured:
        Boolean(
          serpApiKey()
        ),

      flights:
        true,

      stays:
        true,
    },

    geoapify: {
      configured:
        Boolean(
          geoapifyApiKey()
        ),

      places:
        true,
    },

    openMeteo: {
      configured:
        true,

      requiresApiKey:
        false,
    },

    frankfurter: {
      configured:
        true,

      requiresApiKey:
        false,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               Exports                                      */
/* -------------------------------------------------------------------------- */

export {
  COUNTRY_CURRENCY,
  EXPLORE_CATEGORIES,
};