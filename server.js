import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import config from "./src/config.js";
import apiRouter from "./src/routes.js";

/* -------------------------------------------------------------------------- */
/*                              App Bootstrap                                 */
/* -------------------------------------------------------------------------- */

const app =
  express();

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const PUBLIC_DIR =
  path.join(
    __dirname,
    "public"
  );

const PORT =
  Number.isInteger(
    Number(
      config?.port
    )
  ) &&
  Number(
    config?.port
  ) > 0
    ? Number(
        config.port
      )
    : Number.parseInt(
        process.env.PORT,
        10
      ) || 3000;

/* -------------------------------------------------------------------------- */
/*                              Express Setup                                 */
/* -------------------------------------------------------------------------- */

app.disable(
  "x-powered-by"
);

app.set(
  "trust proxy",
  1
);

app.use(
  express.json({
    limit:
      "100kb",

    strict:
      true,
  })
);

/* -------------------------------------------------------------------------- */
/*                              Static Assets                                 */
/* -------------------------------------------------------------------------- */

app.use(
  express.static(
    PUBLIC_DIR,
    {
      extensions: [
        "html",
      ],

      maxAge:
        process.env.NODE_ENV ===
        "production"
          ? "1h"
          : 0,

      setHeaders(
        response,
        filePath
      ) {
        response.setHeader(
          "X-Content-Type-Options",
          "nosniff"
        );

        if (
          filePath.endsWith(
            "index.html"
          )
        ) {
          response.setHeader(
            "Cache-Control",
            "no-cache"
          );
        }
      },
    }
  )
);

/* -------------------------------------------------------------------------- */
/*                                API Routes                                  */
/* -------------------------------------------------------------------------- */

app.use(
  "/api",
  apiRouter
);

/* -------------------------------------------------------------------------- */
/*                       Invalid JSON Error Handling                          */
/* -------------------------------------------------------------------------- */

app.use(
  (
    error,
    request,
    response,
    next
  ) => {
    if (
      error instanceof
        SyntaxError &&
      error.status ===
        400 &&
      "body" in error
    ) {
      return response
        .status(400)
        .json({
          ok: false,

          error: {
            code:
              "INVALID_JSON",

            message:
              "The request contains invalid JSON.",
          },
        });
    }

    return next(
      error
    );
  }
);

/* -------------------------------------------------------------------------- */
/*                          Frontend SPA Fallback                             */
/* -------------------------------------------------------------------------- */

app.get(
  "*splat",
  (
    request,
    response,
    next
  ) => {
    /*
     * API requests should never fall through to
     * index.html.
     */
    if (
      request.path.startsWith(
        "/api/"
      )
    ) {
      return next();
    }

    return response.sendFile(
      path.join(
        PUBLIC_DIR,
        "index.html"
      )
    );
  }
);

/* -------------------------------------------------------------------------- */
/*                      Final Unexpected Error Handler                        */
/* -------------------------------------------------------------------------- */

app.use(
  (
    error,
    request,
    response,
    next
  ) => {
    void request;
    void next;

    console.error(
      "[TrackWorld] Server error:",
      error instanceof Error
        ? error.stack ||
            error.message
        : error
    );

    if (
      response.headersSent
    ) {
      return;
    }

    response
      .status(500)
      .json({
        ok: false,

        error: {
          code:
            "SERVER_ERROR",

          message:
            "An unexpected server error occurred.",
        },
      });
  }
);

/* -------------------------------------------------------------------------- */
/*                                Start Server                                */
/* -------------------------------------------------------------------------- */

const server =
  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `[TrackWorld] Server running on port ${PORT}.`
      );

      console.log(
        `[TrackWorld] Itinerary schema version: ${
          config?.app
            ?.itinerarySchemaVersion ||
          4
        }.`
      );

      console.log(
        `[TrackWorld] Environment: ${
          process.env
            .NODE_ENV ||
          "development"
        }.`
      );
    }
  );

/* -------------------------------------------------------------------------- */
/*                           Graceful Shutdown                                */
/* -------------------------------------------------------------------------- */

function shutdown(
  signal
) {
  console.log(
    `[TrackWorld] ${signal} received. Closing server.`
  );

  server.close(
    () => {
      process.exit(0);
    }
  );

  setTimeout(
    () => {
      process.exit(1);
    },
    10_000
  ).unref();
}

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM"
    )
);

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT"
    )
);