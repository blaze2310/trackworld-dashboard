/**
 * TrackWorld AI Travel Planner
 * Shared API Client
 */

const DEFAULT_TIMEOUT_MS = 30000;

const LONG_REQUEST_TIMEOUT_MS = 60000;

/* ==========================================================================
   Core Request
   ========================================================================== */

export async function apiRequest(
  path,
  options = {}
) {
  const {
    method = "GET",
    body,
    headers = {},
    timeout = DEFAULT_TIMEOUT_MS,
    signal,
  } = options;

  const controller =
    new AbortController();

  let timeoutId = null;

  const abortFromParent = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        abortFromParent,
        { once: true }
      );
    }
  }

  if (
    Number.isFinite(timeout) &&
    timeout > 0
  ) {
    timeoutId =
      window.setTimeout(
        () => {
          controller.abort();
        },
        timeout
      );
  }

  const requestHeaders = {
    Accept: "application/json",
    ...headers,
  };

  const request = {
    method,
    headers: requestHeaders,
    signal: controller.signal,
  };

  if (body !== undefined) {
    requestHeaders[
      "Content-Type"
    ] = "application/json";

    request.body =
      JSON.stringify(body);
  }

  try {
    const response =
      await fetch(
        path,
        request
      );

    const payload =
      await parseResponse(
        response
      );

    if (!response.ok) {
      throw createApiError(
        response,
        payload
      );
    }

    if (
      payload &&
      payload.ok === false
    ) {
      throw createPayloadError(
        payload,
        response.status
      );
    }

    return payload;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        "The request took too long. Please try again."
      );
    }

    throw error;
  } finally {
    if (timeoutId) {
      window.clearTimeout(
        timeoutId
      );
    }

    if (signal) {
      signal.removeEventListener(
        "abort",
        abortFromParent
      );
    }
  }
}

/* ==========================================================================
   GET
   ========================================================================== */

export function apiGet(
  path,
  options = {}
) {
  return apiRequest(
    path,
    {
      ...options,
      method: "GET",
    }
  );
}

/* ==========================================================================
   POST
   ========================================================================== */

export function apiPost(
  path,
  body,
  options = {}
) {
  return apiRequest(
    path,
    {
      ...options,
      method: "POST",
      body,
    }
  );
}

/* ==========================================================================
   Status
   ========================================================================== */

export function getStatus(
  options = {}
) {
  return apiGet(
    "/api/status",
    options
  );
}

/* ==========================================================================
   Places
   ========================================================================== */

export function searchPlaces(
  query,
  options = {}
) {
  const params =
    new URLSearchParams();

  params.set(
    "q",
    String(query ?? "").trim()
  );

  if (options.mode) {
    params.set(
      "mode",
      options.mode
    );
  }

  if (options.limit) {
    params.set(
      "limit",
      String(options.limit)
    );
  }

  return apiGet(
    `/api/places?${params.toString()}`,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        15000,
    }
  );
}

/* ==========================================================================
   Airport
   ========================================================================== */

export function resolveAirport(
  input,
  options = {}
) {
  const params =
    new URLSearchParams();

  if (
    typeof input === "string"
  ) {
    params.set(
      "city",
      input.trim()
    );
  } else if (
    input &&
    typeof input === "object"
  ) {
    if (input.iata) {
      params.set(
        "iata",
        String(
          input.iata
        ).trim()
      );
    } else {
      if (input.city) {
        params.set(
          "city",
          String(
            input.city
          ).trim()
        );
      }

      if (
        input.latitude !==
        undefined
      ) {
        params.set(
          "latitude",
          String(
            input.latitude
          )
        );
      }

      if (
        input.longitude !==
        undefined
      ) {
        params.set(
          "longitude",
          String(
            input.longitude
          )
        );
      }
    }
  }

  return apiGet(
    `/api/airport?${params.toString()}`,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        15000,
    }
  );
}

/* ==========================================================================
   Itinerary
   ========================================================================== */

export function generateItinerary(
  trip,
  options = {}
) {
  return apiPost(
    "/api/generate-itinerary",
    trip,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        LONG_REQUEST_TIMEOUT_MS,
    }
  );
}

/* ==========================================================================
   Flights
   ========================================================================== */

export function searchFlights(
  request,
  options = {}
) {
  return apiPost(
    "/api/flights",
    request,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        LONG_REQUEST_TIMEOUT_MS,
    }
  );
}

/* ==========================================================================
   Stays
   ========================================================================== */

export function searchStays(
  request,
  options = {}
) {
  return apiPost(
    "/api/stays",
    request,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        LONG_REQUEST_TIMEOUT_MS,
    }
  );
}

/* ==========================================================================
   Explore
   ========================================================================== */

export function exploreDestination(
  request,
  options = {}
) {
  return apiPost(
    "/api/explore",
    request,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        30000,
    }
  );
}

/* ==========================================================================
   Weather
   ========================================================================== */

export function getWeather(
  request,
  options = {}
) {
  return apiPost(
    "/api/weather",
    request,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        30000,
    }
  );
}

/* ==========================================================================
   Currency
   ========================================================================== */

export function getCurrency(
  request,
  options = {}
) {
  return apiPost(
    "/api/currency",
    request,
    {
      signal:
        options.signal,

      timeout:
        options.timeout ??
        20000,
    }
  );
}

/* ==========================================================================
   Response Helpers
   ========================================================================== */

export function unwrapResponse(
  payload
) {
  if (
    payload &&
    payload.ok === true &&
    payload.data !==
      undefined
  ) {
    return payload.data;
  }

  return payload;
}

export function extractResults(
  payload,
  keys = []
) {
  const data =
    unwrapResponse(
      payload
    );

  if (Array.isArray(data)) {
    return data;
  }

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    return [];
  }

  for (const key of keys) {
    if (
      Array.isArray(
        data[key]
      )
    ) {
      return data[key];
    }
  }

  return [];
}

/* ==========================================================================
   Internal Helpers
   ========================================================================== */

async function parseResponse(
  response
) {
  const contentType =
    response.headers.get(
      "content-type"
    ) ?? "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
}

function createApiError(
  response,
  payload
) {
  const message =
    payload?.error?.message ??
    payload?.message ??
    payload?.error ??
    `Request failed (${response.status}).`;

  const error =
    new Error(
      String(message)
    );

  error.status =
    response.status;

  error.payload =
    payload;

  return error;
}

function createPayloadError(
  payload,
  status = 400
) {
  const message =
    payload?.error?.message ??
    payload?.message ??
    "The request could not be completed.";

  const error =
    new Error(
      String(message)
    );

  error.status =
    status;

  error.payload =
    payload;

  return error;
}