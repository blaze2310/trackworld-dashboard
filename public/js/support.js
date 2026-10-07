/**
 * TrackWorld AI Travel Planner
 * Travel Support + ElevenLabs Assistant
 */

import {
  getStatus,
} from "./api.js";

import {
  normaliseTripContext,
  tripRouteLabel,
  formatTripDates,
  travellerLabel,
  airportCode,
} from "./trip.js";

const DEFAULT_ASSISTANT_URL =
  "https://elevenlabs.io/app/talk-to";

const DEFAULT_AGENT_ID =
  "agent_3101m2cn3wdhfhxvekebk9rjdzvz";

const DEFAULT_BRANCH_ID =
  "agtbrch_7001m2cn3xkce349s7q6ds4tcw1e";

let cachedStatus = null;

/* ==========================================================================
   Public Status
   ========================================================================== */

export async function getSupportStatus({
  force = false,
} = {}) {
  if (
    cachedStatus &&
    !force
  ) {
    return cachedStatus;
  }

  try {
    const status =
      await getStatus();

    cachedStatus =
      normaliseSupportStatus(
        status
      );

    return cachedStatus;
  } catch {
    cachedStatus = {
      assistantEnabled: false,
      agentId:
        DEFAULT_AGENT_ID,
      branchId:
        DEFAULT_BRANCH_ID,
      assistantUrl:
        DEFAULT_ASSISTANT_URL,
    };

    return cachedStatus;
  }
}

/* ==========================================================================
   ElevenLabs Assistant
   ========================================================================== */

export async function openTravelAssistant(
  tripContext = null
) {
  const status =
    await getSupportStatus();

  if (
    !status.assistantEnabled
  ) {
    return {
      ok: false,
      reason:
        "assistant-unavailable",
    };
  }

  const url =
    buildAssistantUrl(
      status
    );

  const windowReference =
    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

  return {
    ok:
      Boolean(
        windowReference
      ),

    url,

    context:
      tripContext
        ? buildAssistantTripContext(
            tripContext
          )
        : null,
  };
}

export function buildAssistantUrl(
  status = {}
) {
  const base =
    clean(
      status.assistantUrl
    ) ||
    DEFAULT_ASSISTANT_URL;

  const url =
    new URL(base);

  const agentId =
    clean(
      status.agentId
    ) ||
    DEFAULT_AGENT_ID;

  const branchId =
    clean(
      status.branchId
    ) ||
    DEFAULT_BRANCH_ID;

  url.searchParams.set(
    "agent_id",
    agentId
  );

  if (branchId) {
    url.searchParams.set(
      "branch_id",
      branchId
    );
  }

  return url.toString();
}

/* ==========================================================================
   Assistant Trip Context
   ========================================================================== */

export function buildAssistantTripContext(
  context
) {
  const trip =
    normaliseTripContext(
      context
    );

  if (!trip) {
    return null;
  }

  const origin =
    trip.route.origin;

  const destination =
    trip.route.destination;

  return {
    tripTitle:
      trip.tripTitle ||
      `${destination.name || "Travel"} trip`,

    origin:
      origin.name,

    originAirport:
      airportCode(origin),

    destination:
      destination.name,

    destinationAirport:
      airportCode(
        destination
      ),

    startDate:
      trip.start,

    endDate:
      trip.end,

    dateLabel:
      formatTripDates(
        trip.start,
        trip.end
      ),

    days:
      trip.days,

    adults:
      trip.adults,

    children:
      trip.children,

    travellers:
      travellerLabel(
        trip.adults,
        trip.children
      ),

    route:
      tripRouteLabel(
        trip
      ),

    interests:
      arrayOfStrings(
        trip.input?.interests
      ),

    services:
      arrayOfStrings(
        trip.input?.services
      ),

    pace:
      clean(
        trip.input?.pace
      ),

    hotelPreference:
      clean(
        trip.input?.hotel
      ),

    occasion:
      clean(
        trip.input?.occasion
      ),

    comments:
      clean(
        trip.input?.comments
      ),

    summary:
      clean(
        trip.summary
      ),
  };
}

/* ==========================================================================
   Travel Expert Handoff
   ========================================================================== */

export function buildExpertHandoff(
  context
) {
  const trip =
    normaliseTripContext(
      context
    );

  if (!trip) {
    return null;
  }

  const origin =
    trip.route.origin;

  const destination =
    trip.route.destination;

  return {
    title:
      trip.tripTitle ||
      "TrackWorld trip enquiry",

    route:
      tripRouteLabel(
        trip
      ),

    origin: {
      name:
        origin.name,

      airport:
        airportCode(
          origin
        ),
    },

    destination: {
      name:
        destination.name,

      airport:
        airportCode(
          destination
        ),
    },

    dates: {
      start:
        trip.start,

      end:
        trip.end,

      label:
        formatTripDates(
          trip.start,
          trip.end
        ),

      days:
        trip.days,
    },

    travellers: {
      adults:
        trip.adults,

      children:
        trip.children,

      label:
        travellerLabel(
          trip.adults,
          trip.children
        ),
    },

    preferences: {
      budget:
        trip.input?.budget ??
        null,

      budgetType:
        clean(
          trip.input
            ?.budgetType
        ),

      occasion:
        clean(
          trip.input
            ?.occasion
        ),

      hotel:
        clean(
          trip.input
            ?.hotel
        ),

      pace:
        clean(
          trip.input
            ?.pace
        ),

      interests:
        arrayOfStrings(
          trip.input
            ?.interests
        ),

      services:
        arrayOfStrings(
          trip.input
            ?.services
        ),

      comments:
        clean(
          trip.input
            ?.comments
        ),
    },

    itinerary: {
      requestId:
        clean(
          trip.itinerary
            ?.requestId
        ),

      summary:
        clean(
          trip.itinerary
            ?.summary
        ),

      days:
        Array.isArray(
          trip.itinerary
            ?.days
        )
          ? trip.itinerary
              .days
          : [],
    },
  };
}

/* ==========================================================================
   Expert Summary
   ========================================================================== */

export function buildExpertSummary(
  context
) {
  const handoff =
    buildExpertHandoff(
      context
    );

  if (!handoff) {
    return "";
  }

  const lines = [];

  if (handoff.route) {
    lines.push(
      handoff.route
    );
  }

  if (
    handoff.dates.label
  ) {
    lines.push(
      handoff.dates.label
    );
  }

  if (
    handoff.travellers.label
  ) {
    lines.push(
      handoff.travellers
        .label
    );
  }

  if (
    handoff.preferences
      .hotel
  ) {
    lines.push(
      `Stay preference: ${handoff.preferences.hotel}`
    );
  }

  if (
    handoff.preferences
      .pace
  ) {
    lines.push(
      `Travel pace: ${handoff.preferences.pace}`
    );
  }

  if (
    handoff.preferences
      .interests.length
  ) {
    lines.push(
      `Interests: ${handoff.preferences.interests.join(", ")}`
    );
  }

  if (
    handoff.preferences
      .services.length
  ) {
    lines.push(
      `Services: ${handoff.preferences.services.join(", ")}`
    );
  }

  return lines.join("\n");
}

/* ==========================================================================
   Downloadable Handoff
   ========================================================================== */

export function downloadExpertHandoff(
  context
) {
  const handoff =
    buildExpertHandoff(
      context
    );

  if (!handoff) {
    return false;
  }

  const destination =
    safeFileName(
      handoff.destination
        .name ||
        "trip"
    );

  const blob =
    new Blob(
      [
        JSON.stringify(
          handoff,
          null,
          2
        ),
      ],
      {
        type:
          "application/json",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href = url;

  anchor.download =
    `trackworld-${destination}-trip.json`;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  anchor.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );

  return true;
}

/* ==========================================================================
   Internal Status Normalisation
   ========================================================================== */

function normaliseSupportStatus(
  status
) {
  const client =
    status?.client ??
    {};

  const assistantEnabled =
    Boolean(
      status?.features
        ?.aiAssistant ??
        client?.features
          ?.assistant
    );

  const assistant =
    client?.assistant ??
    status?.assistant ??
    {};

  return {
    assistantEnabled,

    agentId:
      clean(
        assistant.agentId ??
          assistant.agent_id
      ) ||
      DEFAULT_AGENT_ID,

    branchId:
      clean(
        assistant.branchId ??
          assistant.branch_id
      ) ||
      DEFAULT_BRANCH_ID,

    assistantUrl:
      clean(
        assistant.url ??
          assistant
            .assistantUrl
      ) ||
      DEFAULT_ASSISTANT_URL,
  };
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function arrayOfStrings(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(clean)
    .filter(Boolean);
}

function safeFileName(
  value
) {
  const result =
    clean(value)
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  return (
    result ||
    "trip"
  );
}