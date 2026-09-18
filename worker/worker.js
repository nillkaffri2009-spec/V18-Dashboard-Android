// ============================================================
// V18 DASHBOARD CLOUD SERVER
// Version: 18.5
// Cloudflare Worker
//
// Architecture:
// Google Sheets -> Cloudflare Worker -> Admin / Phone / Monitor
//
// Spreadsheet:
// 1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4
// ============================================================

const VERSION = "18.5";

const SPREADSHEET_ID =
  "1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4";


// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-V18-Device",
  "Access-Control-Max-Age": "86400"
};


// ============================================================
// JSON RESPONSE
// ============================================================

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        ...CORS_HEADERS
      }
    }
  );

}


// ============================================================
// TEXT RESPONSE
// ============================================================

function text(data, status = 200) {

  return new Response(
    data,
    {
      status: status,
      headers: {
        "Content-Type":
          "text/plain; charset=UTF-8",

        ...CORS_HEADERS
      }
    }
  );

}


// ============================================================
// HTML RESPONSE
// ============================================================

function html(data, status = 200) {

  return new Response(
    data,
    {
      status: status,
      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",

        "Cache-Control":
          "no-store",

        ...CORS_HEADERS
      }
    }
  );

}


// ============================================================
// SAFE JSON BODY
// ============================================================

async function getJsonBody(request) {

  try {

    return await request.json();

  } catch (e) {

    return {};

  }

}


// ============================================================
// GOOGLE SHEETS XLSX EXPORT
// ============================================================

async function getGoogleXlsx() {

  const url =
    "https://docs.google.com/spreadsheets/d/" +
    SPREADSHEET_ID +
    "/export?format=xlsx";

  const response = await fetch(
    url,
    {
      headers: {
        "User-Agent":
          "V18-Dashboard-Cloud/18.5"
      },

      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    }
  );


  if (!response.ok) {

    throw new Error(
      "Google Sheets XLSX error: HTTP " +
      response.status
    );

  }


  const buffer =
    await response.arrayBuffer();


  return new Response(
    buffer,
    {
      status: 200,

      headers: {

        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "Content-Disposition":
          'inline; filename="V18-Google-Sheets.xlsx"',

        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        ...CORS_HEADERS
      }
    }
  );

}


// ============================================================
// GOOGLE SHEETS CSV
//
// gid can be supplied:
// /api/google-csv?gid=1701842361
// ============================================================

async function getGoogleCsv(gid) {

  if (!gid) {
    gid = "1701842361";
  }


  const url =
    "https://docs.google.com/spreadsheets/d/" +
    SPREADSHEET_ID +
    "/export?format=csv&gid=" +
    encodeURIComponent(gid);


  const response = await fetch(
    url,
    {
      headers: {
        "User-Agent":
          "V18-Dashboard-Cloud/18.5"
      },

      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    }
  );


  if (!response.ok) {

    throw new Error(
      "Google Sheets CSV error: HTTP " +
      response.status
    );

  }


  const csv =
    await response.text();


  return new Response(
    csv,
    {
      status: 200,

      headers: {

        "Content-Type":
          "text/csv; charset=UTF-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        ...CORS_HEADERS
      }
    }
  );

}


// ============================================================
// GOOGLE SHEETS CONNECTION TEST
// ============================================================

async function testGoogleSheets() {

  const url =
    "https://docs.google.com/spreadsheets/d/" +
    SPREADSHEET_ID +
    "/export?format=csv&gid=1701842361";


  try {

    const response =
      await fetch(
        url,
        {
          cf: {
            cacheTtl: 0,
            cacheEverything: false
          }
        }
      );


    return {

      ok: response.ok,

      status: response.status,

      source: "Google Sheets",

      spreadsheetId:
        SPREADSHEET_ID

    };


  } catch (error) {

    return {

      ok: false,

      source: "Google Sheets",

      error:
        String(
          error &&
          error.message
            ? error.message
            : error
        )

    };

  }

}


// ============================================================
// DASHBOARD DEFAULT STATE
//
// Durable Object is added in the next stage.
// Until then this describes the state format used by all
// Admin / Phone / Monitor clients.
// ============================================================

function defaultState() {

  return {

    version: VERSION,

    controller: "admin",

    screen: "kunlik",

    department: "all",

    shift: "all",

    workHour: "all",

    month: "",

    day: "",

    updatedAt: null,

    updatedBy: null

  };

}


// ============================================================
// STATE GET
// ============================================================

async function getState(env) {

  // ----------------------------------------------------------
  // DURABLE OBJECT
  // This becomes active after V18_STATE binding is created.
  // ----------------------------------------------------------

  if (env && env.V18_STATE) {

    const id =
      env.V18_STATE.idFromName(
        "main"
      );

    const object =
      env.V18_STATE.get(id);

    const response =
      await object.fetch(
        "https://v18-state/state"
      );


    if (response.ok) {

      return await response.json();

    }

  }


  // No Durable Object binding yet.
  return defaultState();

}


// ============================================================
// STATE UPDATE
// ============================================================

async function updateState(
  env,
  body,
  request
) {

  if (!body ||
      typeof body !== "object") {

    throw new Error(
      "Invalid state body"
    );

  }


  const device =
    request.headers.get(
      "X-V18-Device"
    ) ||
    body.updatedBy ||
    "unknown";


  body.updatedBy =
    device;


  body.updatedAt =
    new Date().toISOString();


  // ----------------------------------------------------------
  // DURABLE OBJECT AVAILABLE
  // ----------------------------------------------------------

  if (env && env.V18_STATE) {

    const id =
      env.V18_STATE.idFromName(
        "main"
      );

    const object =
      env.V18_STATE.get(id);


    const response =
      await object.fetch(
        "https://v18-state/state",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(body)
        }
      );


    return await response.json();

  }


  // ----------------------------------------------------------
  // Binding not added yet.
  // Do NOT pretend state was persisted.
  // ----------------------------------------------------------

  return {

    ok: false,

    persistent: false,

    message:
      "V18_STATE Durable Object binding hali ulanmagan.",

    received: body

  };

}


// ============================================================
// HOME PAGE
// ============================================================

function homePage() {

  return `
<!doctype html>

<html lang="uz">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1">

<title>V18 Dashboard Cloud Server</title>

<style>

body {
  margin: 0;
  background: #f4f7fb;
  font-family:
    Arial,
    sans-serif;
  color: #17324d;
}

.box {
  max-width: 780px;
  margin: 60px auto;
  background: white;
  border-radius: 20px;
  padding: 32px;
  box-shadow:
    0 12px 40px
    rgba(0,0,0,.10);
}

h1 {
  margin-top: 0;
}

.ok {
  display: inline-block;
  background: #e8f7ee;
  color: #147a3d;
  padding: 8px 14px;
  border-radius: 999px;
  font-weight: bold;
}

.row {
  margin-top: 18px;
  padding: 15px;
  background: #f6f8fb;
  border-radius: 12px;
}

code {
  word-break: break-all;
}

</style>

</head>


<body>

<div class="box">

<h1>
V18 Dashboard Cloud Server
</h1>

<div class="ok">
SERVER ONLINE
</div>

<div class="row">
Version:
<strong>${VERSION}</strong>
</div>

<div class="row">
Computer server:
<strong>NOT REQUIRED</strong>
</div>

<div class="row">
Google Sheets:
<code>${SPREADSHEET_ID}</code>
</div>

<div class="row">
Health API:
<code>/api/health</code>
</div>

<div class="row">
Google test:
<code>/api/google-test</code>
</div>

<div class="row">
Google CSV:
<code>/api/google-csv?gid=1701842361</code>
</div>

<div class="row">
Google XLSX:
<code>/api/google-xlsx</code>
</div>

<div class="row">
Dashboard state:
<code>/api/state</code>
</div>

</div>

</body>

</html>
`;

}


// ============================================================
// MAIN WORKER
// ============================================================

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    try {

      const url =
        new URL(
          request.url
        );


      const path =
        url.pathname;


      const method =
        request.method.toUpperCase();


      // ======================================================
      // OPTIONS / CORS
      // ======================================================

      if (method === "OPTIONS") {

        return new Response(
          null,
          {
            status: 204,
            headers:
              CORS_HEADERS
          }
        );

      }


      // ======================================================
      // HOME
      // ======================================================

      if (path === "/") {

        return html(
          homePage()
        );

      }


      // ======================================================
      // HEALTH
      // ======================================================

      if (path === "/api/health") {

        return json({

          ok: true,

          service:
            "V18 Dashboard Cloud Server",

          version:
            VERSION,

          computerRequired:
            false,

          timestamp:
            new Date().toISOString()

        });

      }


      // ======================================================
      // GOOGLE TEST
      // ======================================================

      if (path === "/api/google-test") {

        const result =
          await testGoogleSheets();


        return json(result);

      }


      // ======================================================
      // GOOGLE CSV
      // ======================================================

      if (path === "/api/google-csv") {

        const gid =
          url.searchParams.get(
            "gid"
          );


        return await getGoogleCsv(
          gid
        );

      }


      // ======================================================
      // GOOGLE XLSX
      // ======================================================

      if (path === "/api/google-xlsx") {

        return await getGoogleXlsx();

      }


      // ======================================================
      // STATE GET
      // ======================================================

      if (
        path === "/api/state" &&
        method === "GET"
      ) {

        const state =
          await getState(env);


        return json({

          ok: true,

          persistent:
            Boolean(
              env &&
              env.V18_STATE
            ),

          state: state

        });

      }


      // ======================================================
      // STATE UPDATE
      // ======================================================

      if (
        path === "/api/state" &&
        (
          method === "POST" ||
          method === "PUT" ||
          method === "PATCH"
        )
      ) {

        const body =
          await getJsonBody(
            request
          );


        const result =
          await updateState(
            env,
            body,
            request
          );


        return json(result);

      }


      // ======================================================
      // SERVER INFO
      // ======================================================

      if (path === "/api/info") {

        return json({

          name:
            "V18 Dashboard",

          version:
            VERSION,

          architecture:
            "Google Sheets -> Cloudflare -> Admin / Phone / Monitor",

          spreadsheetId:
            SPREADSHEET_ID,

          localPcServerRequired:
            false,

          endpoints: {

            health:
              "/api/health",

            googleTest:
              "/api/google-test",

            googleCsv:
              "/api/google-csv?gid=1701842361",

            googleXlsx:
              "/api/google-xlsx",

            state:
              "/api/state"

          }

        });

      }


      // ======================================================
      // 404
      // ======================================================

      return json(
        {
          ok: false,

          error:
            "V18 endpoint topilmadi.",

          path: path

        },
        404
      );


    } catch (error) {

      return json(
        {

          ok: false,

          error:
            String(
              error &&
              error.message
                ? error.message
                : error
            ),

          timestamp:
            new Date().toISOString()

        },
        500
      );

    }

  }

};


// ============================================================
// DURABLE OBJECT
// V18 REAL-TIME STATE
//
// Binding name:
// V18_STATE
//
// Class:
// V18State
// ============================================================

export class V18State {

  constructor(
    state,
    env
  ) {

    this.state =
      state;

    this.env =
      env;

  }


  // ==========================================================
  // DEFAULT STATE
  // ==========================================================

  defaultState() {

    return {

      version:
        VERSION,

      controller:
        "admin",

      screen:
        "kunlik",

      department:
        "all",

      shift:
        "all",

      workHour:
        "all",

      month:
        "",

      day:
        "",

      updatedAt:
        null,

      updatedBy:
        null

    };

  }


  // ==========================================================
  // FETCH
  // ==========================================================

  async fetch(request) {

    const url =
      new URL(
        request.url
      );


    if (
      url.pathname !==
      "/state"
    ) {

      return json(
        {
          ok: false,
          error:
            "State endpoint topilmadi."
        },
        404
      );

    }


    // ========================================================
    // GET STATE
    // ========================================================

    if (
      request.method ===
      "GET"
    ) {

      let data =
        await this.state.storage.get(
          "dashboard"
        );


      if (!data) {

        data =
          this.defaultState();


        await this.state.storage.put(
          "dashboard",
          data
        );

      }


      return json(data);

    }


    // ========================================================
    // UPDATE STATE
    // ========================================================

    if (
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "PATCH"
    ) {

      let current =
        await this.state.storage.get(
          "dashboard"
        );


      if (!current) {

        current =
          this.defaultState();

      }


      let incoming = {};


      try {

        incoming =
          await request.json();

      } catch (e) {

        incoming = {};

      }


      // Only supported state fields are stored.

      const allowed = [
        "controller",
        "screen",
        "department",
        "shift",
        "workHour",
        "month",
        "day",
        "updatedAt",
        "updatedBy"
      ];


      const update = {};


      for (
        const key of allowed
      ) {

        if (
          Object.prototype
            .hasOwnProperty
            .call(
              incoming,
              key
            )
        ) {

          update[key] =
            incoming[key];

        }

      }


      const next = {

        ...current,

        ...update,

        version:
          VERSION,

        updatedAt:
          incoming.updatedAt ||
          new Date().toISOString()

      };


      await this.state.storage.put(
        "dashboard",
        next
      );


      return json({

        ok: true,

        persistent:
          true,

        state:
          next

      });

    }


    return json(
      {
        ok: false,
        error:
          "Method not allowed"
      },
      405
    );

  }

}
