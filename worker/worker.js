// ============================================================
// V18 ASOSIY DESIGN 2 - CLOUD SERVER
// Version: 19.0-cloud
// Google Sheets -> Cloudflare Worker -> Admin / Phone / Monitor
// ============================================================

const VERSION = "19.0-cloud";
const SPREADSHEET_ID = "1IWyUdorge58MbvpNlB5Z08Rawm8AdoeHinxgjiFktF4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Dashboard-Role, X-Dashboard-Device",
  "Access-Control-Max-Age": "86400",
};

const APP_ROUTES = new Set(["/", "/admin", "/monitor", "/phone", "/tv"]);

const SHEETS = [
  {
    code: "21010",
    names: ["21010 Tibbiy qism 2026 (16)", "21010 Tibbiy qism (16)"],
  },
  {
    code: "21111",
    names: ["21111 Farroshlar (65)"],
  },
  {
    code: "21113",
    names: ["21113 Bog‘bon 2026 (36)", "21113 Bog‘bonlar 2026 (36)", "21113 Bog‘bonlar (36)"],
  },
  {
    code: "21120",
    names: ["21120 Umumiy Ovq. bo'l. (200)", "21120 Umumiy ovqatlanish (200)"],
  },
  {
    code: "21130",
    names: ["21130 Oziq ovqat ta'minoti (8)", "21130 Oziq-ovqat ta’minoti (8)", "21130 Oziq-ovqat ta‘minoti (8)"],
  },
  {
    code: "21140",
    names: ["21140 Katedj (17)", "21140 Yotoqxona majmuasi (17)"],
  },
];

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
  if (!["", "present", "absent", "rest"].includes(out.tableStatus)) out.tableStatus = "";

  return out;
}

function getRoleAndDevice(request) {
  let role = request.headers.get("X-Dashboard-Role") || "computer";
  const cid = request.headers.get("X-Dashboard-Device") || "";

  if (!["computer", "phone", "monitor"].includes(role)) role = "computer";

  return { role, cid };
}

function gvizValue(cell) {
  return cell?.v ?? cell?.f ?? null;
}

function gvizNumber(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseGviz(text) {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Google Sheets javobi noto‘g‘ri.");
  return JSON.parse(text.slice(a, b + 1));
}

function normalizeGviz(obj) {
  return (obj?.table?.rows || [])
    .map((row) => {
      const c = (row?.c || []).map(gvizValue);
      const d = String(c[2] ?? "").trim();
      const e = String(c[4] ?? "").trim();
      const m = String(c[1] ?? "").trim();
      if (!/^\d+$/.test(d) || !e || !m) return null;

      return {
        m,
        d,
        e,
        tab: String(c[3] ?? ""),
        s: String(c[5] ?? ""),
        g: gvizNumber(c[6]),
        j: gvizNumber(c[9]),
        x: gvizNumber(c[12]),
        day: Array.from({ length: 31 }, (_, i) => c[i + 14] ?? null),
      };
    })
    .filter(Boolean);
}

async function fetchSheetByName(name) {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(name)}` +
    `&tq=${encodeURIComponent("select *")}`;

  const response = await fetch(url, {
    headers: { "User-Agent": `V18-Dashboard-Cloud/${VERSION}` },
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status}`);
  }

  const text = await response.text();
  const parsed = parseGviz(text);
  const records = normalizeGviz(parsed);

  if (!records.length) {
    throw new Error(`${name}: ma’lumot topilmadi`);
  }

  return records;
}

async function fetchDepartment(sheet) {
  const errors = [];

  for (const name of sheet.names) {
    try {
      const records = await fetchSheetByName(name);
      return { code: sheet.code, sheet: name, records };
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }

  throw new Error(`${sheet.code}: ${errors.join(" | ")}`);
}

async function getGoogleData() {
  const settled = await Promise.allSettled(SHEETS.map(fetchDepartment));
  const records = [];
  const loaded = [];
  const errors = [];

  for (const item of settled) {
    if (item.status === "fulfilled") {
      loaded.push({
        code: item.value.code,
        sheet: item.value.sheet,
        count: item.value.records.length,
      });
      records.push(...item.value.records);
    } else {
      errors.push(String(item.reason?.message || item.reason));
    }
  }

  if (!records.length) {
    throw new Error("Google Sheets ma’lumotlari olinmadi: " + errors.join("; "));
  }

  return {
    records,
    refreshedAt: new Date().toISOString(),
    source: "google-sheets-cloud",
    loaded,
    errors,
  };
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
          service: "V18 Asosiy design 2 Cloud Server",
          version: VERSION,
          computerRequired: false,
          durableObjectConfigured: Boolean(env?.V18_STATE),
          assetsConfigured: Boolean(env?.ASSETS),
          timestamp: new Date().toISOString(),
        });
      }

      if (path === "/api/google-test") {
        const data = await getGoogleData();
        return json({
          ok: true,
          source: data.source,
          spreadsheetId: SPREADSHEET_ID,
          totalRecords: data.records.length,
          loaded: data.loaded,
          errors: data.errors,
          refreshedAt: data.refreshedAt,
        });
      }

      if (path === "/api/google-data") {
        return json(await getGoogleData());
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
    };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/state") {
      return json({ error: "State endpoint topilmadi." }, 404);
    }

    const { role, cid } = getRoleAndDevice(request);
    let data = this.expire(await this.loadState());

    if (request.method === "GET") {
      await this.saveState(data);
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

    if (action === "claim" && role !== "monitor") {
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
