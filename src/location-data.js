/**
 * TrackWorld AI Travel Planner
 * Location Data Service
 *
 * Responsibilities:
 * - Load local GeoNames city data
 * - Search and resolve cities
 * - Preserve country / coordinates
 * - Load local OurAirports data
 * - Resolve the nearest practical passenger airport
 *
 * Runtime data:
 *   data/cities.json
 *   data/airports.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* -------------------------------------------------------------------------- */
/*                                   Paths                                    */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const CITIES_FILE = path.join(PROJECT_ROOT, "data", "cities.json");
const AIRPORTS_FILE = path.join(PROJECT_ROOT, "data", "airports.json");

/* -------------------------------------------------------------------------- */
/*                                  Storage                                   */
/* -------------------------------------------------------------------------- */

let loaded = false;
let loadingPromise = null;

let cities = [];
let airports = [];

let cityMetadata = {};

let cityByGeoNameId = new Map();
let airportsByCountry = new Map();
let airportByIata = new Map();

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function clean(value) {
  return String(value ?? "").trim();
}

function normaliseText(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInteger(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values
        .map(clean)
        .filter(Boolean)
    ),
  ];
}

/* -------------------------------------------------------------------------- */
/*                              City Normalisation                            */
/* -------------------------------------------------------------------------- */

function normaliseCity(raw) {
  if (!Array.isArray(raw) || raw.length < 10) {
    return null;
  }

  const [
    geoNameId,
    name,
    asciiName,
    alternateNames,
    countryCode,
    countryName,
    adminName,
    population,
    latitude,
    longitude,
  ] = raw;

  const id = toInteger(geoNameId, 0);
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);

  if (!id || lat === null || lon === null) {
    return null;
  }

  const cityName = clean(name);

  if (!cityName) {
    return null;
  }

  const aliases = uniqueStrings([
    cityName,
    asciiName,
    ...(Array.isArray(alternateNames) ? alternateNames : []),
  ]);

  const searchable = normaliseText(
    [
      ...aliases,
      adminName,
      countryName,
      countryCode,
    ].join(" ")
  );

  return {
    geoNameId: id,
    name: cityName,
    asciiName: clean(asciiName) || cityName,
    aliases,
    countryCode: clean(countryCode).toUpperCase(),
    country: clean(countryName),
    region: clean(adminName),
    population: toInteger(population, 0),
    latitude: lat,
    longitude: lon,
    searchable,
    searchName: normaliseText(cityName),
    searchAscii: normaliseText(
      clean(asciiName) || cityName
    ),
    searchCountry: normaliseText(
      countryName
    ),
    searchRegion: normaliseText(
      adminName
    ),
    searchAliases:
      aliases.map(normaliseText),
    populationScore:
      toInteger(population, 0) > 0
        ? Math.min(
            120,
            Math.log10(
              toInteger(population, 0) + 1
            ) * 15
          )
        : 0,
  };
}

/* -------------------------------------------------------------------------- */
/*                            Airport Normalisation                           */
/* -------------------------------------------------------------------------- */

function normaliseAirport(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const iata = clean(raw.iata).toUpperCase();
  const latitude = toNumber(raw.latitude);
  const longitude = toNumber(raw.longitude);

  if (
    !/^[A-Z]{3}$/.test(iata) ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  return {
    id: clean(raw.id),
    ident: clean(raw.ident),
    iata,
    name: clean(raw.name),
    municipality: clean(raw.municipality),
    countryCode: clean(raw.countryCode).toUpperCase(),
    type: clean(raw.type),
    latitude,
    longitude,
    scheduledService: Boolean(raw.scheduledService),
  };
}

/* -------------------------------------------------------------------------- */
/*                                 File Load                                  */
/* -------------------------------------------------------------------------- */

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Unable to load ${path.relative(PROJECT_ROOT, filePath)}: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

function extractCityRecords(rawCities) {
  if (
    rawCities &&
    typeof rawCities === "object" &&
    !Array.isArray(rawCities) &&
    Array.isArray(rawCities.cities)
  ) {
    cityMetadata =
      rawCities.metadata &&
      typeof rawCities.metadata === "object"
        ? rawCities.metadata
        : {};

    return rawCities.cities;
  }

  if (Array.isArray(rawCities)) {
    cityMetadata = {};
    return rawCities;
  }

  throw new Error(
    "data/cities.json must contain a top-level cities array."
  );
}

async function loadData() {
  if (loaded) {
    return;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const [rawCities, rawAirports] = await Promise.all([
      readJson(CITIES_FILE),
      readJson(AIRPORTS_FILE),
    ]);

    const cityRecords = extractCityRecords(rawCities);

    if (!Array.isArray(rawAirports)) {
      throw new Error(
        "data/airports.json must contain an array."
      );
    }

    cities = cityRecords
      .map(normaliseCity)
      .filter(Boolean);

    airports = rawAirports
      .map(normaliseAirport)
      .filter(Boolean);

    if (cities.length === 0) {
      throw new Error(
        "No usable cities were loaded from data/cities.json."
      );
    }

    if (airports.length === 0) {
      throw new Error(
        "No usable airports were loaded from data/airports.json."
      );
    }

    cityByGeoNameId = new Map();

    for (const city of cities) {
      cityByGeoNameId.set(
        city.geoNameId,
        city
      );
    }

    airportByIata = new Map();
    airportsByCountry = new Map();

    for (const airport of airports) {
      airportByIata.set(
        airport.iata,
        airport
      );

      const countryCode =
        airport.countryCode || "__";

      if (
        !airportsByCountry.has(
          countryCode
        )
      ) {
        airportsByCountry.set(
          countryCode,
          []
        );
      }

      airportsByCountry
        .get(countryCode)
        .push(airport);
    }

    loaded = true;

    console.log(
      `[TrackWorld] Location data ready: ${cities.length.toLocaleString()} cities, ${airports.length.toLocaleString()} airports.`
    );
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                Public City                                 */
/* -------------------------------------------------------------------------- */

function publicCity(city) {
  if (!city) {
    return null;
  }

  return {
    geoNameId: city.geoNameId,
    name: city.name,
    city: city.name,
    region: city.region,
    country: city.country,
    countryCode: city.countryCode,
    latitude: city.latitude,
    longitude: city.longitude,
  };
}

/* -------------------------------------------------------------------------- */
/*                              City Search Score                             */
/* -------------------------------------------------------------------------- */

function scoreCity(city, query) {
  const q = query;

  if (!q) {
    return -Infinity;
  }

  let score = 0;

  if (city.searchName === q) {
    score += 1000;
  }

  if (city.searchAscii === q) {
    score += 950;
  }

  if (
    city.searchName.startsWith(q)
  ) {
    score += 700;
  }

  if (
    city.searchAscii.startsWith(q)
  ) {
    score += 650;
  }

  if (
    city.searchAliases.includes(q)
  ) {
    score += 600;
  }

  if (
    city.searchable.includes(q)
  ) {
    score += 300;
  }

  if (city.searchCountry === q) {
    score += 100;
  }

  if (city.searchRegion === q) {
    score += 80;
  }

  score += city.populationScore;

  return score;
}

/* -------------------------------------------------------------------------- */
/*                                City Search                                 */
/* -------------------------------------------------------------------------- */

export async function searchCities(
  query,
  options = {}
) {
  await loadData();

  const q =
    normaliseText(query);

  if (q.length < 2) {
    return [];
  }

  const limit = Math.max(
    1,
    Math.min(
      Number(options.limit) || 10,
      25
    )
  );

  const countryCode =
    clean(
      options.countryCode
    ).toUpperCase();

  const best = [];

  for (const city of cities) {
    if (
      countryCode &&
      city.countryCode !==
        countryCode
    ) {
      continue;
    }

    const score =
      scoreCity(city, q);

    if (score <= 0) {
      continue;
    }

    const item = {
      city,
      score,
    };

    let insertAt =
      best.length;

    for (
      let index = 0;
      index < best.length;
      index += 1
    ) {
      const existing =
        best[index];

      if (
        score >
          existing.score ||
        (
          score ===
            existing.score &&
          city.population >
            existing.city.population
        )
      ) {
        insertAt = index;
        break;
      }
    }

    if (insertAt < limit) {
      best.splice(
        insertAt,
        0,
        item
      );

      if (
        best.length >
        limit
      ) {
        best.pop();
      }
    } else if (
      best.length < limit
    ) {
      best.push(item);
    }
  }

  return best.map(
    ({ city }) =>
      publicCity(city)
  );
}

/* -------------------------------------------------------------------------- */
/*                               City Resolve                                 */
/* -------------------------------------------------------------------------- */

export async function resolveCity(
  input
) {
  await loadData();

  if (!input) {
    return null;
  }

  if (
    typeof input === "object" &&
    input.geoNameId
  ) {
    const id = toInteger(
      input.geoNameId,
      0
    );

    if (
      id &&
      cityByGeoNameId.has(id)
    ) {
      return publicCity(
        cityByGeoNameId.get(id)
      );
    }
  }

  const query =
    typeof input === "string"
      ? input
      : [
          input.city,
          input.name,
          input.region,
          input.country,
        ]
          .filter(Boolean)
          .join(" ");

  const countryCode =
    typeof input === "object"
      ? clean(
          input.countryCode
        ).toUpperCase()
      : "";

  const matches =
    await searchCities(
      query,
      {
        limit: 1,
        ...(countryCode
          ? {
              countryCode,
            }
          : {}),
      }
    );

  return matches[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/*                              Distance Helper                               */
/* -------------------------------------------------------------------------- */

function degreesToRadians(
  value
) {
  return (
    (value * Math.PI) /
    180
  );
}

export function distanceKm(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadiusKm =
    6371.0088;

  const dLat =
    degreesToRadians(
      lat2 - lat1
    );

  const dLon =
    degreesToRadians(
      lon2 - lon1
    );

  const a =
    Math.sin(
      dLat / 2
    ) ** 2 +
    Math.cos(
      degreesToRadians(
        lat1
      )
    ) *
      Math.cos(
        degreesToRadians(
          lat2
        )
      ) *
      Math.sin(
        dLon / 2
      ) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return (
    earthRadiusKm * c
  );
}

/* -------------------------------------------------------------------------- */
/*                             Airport Ranking                                */
/* -------------------------------------------------------------------------- */

function airportTypeRank(
  type
) {
  switch (type) {
    case "large_airport":
      return 3;

    case "medium_airport":
      return 2;

    case "small_airport":
      return 1;

    default:
      return 0;
  }
}

function publicAirport(
  airport,
  distance = null
) {
  if (!airport) {
    return null;
  }

  return {
    iata:
      airport.iata,

    name:
      airport.name,

    municipality:
      airport.municipality,

    countryCode:
      airport.countryCode,

    type:
      airport.type,

    scheduledService:
      airport.scheduledService,

    latitude:
      airport.latitude,

    longitude:
      airport.longitude,

    distanceKm:
      Number.isFinite(
        distance
      )
        ? Number(
            distance.toFixed(1)
          )
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Airport Lookup                                */
/* -------------------------------------------------------------------------- */

export async function getAirportByIata(
  iata
) {
  await loadData();

  const code =
    clean(iata)
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      code
    )
  ) {
    return null;
  }

  const airport =
    airportByIata.get(
      code
    );

  return airport
    ? publicAirport(
        airport
      )
    : null;
}

/* -------------------------------------------------------------------------- */
/*                           Nearest Airport Search                           */
/* -------------------------------------------------------------------------- */

export async function findNearestAirports(
  location,
  options = {}
) {
  await loadData();

  const latitude =
    toNumber(
      location?.latitude
    );

  const longitude =
    toNumber(
      location?.longitude
    );

  if (
    latitude === null ||
    longitude === null
  ) {
    return [];
  }

  const countryCode =
    clean(
      location?.countryCode
    ).toUpperCase();

  const limit = Math.max(
    1,
    Math.min(
      Number(
        options.limit
      ) || 5,
      10
    )
  );

  const countryAirports =
    countryCode &&
    airportsByCountry.has(
      countryCode
    )
      ? airportsByCountry.get(
          countryCode
        )
      : [];

  const candidates =
    countryAirports.length > 0
      ? countryAirports
      : airports;

  return candidates
    .map((airport) => {
      const distance =
        distanceKm(
          latitude,
          longitude,
          airport.latitude,
          airport.longitude
        );

      let score =
        distance;

      if (
        airport.scheduledService
      ) {
        score -= 100;
      }

      score -=
        airportTypeRank(
          airport.type
        ) * 20;

      return {
        airport,
        distance,
        score,
      };
    })
    .sort((a, b) => {
      if (
        a.score !== b.score
      ) {
        return (
          a.score -
          b.score
        );
      }

      return (
        a.distance -
        b.distance
      );
    })
    .slice(0, limit)
    .map(
      ({
        airport,
        distance,
      }) =>
        publicAirport(
          airport,
          distance
        )
    );
}

/* -------------------------------------------------------------------------- */
/*                             Airport Resolver                               */
/* -------------------------------------------------------------------------- */

export async function resolveAirport(
  location
) {
  await loadData();

  if (!location) {
    return null;
  }

  const explicitIata =
    clean(
      location?.airport?.iata ??
        location?.iata
    ).toUpperCase();

  if (
    /^[A-Z]{3}$/.test(
      explicitIata
    )
  ) {
    const exact =
      await getAirportByIata(
        explicitIata
      );

    if (exact) {
      return exact;
    }
  }

  const nearest =
    await findNearestAirports(
      location,
      {
        limit: 5,
      }
    );

  if (
    nearest.length === 0
  ) {
    return null;
  }

  const scheduledMajor =
    nearest.find(
      (airport) =>
        airport.scheduledService &&
        (
          airport.type ===
            "large_airport" ||
          airport.type ===
            "medium_airport"
        )
    );

  if (scheduledMajor) {
    return scheduledMajor;
  }

  const scheduled =
    nearest.find(
      (airport) =>
        airport.scheduledService
    );

  return (
    scheduled ??
    nearest[0]
  );
}

/* -------------------------------------------------------------------------- */
/*                          Complete Location Resolve                         */
/* -------------------------------------------------------------------------- */

export async function enrichLocation(
  input
) {
  const city =
    await resolveCity(
      input
    );

  if (!city) {
    return null;
  }

  const airport =
    await resolveAirport(
      city
    );

  return {
    ...city,
    airport,
  };
}

/* -------------------------------------------------------------------------- */
/*                            Trip Location Resolve                           */
/* -------------------------------------------------------------------------- */

export async function enrichTripLocations({
  origin,
  destination,
}) {
  const [
    resolvedOrigin,
    resolvedDestination,
  ] = await Promise.all([
    enrichLocation(origin),
    enrichLocation(
      destination
    ),
  ]);

  return {
    origin:
      resolvedOrigin,

    destination:
      resolvedDestination,
  };
}

/* -------------------------------------------------------------------------- */
/*                                Diagnostics                                 */
/* -------------------------------------------------------------------------- */

export async function getLocationDataStats() {
  await loadData();

  const scheduledAirports =
    airports.filter(
      (airport) =>
        airport.scheduledService
    ).length;

  const countries =
    new Set(
      cities
        .map(
          (city) =>
            city.countryCode
        )
        .filter(Boolean)
    );

  return {
    cities:
      cities.length,

    airports:
      airports.length,

    scheduledAirports,

    countries:
      countries.size,

    cityDatasetMetadata:
      cityMetadata,
  };
}