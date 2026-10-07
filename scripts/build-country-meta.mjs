/**
 * TrackWorld AI Travel Planner
 * Country Metadata Builder
 *
 * Creates:
 *   data/country-meta.json
 *
 * Used at runtime for:
 * - Country identification
 * - Destination currency
 * - Currency name
 * - Currency symbol
 *
 * The final TrackWorld application reads the generated JSON locally.
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

const DATA_DIR = path.join(
  PROJECT_ROOT,
  "data"
);

const OUTPUT_FILE = path.join(
  DATA_DIR,
  "country-meta.json"
);

/* -------------------------------------------------------------------------- */
/*                                   Source                                   */
/* -------------------------------------------------------------------------- */

/**
 * REST Countries is used only during this build step.
 *
 * TrackWorld does NOT need to call this service whenever a traveller
 * opens the application.
 */
const COUNTRIES_URL =
  "https://restcountries.com/v3.1/all?fields=name,cca2,currencies";

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function clean(value) {
  return String(value ?? "").trim();
}

function validCountryCode(value) {
  return /^[A-Z]{2}$/.test(value);
}

function validCurrencyCode(value) {
  return /^[A-Z]{3}$/.test(value);
}

/* -------------------------------------------------------------------------- */
/*                         Currency Selection Logic                           */
/* -------------------------------------------------------------------------- */

/**
 * Most countries expose one currency.
 *
 * If a country exposes multiple currencies, sort the currency codes to
 * make the generated output deterministic.
 */
function getPrimaryCurrency(currencies) {
  if (
    !currencies ||
    typeof currencies !== "object"
  ) {
    return null;
  }

  const entries = Object.entries(
    currencies
  )
    .filter(([code]) =>
      validCurrencyCode(
        clean(code).toUpperCase()
      )
    )
    .sort(([a], [b]) =>
      a.localeCompare(b)
    );

  if (entries.length === 0) {
    return null;
  }

  const [currencyCode, details] =
    entries[0];

  return {
    currencyCode:
      clean(
        currencyCode
      ).toUpperCase(),

    currencyName:
      clean(
        details?.name
      ),

    currencySymbol:
      clean(
        details?.symbol
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                           Country Normalisation                            */
/* -------------------------------------------------------------------------- */

function normaliseCountry(raw) {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const countryCode =
    clean(
      raw.cca2
    ).toUpperCase();

  if (
    !validCountryCode(
      countryCode
    )
  ) {
    return null;
  }

  const countryName =
    clean(
      raw.name?.common
    );

  if (!countryName) {
    return null;
  }

  const currency =
    getPrimaryCurrency(
      raw.currencies
    );

  return {
    countryCode,
    countryName,

    currencyCode:
      currency?.currencyCode ??
      "",

    currencyName:
      currency?.currencyName ??
      "",

    currencySymbol:
      currency?.currencySymbol ??
      "",
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Download                                   */
/* -------------------------------------------------------------------------- */

async function downloadCountries() {
  console.log(
    "[TrackWorld] Downloading country metadata..."
  );

  const response =
    await fetch(
      COUNTRIES_URL,
      {
        headers: {
          "User-Agent":
            "TrackWorld-AI-Travel-Planner/1.0",
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `Country metadata download failed with HTTP ${response.status}.`
    );
  }

  const data =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Country metadata source returned an unexpected response."
    );
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*                                   Build                                    */
/* -------------------------------------------------------------------------- */

async function build() {
  const startedAt =
    Date.now();

  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    }
  );

  const sourceCountries =
    await downloadCountries();

  console.log(
    `[TrackWorld] Source countries: ${sourceCountries.length.toLocaleString()}`
  );

  const normalised =
    sourceCountries
      .map(
        normaliseCountry
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.countryCode.localeCompare(
            b.countryCode
          )
      );

  if (
    normalised.length === 0
  ) {
    throw new Error(
      "Country processing produced no usable records."
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                      Convert to country-code map                        */
  /* ---------------------------------------------------------------------- */

  const output = {};

  for (
    const country of normalised
  ) {
    output[
      country.countryCode
    ] = country;
  }

  await fs.writeFile(
    OUTPUT_FILE,
    `${JSON.stringify(
      output,
      null,
      2
    )}\n`,
    "utf8"
  );

  const withCurrency =
    normalised.filter(
      (country) =>
        country.currencyCode
    ).length;

  const withoutCurrency =
    normalised.length -
    withCurrency;

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
    " TrackWorld country metadata complete"
  );
  console.log(
    "========================================"
  );

  console.log(
    `Countries:          ${normalised.length.toLocaleString()}`
  );

  console.log(
    `With currency:      ${withCurrency.toLocaleString()}`
  );

  console.log(
    `Without currency:   ${withoutCurrency.toLocaleString()}`
  );

  console.log(
    `Output:             ${path.relative(
      PROJECT_ROOT,
      OUTPUT_FILE
    )}`
  );

  console.log(
    `Build time:         ${elapsed}s`
  );

  console.log(
    "========================================"
  );

  /* ---------------------------------------------------------------------- */
  /*                           Sanity Checks                                 */
  /* ---------------------------------------------------------------------- */

  const importantCountries = [
    "IN",
    "AE",
    "GB",
    "US",
    "SG",
    "JP",
    "CH",
  ];

  console.log("");
  console.log(
    "[TrackWorld] Sanity check:"
  );

  for (
    const code of
    importantCountries
  ) {
    const country =
      output[code];

    if (!country) {
      console.warn(
        `⚠ ${code} was not found.`
      );

      continue;
    }

    console.log(
      `✓ ${code} — ${country.countryName} — ${country.currencyCode || "No currency"}${
        country.currencySymbol
          ? ` (${country.currencySymbol})`
          : ""
      }`
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Run                                     */
/* -------------------------------------------------------------------------- */

build().catch(
  (error) => {
    console.error("");
    console.error(
      "[TrackWorld] Country metadata build failed."
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode = 1;
  }
);