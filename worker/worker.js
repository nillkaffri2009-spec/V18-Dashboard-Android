import {SheetCache,SPREADSHEET_ID} from './sheets.js';
const VERSION='20.3-cloud';
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Dashboard-Role, X-Dashboard-Device",
  "Access-Control-Max-Age": "86400",
};

const APP_ROUTES = new Set(["/", "/index.html", "/admin", "/monitor", "/phone", "/tv"]);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function withNoStore(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function defaultView() {
  const now = new Date();
  const month = now.getUTCFullYear() === 2026 ? now.getUTCMonth() : 0;
  const day = now.getUTCFullYear() === 2026 ? now.getUTCDate() : 1;

  return {
    month,
    day,
    page: 1,
    department: "",
    shift: "",
    hours: "",
    detail: "",
    query: "",
    tableShift: "",
    tableStatus: "",
    minHours: "",
    maxHours: "",
  };
}

function initialState() {
  return {
    source: "computer",
    epoch: 1,
    revision: 1,
    updatedAt: Date.now(),
    devices: {
      computer: { owner: "", view: null },
      phone: { owner: "", view: null },
      monitor: { owner: "", view: null },
    },
    phoneUntil: 0,
  };
}

function sanitizeView(input) {
  const base = defaultView();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  const out = { ...base };

  for (const key of Object.keys(base)) {
    if (!(key in input)) continue;

    if (["month", "day", "page"].includes(key)) {
      const n = Number(input[key]);
      if (Number.isInteger(n)) out[key] = n;
    } else {
      const limit = key === "query" ? 80 : 30;
      out[key] = String(input[key] ?? "").slice(0, limit);
    }
  }

  if (out.month < 0 || out.month > 11) out.month = 0;
  if (out.day < 1 || out.day > 31) out.day = 1;
  if (out.page < 1 || out.page > 3) out.page = 1;

  const depts = ["", "21010", "21111", "21113", "21120", "21130", "21140"];
  if (!depts.includes(out.department)) out.department = "";
  if (!["", "0", "under8", "8", "over8"].includes(out.hours)) out.hours = "";
  if (!["", "all", "present", "absent", "hours"].includes(out.detail)) out.detail = "";
  if (!["", "present", "absent", "rest", "unknown"].includes(out.tableStatus)) out.tableStatus = "";

  return out;
}

function getRoleAndDevice(request) {
  let role = request.headers.get("X-Dashboard-Role") || "computer";
  const cid = request.headers.get("X-Dashboard-Device") || "";

  if (!["computer", "phone", "monitor"].includes(role)) role = "computer";

  return { role, cid };
}

async function serveIndex(request, env) {
  const url = new URL(request.url);
  url.pathname = "/index.html";
  const response = await env.ASSETS.fetch(new Request(url.toString(), request));
  return withNoStore(response);
}

async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  return withNoStore(response);
}

async function serveDataJson(request, env) {
  const url = new URL(request.url);
  url.pathname = "/data.json";

  const assetResponse = await env.ASSETS.fetch(new Request(url.toString(), request));

  if (!assetResponse.ok) {
    return json({ error: "data.json topilmadi" }, 500);
  }

  const body = await assetResponse.text();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

async function forwardToState(request, env) {
  const id = env.V18_STATE.idFromName("main");
  const stub = env.V18_STATE.get(id);

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set(
    "X-Dashboard-Role",
    request.headers.get("X-Dashboard-Role") || "computer"
  );
  headers.set(
    "X-Dashboard-Device",
    request.headers.get("X-Dashboard-Device") || ""
  );

  const init = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  return stub.fetch("https://internal.v18/state", init);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (path === "/api/health") {
        return json({
          ok: true,
          service: "V20 Asosiy design 3 Cloud Server",
          version: VERSION,
          computerRequired: false,
          durableObjectConfigured: Boolean(env?.V18_STATE),
          assetsConfigured: Boolean(env?.ASSETS),
          timestamp: new Date().toISOString(),
        });
      }

      if (path === "/api/google-test") {
        const data = await (await env.V18_STATE.get(env.V18_STATE.idFromName('main')).fetch('https://internal.v18/data')).json();
        const countsByMonth = {};
        for (const row of data.records) {
          if (!countsByMonth[row.m]) countsByMonth[row.m] = {};
          countsByMonth[row.m][row.d] = (countsByMonth[row.m][row.d] || 0) + 1;
        }
        return json({
          ok: true,
          source: data.source,
          spreadsheetId: SPREADSHEET_ID,
          totalRecords: data.records.length,
          loaded: data.loaded,
          countsByMonth,
          errors: data.errors,
          refreshedAt: data.refreshedAt,
        });
      }

      if (path === "/api/google-data") {
        return withNoStore(await env.V18_STATE.get(env.V18_STATE.idFromName('main')).fetch('https://internal.v18/data'));
      }

      if (path === "/api/data") {
        return serveDataJson(request, env);
      }

      if (path === "/api/state") {
        const response = await forwardToState(request, env);
        return withNoStore(response);
      }

      if (APP_ROUTES.has(path)) {
        return serveIndex(request, env);
      }

      return serveAsset(request, env);
    } catch (error) {
      return json(
        {
          ok: false,
          error: String(error?.message || error),
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  },
};

export class V18State {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sheetCache = new SheetCache();
  }

  async loadState() {
    let data = await this.state.storage.get("dashboard_state_v19");

    if (!data) {
      data = initialState();
      await this.state.storage.put("dashboard_state_v19", data);
    }

    return data;
  }

  async saveState(data) {
    await this.state.storage.put("dashboard_state_v19", data);
  }

  expire(data) {
    const now = Date.now();

    if (data.source === "phone" && Number(data.phoneUntil || 0) < now) {
      data.source = "computer";
      data.epoch += 1;
      data.revision += 1;
      data.phoneUntil = 0;
      data.updatedAt = now;
    }

    return data;
  }

  publicState(data, role, cid) {
    const src = data.source;
    const view = data.devices?.[src]?.view || defaultView();
    const owner = data.devices?.[role]?.owner || "";
    const active = src === role && owner === cid;

    return {
      source: src,
      epoch: data.epoch,
      revision: data.revision,
      updatedAt: data.updatedAt,
      view,
      active,
      isController: active,
      hasController: Boolean(data.devices?.[src]?.owner),
    };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/data') {
      try {return json(await this.sheetCache.get());}
      catch(e){return json({error:e.message},503);}
    }
    if (url.pathname !== "/state") {
      return json({ error: "State endpoint topilmadi." }, 404);
    }

    const { role, cid } = getRoleAndDevice(request);
    const loaded = await this.loadState();
    const revision = loaded.revision;
    let data = this.expire(loaded);

    if (request.method === "GET") {
      if(data.revision !== revision) await this.saveState(data);
      return json(this.publicState(data, role, cid));
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const now = Date.now();
    const action = body.action;

    if(role === 'monitor' || !cid) return json({error:'Monitor faqat ko‘rsatadi.'},403);
    if (action === "claim") {
      if(body.onlyIfUnowned && data.devices?.[data.source]?.owner) return json({error:'Boshqaruv boshqa qurilmada.'},409);
      const previousView =
        data.devices?.[data.source]?.view || defaultView();

      data.source = role;
      data.devices[role].owner = cid;

      if (!data.devices[role].view) {
        data.devices[role].view = previousView;
      }

      data.epoch += 1;
      data.revision += 1;
      data.updatedAt = now;
      data.phoneUntil = role === "phone" ? now + 25000 : 0;
    } else {
      const owner = data.devices?.[role]?.owner || "";

      if (
        data.source !== role ||
        owner !== cid ||
        Number(body.epoch) !== Number(data.epoch)
      ) {
        return json(
          { error: "Boshqaruv boshqa qurilmada. Holat yangilanadi." },
          409
        );
      }

      if (action === "update") {
        data.devices[role].view = sanitizeView(body.view);
        data.revision += 1;
        data.updatedAt = now;
        if (role === "phone") data.phoneUntil = now + 25000;
      } else if (action === "heartbeat" && role === "phone") {
        data.phoneUntil = now + 25000;
      } else if (action === "release" && role === "phone") {
        data.source = "computer";
        data.epoch += 1;
        data.revision += 1;
        data.phoneUntil = 0;
        data.updatedAt = now;
      } else {
        return json({ error: "Noma’lum action." }, 400);
      }
    }

    await this.saveState(data);
    return json(this.publicState(data, role, cid));
  }
}
