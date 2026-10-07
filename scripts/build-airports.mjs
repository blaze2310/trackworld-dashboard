/**
 * TrackWorld AI Travel Planner
 * OurAirports Dataset Builder
 *
 * Downloads the public OurAirports airport dataset and converts it
 * into a compact JSON file used by TrackWorld at runtime.
 *
 * Output:
 *   data/airports.json
 *
 * Runtime airport searches NEVER need to call OurAirports directly.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* -------------------------------------------------------------------------- */
/*                                  Paths                                     */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");

const DATA_DIR = path.join(PROJECT_ROOT, "data");

const OUTPUT_FILE = path.join(
  DATA_DIR,
  "airports.json"
);

/* -------------------------------------------------------------------------- */
/*                                  Source                                    */
/* -------------------------------------------------------------------------- */

const OURAIRPORTS_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";

/* -------------------------------------------------------------------------- */
/*                               Configuration                                */
/* -------------------------------------------------------------------------- */

/**
 * TrackWorld only needs airports that can realistically be useful for
 * passenger travel planning.
 *
 * Heliports, balloon ports, closed airports, seaplane bases, etc. are
 * intentionally excluded.
 */
const ALLOWED_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
]);

/* -------------------------------------------------------------------------- */
/*                              CSV Processing                                */
/* -------------------------------------------------------------------------- */

/**
 * Small CSV parser supporting quoted fields and escaped double quotes.
 *
 * This avoids adding another npm dependency just for the build script.
 */
function parseCsv(text) {
  const rows = [];

  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);

      if (
        row.length > 1 ||
        row.some((value) => value.trim())
      ) {
        rows.push(row);
      }

      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);

  if (
    row.length > 1 ||
    row.some((value) => value.trim())
  ) {
    rows.push(row);
  }

  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) =>
    header.trim()
  );

  return rows
    .slice(1)
    .map((row) => {
      const object = {};

      headers.forEach((header, index) => {
        object[header] =
          row[index] ?? "";
      });

      return object;
    });
}

/* -------------------------------------------------------------------------- */
/*                                Utilities                                   */
/* -------------------------------------------------------------------------- */

function clean(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function integerOrNull(value) {
  const parsed = Number.parseInt(
    value,
    10
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

/* -------------------------------------------------------------------------- */
/*                           Airport Normalisation                            */
/* -------------------------------------------------------------------------- */

function normaliseAirport(raw) {
  const type = clean(raw.type);

  if (!ALLOWED_TYPES.has(type)) {
    return null;
  }

  /**
   * Flights search requires an IATA code.
   *
   * Airports without IATA codes are therefore not useful to the final
   * TrackWorld flight workflow and are excluded from the compact file.
   */
  const iata = clean(
    raw.iata_code
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(iata)) {
    return null;
  }

  const latitude =
    numberOrNull(
      raw.latitude_deg
    );

  const longitude =
    numberOrNull(
      raw.longitude_deg
    );

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const countryCode =
    clean(
      raw.iso_country
    ).toUpperCase();

  return {
    id:
      integerOrNull(raw.id),

    ident:
      clean(raw.ident),

    iata,

    name:
      clean(raw.name),

    municipality:
      clean(raw.municipality),

    countryCode,

    type,

    latitude,
    longitude,

    scheduledService:
      clean(
        raw.scheduled_service
      ).toLowerCase() === "yes",
  };
}

/* -------------------------------------------------------------------------- */
/*                            Duplicate Handling                              */
/* -------------------------------------------------------------------------- */

function airportQualityScore(airport) {
  let score = 0;

  if (
    airport.type ===
    "large_airport"
  ) {
    score += 100;
  } else if (
    airport.type ===
    "medium_airport"
  ) {
    score += 70;
  } else {
    score += 20;
  }

  if (airport.scheduledService) {
    score += 100;
  }

  if (airport.municipality) {
    score += 10;
  }

  if (airport.name) {
    score += 5;
  }

  return score;
}

function removeDuplicateIata(
  airports
) {
  const byIata = new Map();

  for (const airport of airports) {
    const existing =
      byIata.get(
        airport.iata
      );

    if (!existing) {
      byIata.set(
        airport.iata,
        airport
      );

      continue;
    }

    if (
      airportQualityScore(
        airport
      ) >
      airportQualityScore(
        existing
      )
    ) {
      byIata.set(
        airport.iata,
        airport
      );
    }
  }

  return Array.from(
    byIata.values()
  );
}

/* -------------------------------------------------------------------------- */
/*                               Sort Output                                  */
/* -------------------------------------------------------------------------- */

function airportTypeRank(type) {
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

function sortAirports(airports) {
  return airports.sort(
    (a, b) => {
      if (
        a.countryCode !==
        b.countryCode
      ) {
        return a.countryCode.localeCompare(
          b.countryCode
        );
      }

      if (
        a.scheduledService !==
        b.scheduledService
      ) {
        return Number(
          b.scheduledService
        ) -
          Number(
            a.scheduledService
          );
      }

      const typeDifference =
        airportTypeRank(
          b.type
        ) -
        airportTypeRank(
          a.type
        );

      if (typeDifference !== 0) {
        return typeDifference;
      }

      return a.iata.localeCompare(
        b.iata
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Build                                     */
/* -------------------------------------------------------------------------- */

async function downloadDataset() {
  console.log(
    "[TrackWorld] Downloading OurAirports dataset..."
  );

  const response = await fetch(
    OURAIRPORTS_URL,
    {
      headers: {
        "User-Agent":
          "TrackWorld-AI-Travel-Planner/1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `OurAirports download failed with HTTP ${response.status}.`
    );
  }

  const csv =
    await response.text();

  if (!csv.trim()) {
    throw new Error(
      "OurAirports returned an empty dataset."
    );
  }

  return csv;
}

async function build() {
  const startedAt = Date.now();

  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    }
  );

  const csv =
    await downloadDataset();

  console.log(
    "[TrackWorld] Parsing airport data..."
  );

  const records =
    csvToObjects(csv);

  console.log(
    `[TrackWorld] Source rows: ${records.length.toLocaleString()}`
  );

  let processed =
    records
      .map(normaliseAirport)
      .filter(Boolean);

  console.log(
    `[TrackWorld] Passenger-relevant airports with IATA codes: ${processed.length.toLocaleString()}`
  );

  processed =
    removeDuplicateIata(
      processed
    );

  processed =
    sortAirports(
      processed
    );

  if (processed.length === 0) {
    throw new Error(
      "Airport processing produced no usable records."
    );
  }

  await fs.writeFile(
    OUTPUT_FILE,
    `${JSON.stringify(
      processed,
      null,
      2
    )}\n`,
    "utf8"
  );

  const scheduledCount =
    processed.filter(
      (airport) =>
        airport.scheduledService
    ).length;

  const largeCount =
    processed.filter(
      (airport) =>
        airport.type ===
        "large_airport"
    ).length;

  const mediumCount =
    processed.filter(
      (airport) =>
        airport.type ===
        "medium_airport"
    ).length;

  const smallCount =
    processed.filter(
      (airport) =>
        airport.type ===
        "small_airport"
    ).length;

  const elapsed =
    (
      (Date.now() -
        startedAt) /
      1000
    ).toFixed(2);

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    " TrackWorld airport dataset complete"
  );
  console.log(
    "========================================"
  );

  console.log(
    `Total airports:    ${processed.length.toLocaleString()}`
  );

  console.log(
    `Scheduled service: ${scheduledCount.toLocaleString()}`
  );

  console.log(
    `Large airports:    ${largeCount.toLocaleString()}`
  );

  console.log(
    `Medium airports:   ${mediumCount.toLocaleString()}`
  );

  console.log(
    `Small airports:    ${smallCount.toLocaleString()}`
  );

  console.log(
    `Output:            ${path.relative(
      PROJECT_ROOT,
      OUTPUT_FILE
    )}`
  );

  console.log(
    `Build time:        ${elapsed}s`
  );

  console.log(
    "========================================"
  );

  /* ---------------------------------------------------------------------- */
  /*                          Quick sanity checks                            */
  /* ---------------------------------------------------------------------- */

  const importantCodes = [
    "DEL",
    "BOM",
    "DXB",
    "LHR",
    "JFK",
    "SIN",
  ];

  console.log("");
  console.log(
    "[TrackWorld] Sanity check:"
  );

  for (const code of importantCodes) {
    const airport =
      processed.find(
        (item) =>
          item.iata === code
      );

    if (airport) {
      console.log(
        `✓ ${code} — ${airport.name} (${airport.municipality})`
      );
    } else {
      console.warn(
        `⚠ ${code} was not found.`
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Run                                      */
/* -------------------------------------------------------------------------- */

build().catch((error) => {
  console.error("");
  console.error(
    "[TrackWorld] Airport dataset build failed."
  );

  console.error(
    error instanceof Error
      ? error.message
      : error
  );

  process.exitCode = 1;
});