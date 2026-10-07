/**
 * TrackWorld AI Travel Planner
 * API Routes
 */

import crypto from "crypto";
import express from "express";

import config from "./config.js";

import {
  ValidationError,
  validateTripRequest,
  validateFlightRequest,
  validateStayRequest,
  validateExploreRequest,
  validateWeatherRequest,
  validateCurrencyRequest,
  validatePlaceQuery,
  getPublicClientConfig,
} from "./validation.js";

import {
  searchCities,
  enrichLocation,
  enrichTripLocations,
  getAirportByIata,
  getLocationDataStats,
} from "./location-data.js";

import {
  generateItinerary,
  getGeminiStatus,
} from "./gemini.js";

import {
  searchFlights,
  searchStays,
  getWeather,
  getCurrency,
  getExploreBundle,
  getTravelServiceStatus,
  getCurrencyForCountry,
} from "./travel-services.js";

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

function clean(value) {
  return String(value ?? "").trim();
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function createRequestId() {
  return crypto.randomUUID();
}

function directJson(res, data, status = 200) {
  return res.status(status).json(data);
}

function success(res, data, status = 200) {
  return res.status(status).json({
    ok: true,
    data,
  });
}

function publicErrorMessage(error) {
  if (error instanceof ValidationError) {
    return error.message;
  }

  return "Something went wrong while processing your request. Please try again.";
}

function validationDetails(error) {
  if (!(error instanceof ValidationError)) {
    return undefined;
  }

  if (
    error.details !== undefined &&
    error.details !== null
  ) {
    return error.details;
  }

  if (error.field) {
    return {
      field: error.field,
    };
  }

  return undefined;
}

function getStartDate(trip) {
  return clean(
    trip?.start ||
      trip?.input?.start ||
      trip?.input?.startDate ||
      trip?.startDate ||
      trip?.departureDate ||
      trip?.input?.departureDate
  );
}

function getEndDate(trip) {
  return clean(
    trip?.end ||
      trip?.input?.end ||
      trip?.input?.endDate ||
      trip?.endDate ||
      trip?.returnDate ||
      trip?.input?.returnDate
  );
}

function getAdults(trip) {
  const value =
    trip?.traveller?.adults ??
    trip?.input?.adults ??
    trip?.adults ??
    1;

  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(parsed)
    ? Math.max(
        1,
        parsed
      )
    : 1;
}

function getChildren(trip) {
  const value =
    trip?.traveller?.children ??
    trip?.input?.children ??
    trip?.children ??
    0;

  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(parsed)
    ? Math.max(
        0,
        parsed
      )
    : 0;
}

function getGeminiRemaining(status) {
  const direct =
    Number(
      status?.requestsRemaining
    );

  if (
    Number.isFinite(
      direct
    )
  ) {
    return Math.max(
      0,
      direct
    );
  }

  const alternate =
    Number(
      status?.remaining
    );

  if (
    Number.isFinite(
      alternate
    )
  ) {
    return Math.max(
      0,
      alternate
    );
  }

  const limit =
    Number(
      status?.requestLimit ??
        status?.maxRequests
    );

  const used =
    Number(
      status?.requestsUsed ??
        status?.used
    );

  if (
    Number.isFinite(limit) &&
    Number.isFinite(used)
  ) {
    return Math.max(
      0,
      limit - used
    );
  }

  return null;
}

function getSchemaVersion() {
  const value =
    Number(
      config?.app
        ?.itinerarySchemaVersion
    );

  return Number.isFinite(
    value
  )
    ? value
    : 4;
}

function createCanonicalTrip(
  validatedTrip,
  route
) {
  const input = {
    type:
      validatedTrip.type,

    origin:
      validatedTrip.origin,

    destination:
      validatedTrip.destination,

    start:
      validatedTrip.start,

    end:
      validatedTrip.end,

    adults:
      validatedTrip.adults,

    children:
      validatedTrip.children,

    budget:
      validatedTrip.budget,

    budgetType:
      validatedTrip.budgetType,

    occasion:
      validatedTrip.occasion,

    hotel:
      validatedTrip.hotel,

    pace:
      validatedTrip.pace,

    interests:
      validatedTrip.interests,

    services:
      validatedTrip.services,

    comments:
      validatedTrip.comments,
  };

  const destinationCurrency =
    getCurrencyForCountry(
      route?.destination
        ?.countryCode
    );

  return {
    ...validatedTrip,

    input,

    traveller: {
      adults:
        validatedTrip.adults,

      children:
        validatedTrip.children,

      budget:
        validatedTrip.budget,

      budgetType:
        validatedTrip.budgetType,

      occasion:
        validatedTrip.occasion,

      hotel:
        validatedTrip.hotel,

      interests:
        validatedTrip.interests,

      services:
        validatedTrip.services,

      pace:
        validatedTrip.pace,

      comments:
        validatedTrip.comments,
    },

    route: {
      origin:
        route.origin,

      destination: {
        ...route.destination,

        currency:
          destinationCurrency,
      },
    },

    days:
      validatedTrip.days,
  };
}

async function resolveTrip(
  validatedTrip
) {
  const originInput =
    validatedTrip.originLocation ||
    validatedTrip.origin;

  const destinationInput =
    validatedTrip.destinationLocation ||
    validatedTrip.destination;

  const route =
    await enrichTripLocations({
      origin:
        originInput,

      destination:
        destinationInput,
    });

  if (!route?.origin) {
    throw new ValidationError(
      "The selected origin could not be resolved. Please select a city from the suggestions."
    );
  }

  if (!route?.destination) {
    throw new ValidationError(
      "The selected destination could not be resolved. Please select a city from the suggestions."
    );
  }

  if (
    validatedTrip.type ===
      "Domestic" &&
    (
      route.origin
        .countryCode !== "IN" ||
      route.destination
        .countryCode !== "IN"
    )
  ) {
    throw new ValidationError(
      "For a domestic trip, both origin and destination must be in India."
    );
  }

  return createCanonicalTrip(
    validatedTrip,
    route
  );
}

async function resolveLocationInput(
  input,
  label
) {
  const location =
    await enrichLocation(
      input
    );

  if (!location) {
    throw new ValidationError(
      `${label} could not be resolved. Please select a valid city.`
    );
  }

  return location;
}

function buildItineraryResponse(
  generated,
  requestId
) {
  const generatedObject =
    isObject(generated)
      ? generated
      : {};

  const itinerary =
    isObject(
      generatedObject.itinerary
    )
      ? generatedObject.itinerary
      : generatedObject;

  const source =
    clean(
      generatedObject.source
    ).toLowerCase();

  const cached =
    Boolean(
      generatedObject.cached
    );

  const geminiStatus =
    getGeminiStatus();

  const mode =
    source === "ai" ||
    source === "gemini"
      ? "gemini"
      : "mock";

  return {
    ...itinerary,

    requestId,

    mode,

    cached,

    itinerarySchemaVersion:
      getSchemaVersion(),

    geminiRequestsRemaining:
      getGeminiRemaining(
        geminiStatus
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Status                                   */
/* -------------------------------------------------------------------------- */

router.get(
  "/status",
  asyncRoute(
    async (req, res) => {
      const locationData =
        await getLocationDataStats();

      const gemini =
        getGeminiStatus();

      const services =
        getTravelServiceStatus();

      const clientConfig =
        getPublicClientConfig(
          config
        );

      return directJson(
        res,
        {
          mode:
            gemini?.available
              ? "gemini"
              : "mock",

          itinerarySchemaVersion:
            getSchemaVersion(),

          geminiRequestsRemaining:
            getGeminiRemaining(
              gemini
            ),

          application: {
            name:
              config?.brand
                ?.name ||
              "TrackWorld AI Travel Planner",

            company:
              config?.brand
                ?.company ||
              "TrackWorld Vacations",

            ready: true,
          },

          data: {
            cities:
              locationData
                ?.cities ??
              0,

            airports:
              locationData
                ?.airports ??
              0,

            scheduledAirports:
              locationData
                ?.scheduledAirports ??
              0,

            countries:
              locationData
                ?.countries ??
              0,
          },

          features: {
            itinerary:
              true,

            flights:
              Boolean(
                services
                  ?.flights
                  ?.configured
              ),

            stays:
              Boolean(
                services
                  ?.stays
                  ?.configured
              ),

            explore:
              Boolean(
                services
                  ?.explore
                  ?.configured
              ),

            weather:
              true,

            currency:
              true,

            aiAssistant:
              Boolean(
                clientConfig
                  ?.features
                  ?.assistant
              ),
          },

          ai: {
            itinerary:
              Boolean(
                gemini
                  ?.available
              ),

            model:
              gemini?.model ||
              null,
          },

          client:
            clientConfig,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                               City Search                                  */
/* -------------------------------------------------------------------------- */

router.get(
  "/places",
  asyncRoute(
    async (req, res) => {
      const validated =
        validatePlaceQuery({
          q:
            req.query?.q ??
            req.query?.query ??
            "",

          mode:
            req.query?.mode,

          limit:
            req.query?.limit,
        });

      const searchOptions = {
        limit:
          validated.limit,
      };

      if (
        validated.mode ===
        "Domestic"
      ) {
        searchOptions.countryCode =
          "IN";
      }

      const results =
        await searchCities(
          validated.q,
          searchOptions
        );

      return directJson(
        res,
        {
          query:
            validated.q,

          mode:
            validated.mode,

          results,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                             Airport Resolve                                */
/* -------------------------------------------------------------------------- */

router.get(
  "/airport",
  asyncRoute(
    async (req, res) => {
      const iata =
        clean(
          req.query?.iata
        ).toUpperCase();

      if (
        /^[A-Z]{3}$/.test(
          iata
        )
      ) {
        const airport =
          await getAirportByIata(
            iata
          );

        if (!airport) {
          throw new ValidationError(
            "The requested airport could not be found."
          );
        }

        return directJson(
          res,
          {
            airport,
          }
        );
      }

      const cityQuery =
        req.query?.city ??
        req.query?.q;

      if (!cityQuery) {
        throw new ValidationError(
          "Provide either a city or an IATA airport code."
        );
      }

      const location =
        await resolveLocationInput(
          cityQuery,
          "City"
        );

      return directJson(
        res,
        {
          location,

          airport:
            location.airport ||
            null,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                          Itinerary Generation                              */
/* -------------------------------------------------------------------------- */

router.post(
  "/generate-itinerary",
  asyncRoute(
    async (req, res) => {
      const requestId =
        createRequestId();

      const validated =
        validateTripRequest(
          req.body
        );

      const trip =
        await resolveTrip(
          validated
        );

      const generated =
        await generateItinerary(
          trip
        );

      const response =
        buildItineraryResponse(
          generated,
          requestId
        );

      return directJson(
        res,
        response
      );
    }
  )
);

router.post(
  "/itinerary",
  asyncRoute(
    async (req, res) => {
      const requestId =
        createRequestId();

      const validated =
        validateTripRequest(
          req.body
        );

      const trip =
        await resolveTrip(
          validated
        );

      const generated =
        await generateItinerary(
          trip
        );

      const itinerary =
        buildItineraryResponse(
          generated,
          requestId
        );

      return success(
        res,
        {
          trip: {
            ...trip,
            itinerary,
          },
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                  Flights                                   */
/* -------------------------------------------------------------------------- */

router.post(
  "/flights",
  asyncRoute(
    async (req, res) => {
      const validated =
        validateFlightRequest(
          req.body
        );

      const origin =
        await resolveLocationInput(
          validated.origin,
          "Origin"
        );

      const destination =
        await resolveLocationInput(
          validated.destination,
          "Destination"
        );

      const result =
        await searchFlights({
          ...validated,

          origin,

          destination,

          departureDate:
            validated.departureDate,

          returnDate:
            validated.returnDate,

          adults:
            validated.adults,

          children:
            validated.children,
        });

      return success(
        res,
        {
          route: {
            origin,
            destination,
          },

          flights:
            result,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                   Stays                                    */
/* -------------------------------------------------------------------------- */

router.post(
  "/stays",
  asyncRoute(
    async (req, res) => {
      const validated =
        validateStayRequest(
          req.body
        );

      const destination =
        await resolveLocationInput(
          validated.destination,
          "Destination"
        );

      const result =
        await searchStays({
          ...validated,

          destination,

          checkIn:
            validated.checkIn,

          checkOut:
            validated.checkOut,

          checkInDate:
            validated.checkIn,

          checkOutDate:
            validated.checkOut,

          adults:
            validated.adults,

          children:
            validated.children,

          rooms:
            validated.rooms,
        });

      return success(
        res,
        {
          destination,

          stays:
            result,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                  Explore                                   */
/* -------------------------------------------------------------------------- */

router.post(
  "/explore",
  asyncRoute(
    async (req, res) => {
      const body =
        isObject(req.body)
          ? req.body
          : {};

      const destination =
        await resolveLocationInput(
          body.destination,
          "Destination"
        );

      const validated =
        validateExploreRequest({
          ...body,
          destination,
        });

      const result =
        await getExploreBundle({
          ...validated,

          destination,
        });

      return success(
        res,
        {
          destination,

          explore:
            result,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                  Weather                                   */
/* -------------------------------------------------------------------------- */

router.post(
  "/weather",
  asyncRoute(
    async (req, res) => {
      const body =
        isObject(req.body)
          ? req.body
          : {};

      /*
       * Resolve a normal city string such as "Dubai"
       * BEFORE weather validation.
       *
       * validateWeatherRequest correctly requires coordinates,
       * but the public API should not require the browser/user
       * to know latitude and longitude.
       */
      const destination =
        await resolveLocationInput(
          body.destination,
          "Destination"
        );

      const validated =
        validateWeatherRequest({
          ...body,
          destination,
        });

      const result =
        await getWeather({
          ...validated,

          destination,

          start:
            validated.start,

          end:
            validated.end,

          startDate:
            validated.start,

          endDate:
            validated.end,
        });

      return success(
        res,
        {
          destination,

          weather:
            result,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                 Currency                                   */
/* -------------------------------------------------------------------------- */

router.post(
  "/currency",
  asyncRoute(
    async (req, res) => {
      const validated =
        validateCurrencyRequest(
          req.body
        );

      const result =
        await getCurrency({
          ...validated,

          base:
            validated.from,

          baseCurrency:
            validated.from,

          target:
            validated.to,

          targetCurrency:
            validated.to,

          amount:
            validated.amount,
        });

      return success(
        res,
        {
          currency:
            result,
        }
      );
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                       Trip Service Context Helper                          */
/* -------------------------------------------------------------------------- */

export function getTripServiceContext(
  trip
) {
  return {
    origin:
      trip?.route?.origin ||
      null,

    destination:
      trip?.route
        ?.destination ||
      null,

    departureDate:
      getStartDate(
        trip
      ),

    returnDate:
      getEndDate(
        trip
      ),

    adults:
      getAdults(
        trip
      ),

    children:
      getChildren(
        trip
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*                                404 Handler                                 */
/* -------------------------------------------------------------------------- */

router.use(
  (req, res) => {
    res
      .status(404)
      .json({
        ok: false,

        error: {
          code:
            "API_ROUTE_NOT_FOUND",

          message:
            "The requested TrackWorld API endpoint was not found.",
        },
      });
  }
);

/* -------------------------------------------------------------------------- */
/*                               Error Handler                                */
/* -------------------------------------------------------------------------- */

router.use(
  (
    error,
    req,
    res,
    next
  ) => {
    void req;
    void next;

    const isValidation =
      error instanceof
      ValidationError;

    const status =
      isValidation
        ? (
            Number.isInteger(
              error?.status
            ) &&
            error.status >=
              400 &&
            error.status <
              600
              ? error.status
              : 400
          )
        : (
            Number.isInteger(
              error?.statusCode
            ) &&
            error.statusCode >=
              400 &&
            error.statusCode <
              600
              ? error.statusCode
              : 500
          );

    if (!isValidation) {
      console.error(
        "[TrackWorld] API error:",
        error instanceof Error
          ? error.stack ||
              error.message
          : error
      );
    }

    const details =
      validationDetails(
        error
      );

    const payload = {
      ok: false,

      error: {
        code:
          isValidation
            ? error.code ||
              "VALIDATION_ERROR"
            : "INTERNAL_ERROR",

        message:
          publicErrorMessage(
            error
          ),
      },
    };

    if (
      details !==
      undefined
    ) {
      payload.error.details =
        details;
    }

    res
      .status(status)
      .json(payload);
  }
);

export default router;