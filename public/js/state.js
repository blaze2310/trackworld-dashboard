/**
 * TrackWorld AI Travel Planner
 * Shared Browser State
 */

export const STORAGE_KEYS = Object.freeze({
  activeTrip: "trackworld-active-trip-v1",
  savedTrips: "trackworld-saved-trips-v1",
  bucketList: "trackworld-bucket-list-v1",
  preferences: "trackworld-preferences-v1",
});

const LIMITS = Object.freeze({
  savedTrips: 25,
  bucketList: 50,
});

/* ==========================================================================
   Generic Storage
   ========================================================================== */

function safeParse(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function read(key, fallback = null) {
  try {
    return safeParse(
      localStorage.getItem(key),
      fallback
    );
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );

    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function createId(prefix = "item") {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function clean(value) {
  return String(value ?? "").trim();
}

/* ==========================================================================
   Active Trip
   ========================================================================== */

export function getActiveTrip() {
  return read(
    STORAGE_KEYS.activeTrip,
    null
  );
}

export function setActiveTrip(trip) {
  if (!trip) {
    return false;
  }

  return write(
    STORAGE_KEYS.activeTrip,
    trip
  );
}

export function clearActiveTrip() {
  return remove(
    STORAGE_KEYS.activeTrip
  );
}

/* ==========================================================================
   Saved Trips
   ========================================================================== */

export function getSavedTrips() {
  const trips = read(
    STORAGE_KEYS.savedTrips,
    []
  );

  return Array.isArray(trips)
    ? trips
    : [];
}

export function saveTrip(trip, metadata = {}) {
  if (!trip) {
    return null;
  }

  const existing =
    getSavedTrips();

  const itinerary =
    trip.itinerary ??
    trip.result ??
    trip.data ??
    trip;

  const requestId =
    clean(
      metadata.requestId ??
        itinerary?.requestId ??
        trip?.requestId
    );

  const id =
    clean(metadata.id) ||
    requestId ||
    createId("trip");

  const record = {
    id,

    savedAt:
      Date.now(),

    updatedAt:
      Date.now(),

    title:
      clean(
        metadata.title ??
          itinerary?.tripTitle ??
          trip?.tripTitle
      ),

    origin:
      metadata.origin ??
      trip?.origin ??
      trip?.input?.origin ??
      null,

    destination:
      metadata.destination ??
      trip?.destination ??
      trip?.input?.destination ??
      null,

    start:
      metadata.start ??
      trip?.start ??
      trip?.input?.start ??
      null,

    end:
      metadata.end ??
      trip?.end ??
      trip?.input?.end ??
      null,

    trip,
  };

  const previous =
    existing.find(
      (item) => item.id === id
    );

  if (previous) {
    record.savedAt =
      previous.savedAt ??
      record.savedAt;
  }

  const updated = [
    record,

    ...existing.filter(
      (item) => item.id !== id
    ),
  ].slice(
    0,
    LIMITS.savedTrips
  );

  write(
    STORAGE_KEYS.savedTrips,
    updated
  );

  return record;
}

export function getSavedTrip(id) {
  const wanted =
    clean(id);

  if (!wanted) {
    return null;
  }

  return (
    getSavedTrips().find(
      (trip) =>
        trip.id === wanted
    ) ?? null
  );
}

export function deleteSavedTrip(id) {
  const wanted =
    clean(id);

  if (!wanted) {
    return false;
  }

  const current =
    getSavedTrips();

  const updated =
    current.filter(
      (trip) =>
        trip.id !== wanted
    );

  if (
    updated.length ===
    current.length
  ) {
    return false;
  }

  return write(
    STORAGE_KEYS.savedTrips,
    updated
  );
}

export function clearSavedTrips() {
  return remove(
    STORAGE_KEYS.savedTrips
  );
}

/* ==========================================================================
   Bucket List
   ========================================================================== */

export function getBucketList() {
  const items = read(
    STORAGE_KEYS.bucketList,
    []
  );

  return Array.isArray(items)
    ? items
    : [];
}

export function addToBucketList(
  destination,
  metadata = {}
) {
  const normalised =
    normaliseDestination(
      destination
    );

  if (!normalised.name) {
    return null;
  }

  const existing =
    getBucketList();

  const identity =
    destinationIdentity(
      normalised
    );

  const previous =
    existing.find(
      (item) =>
        destinationIdentity(
          item.destination
        ) === identity
    );

  if (previous) {
    return previous;
  }

  const record = {
    id:
      createId("bucket"),

    addedAt:
      Date.now(),

    destination:
      normalised,

    note:
      clean(
        metadata.note
      ),

    source:
      clean(
        metadata.source
      ) ||
      "TrackWorld",
  };

  const updated = [
    record,
    ...existing,
  ].slice(
    0,
    LIMITS.bucketList
  );

  write(
    STORAGE_KEYS.bucketList,
    updated
  );

  return record;
}

export function removeFromBucketList(id) {
  const wanted =
    clean(id);

  if (!wanted) {
    return false;
  }

  const current =
    getBucketList();

  const updated =
    current.filter(
      (item) =>
        item.id !== wanted
    );

  if (
    updated.length ===
    current.length
  ) {
    return false;
  }

  return write(
    STORAGE_KEYS.bucketList,
    updated
  );
}

export function isInBucketList(destination) {
  const normalised =
    normaliseDestination(
      destination
    );

  if (!normalised.name) {
    return false;
  }

  const identity =
    destinationIdentity(
      normalised
    );

  return getBucketList().some(
    (item) =>
      destinationIdentity(
        item.destination
      ) === identity
  );
}

export function clearBucketList() {
  return remove(
    STORAGE_KEYS.bucketList
  );
}

/* ==========================================================================
   Preferences
   ========================================================================== */

export function getPreferences() {
  const preferences =
    read(
      STORAGE_KEYS.preferences,
      {}
    );

  return (
    preferences &&
    typeof preferences === "object" &&
    !Array.isArray(preferences)
  )
    ? preferences
    : {};
}

export function updatePreferences(changes = {}) {
  const current =
    getPreferences();

  const updated = {
    ...current,
    ...changes,
    updatedAt:
      Date.now(),
  };

  write(
    STORAGE_KEYS.preferences,
    updated
  );

  return updated;
}

/* ==========================================================================
   Destination Helpers
   ========================================================================== */

function normaliseDestination(value) {
  if (
    typeof value === "string"
  ) {
    return {
      name: clean(value),
      country: "",
      countryCode: "",
      latitude: null,
      longitude: null,
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
    };
  }

  return {
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

function destinationIdentity(destination) {
  const name =
    clean(
      destination?.name
    ).toLowerCase();

  const country =
    clean(
      destination?.countryCode ??
        destination?.country
    ).toLowerCase();

  return `${name}|${country}`;
}

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}