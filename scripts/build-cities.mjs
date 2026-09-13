import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'cities.json');

const GEONAMES_BASE_URL =
  'https://download.geonames.org/export/dump';

const SOURCE_URLS = {
  cities: `${GEONAMES_BASE_URL}/cities500.zip`,
  countries: `${GEONAMES_BASE_URL}/countryInfo.txt`,
  adminRegions: `${GEONAMES_BASE_URL}/admin1CodesASCII.txt`
};

const MAX_ALIASES_PER_CITY = 8;
const MAX_ALIAS_LENGTH = 80;
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulAlias(alias, excludedNames) {
  if (!alias) return false;
  if (alias.length > MAX_ALIAS_LENGTH) return false;
  if (/^https?:\/\//i.test(alias)) return false;
  if (/^\d+$/.test(alias)) return false;

  const normalizedAlias = normalizeText(alias);

  if (!normalizedAlias) return false;
  if (normalizedAlias.length < 2) return false;
  if (excludedNames.has(normalizedAlias)) return false;

  return true;
}

function selectAliases(rawAliases, cityName, asciiName) {
  const excludedNames = new Set([
    normalizeText(cityName),
    normalizeText(asciiName)
  ]);

  const aliases = [];
  const aliasesSeen = new Set();

  for (const rawAlias of String(rawAliases || '').split(',')) {
    const alias = cleanText(rawAlias);
    const normalizedAlias = normalizeText(alias);

    if (!isUsefulAlias(alias, excludedNames)) continue;
    if (aliasesSeen.has(normalizedAlias)) continue;

    aliasesSeen.add(normalizedAlias);
    aliases.push(alias);

    if (aliases.length >= MAX_ALIASES_PER_CITY) {
      break;
    }
  }

  return aliases;
}

async function downloadBuffer(url, description) {
  console.log(`Downloading ${description}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Trackworld-Travel-Planner/1.0 city database builder'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Could not download ${description}. ` +
      `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function downloadText(url, description) {
  console.log(`Downloading ${description}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Trackworld-Travel-Planner/1.0 city database builder'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Could not download ${description}. ` +
      `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.text();
}

function parseCountries(text) {
  const countries = new Map();

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;

    const columns = line.split('\t');
    const countryCode = cleanText(columns[0]);
    const countryName = cleanText(columns[4]);

    if (countryCode && countryName) {
      countries.set(countryCode, countryName);
    }
  }

  return countries;
}

function parseAdminRegions(text) {
  const regions = new Map();

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;

    const columns = line.split('\t');
    const regionCode = cleanText(columns[0]);
    const regionName =
      cleanText(columns[1]) ||
      cleanText(columns[2]);

    if (regionCode && regionName) {
      regions.set(regionCode, regionName);
    }
  }

  return regions;
}

function parseCities(text, countries, adminRegions) {
  const cities = [];
  const countryCounts = new Map();
  let skippedRows = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;

    const columns = line.split('\t');

    if (columns.length < 19) {
      skippedRows += 1;
      continue;
    }

    const id = Number(columns[0]);
    const name = cleanText(columns[1]);
    const asciiName = cleanText(columns[2]) || name;
    const rawAliases = columns[3];
    const latitude = Number(columns[4]);
    const longitude = Number(columns[5]);
    const featureClass = cleanText(columns[6]);
    const countryCode = cleanText(columns[8]);
    const admin1Code = cleanText(columns[10]);
    const population = Number(columns[14]) || 0;

    if (
      !Number.isInteger(id) ||
      !name ||
      !countryCode ||
      featureClass !== 'P' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      skippedRows += 1;
      continue;
    }

    const countryName =
      countries.get(countryCode) ||
      countryCode;

    const regionKey = admin1Code
      ? `${countryCode}.${admin1Code}`
      : '';

    const regionName =
      adminRegions.get(regionKey) || '';

    const aliases = selectAliases(
      rawAliases,
      name,
      asciiName
    );

    /*
     * Compact city row format:
     *
     * 0  GeoNames ID
     * 1  City name
     * 2  ASCII city name
     * 3  Alternate names
     * 4  Country code
     * 5  Country name
     * 6  State or administrative region
     * 7  Population
     * 8  Latitude
     * 9  Longitude
     */
    cities.push([
      id,
      name,
      asciiName,
      aliases,
      countryCode,
      countryName,
      regionName,
      population,
      latitude,
      longitude
    ]);

    countryCounts.set(
      countryCode,
      (countryCounts.get(countryCode) || 0) + 1
    );
  }

  cities.sort((cityA, cityB) => {
    const populationDifference =
      cityB[7] - cityA[7];

    if (populationDifference !== 0) {
      return populationDifference;
    }

    const countryDifference =
      cityA[5].localeCompare(cityB[5]);

    if (countryDifference !== 0) {
      return countryDifference;
    }

    return cityA[1].localeCompare(cityB[1]);
  });

  return {
    cities,
    countryCounts,
    skippedRows
  };
}

async function extractCitiesFile(zipFilePath) {
  console.log('Extracting cities500.txt...');

  try {
    return execFileSync(
      'unzip',
      ['-p', zipFilePath, 'cities500.txt'],
      {
        encoding: 'utf8',
        maxBuffer: MAX_UNCOMPRESSED_BYTES
      }
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'The unzip command is unavailable. ' +
        'On macOS it should already be installed.'
      );
    }

    throw new Error(
      `Could not extract the GeoNames archive: ${error.message}`
    );
  }
}

function formatFileSize(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
}

async function buildCityDatabase() {
  console.log('');
  console.log('Trackworld global city database builder');
  console.log('This does not make any Gemini API requests.');
  console.log('');

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'trackworld-cities-')
  );

  const zipFilePath = path.join(
    temporaryDirectory,
    'cities500.zip'
  );

  try {
    const [
      citiesArchive,
      countriesText,
      adminRegionsText
    ] = await Promise.all([
      downloadBuffer(
        SOURCE_URLS.cities,
        'GeoNames cities500 database'
      ),
      downloadText(
        SOURCE_URLS.countries,
        'GeoNames country information'
      ),
      downloadText(
        SOURCE_URLS.adminRegions,
        'GeoNames administrative regions'
      )
    ]);

    await writeFile(zipFilePath, citiesArchive);

    const citiesText = await extractCitiesFile(
      zipFilePath
    );

    console.log('Processing countries and cities...');

    const countries = parseCountries(countriesText);
    const adminRegions =
      parseAdminRegions(adminRegionsText);

    const {
      cities,
      countryCounts,
      skippedRows
    } = parseCities(
      citiesText,
      countries,
      adminRegions
    );

    const database = {
      metadata: {
        source: 'GeoNames cities500',
        sourceUrl: SOURCE_URLS.cities,
        attribution: 'GeoNames',
        attributionUrl: 'https://www.geonames.org/',
        license: 'Creative Commons Attribution 4.0',
        licenseUrl:
          'https://creativecommons.org/licenses/by/4.0/',
        generatedAt: new Date().toISOString(),
        description:
          'Cities with more than 500 residents plus administrative seats included by GeoNames.',
        columns: [
          'id',
          'name',
          'asciiName',
          'aliases',
          'countryCode',
          'country',
          'region',
          'population',
          'latitude',
          'longitude'
        ],
        cityCount: cities.length,
        countryCount: countryCounts.size,
        indiaCityCount: countryCounts.get('IN') || 0
      },
      cities
    };

    const output = JSON.stringify(database);

    await mkdir(OUTPUT_DIR, {
      recursive: true
    });

    await writeFile(
      OUTPUT_FILE,
      output,
      'utf8'
    );

    console.log('');
    console.log('City database created successfully.');
    console.log(`Cities: ${cities.length.toLocaleString()}`);
    console.log(
      `Indian cities: ${(countryCounts.get('IN') || 0).toLocaleString()}`
    );
    console.log(
      `Countries and territories: ${countryCounts.size.toLocaleString()}`
    );
    console.log(`Skipped invalid rows: ${skippedRows}`);
    console.log(
      `File size: ${formatFileSize(Buffer.byteLength(output))}`
    );
    console.log(`Saved to: ${OUTPUT_FILE}`);
    console.log('');
  } finally {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true
    });
  }
}

buildCityDatabase().catch((error) => {
  console.error('');
  console.error('City database creation failed.');
  console.error(error.message);
  console.error('');
  process.exitCode = 1;
});