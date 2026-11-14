import { DurableObject } from "cloudflare:workers";
import { ALLOWED_ORIGIN, mapPublicPath } from "./routes.mjs";

const PORT = 9999;
const INSTANCE = "basic";
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const STARTUP_ATTEMPTS = 40;

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "vary": "Origin",
      "x-content-type-options": "nosniff",
    },
  });
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("access-control-max-age", "86400");
  headers.set("cache-control", "no-store");
  headers.set("vary", "Origin");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class HarukiContainer extends DurableObject {
  starting;

  constructor(ctx, env) {
    super(ctx, env);
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        ctx.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
      );
    }
  }

  async fetch(request) {
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container.getTcpPort(PORT).fetch(forwarded);
  }

  async startAndWaitForPort() {
    const container = this.ctx.container;
    if (!container.running) {
      const config = this.env.HARUKI_CONFIG_YAML;
      const accounts = this.env.HARUKI_ACCOUNTS_JSON;
      if (!config || !accounts) {
        throw new Error("Haruki Cloudflare secrets are not configured");
      }

      container.start({
        image: container.images.base,
        instance: INSTANCE,
        enableInternet: true,
        env: {
          HARUKI_CONFIG_YAML: config,
          HARUKI_ACCOUNTS_JSON: accounts,
        },
      });
    }

    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    let lastError;
    for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt += 1) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(750),
        });
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error(`Haruki health returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await sleep(250);
    }
    throw new Error("Haruki v6 container did not become ready", { cause: lastError });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin !== ALLOWED_ORIGIN) {
      return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, "null");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }

    if (request.method !== "GET") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    }

    const incoming = new URL(request.url);
    const mappedPath = mapPublicPath(incoming.pathname);
    if (!mappedPath) return json({ error: "NOT_FOUND" }, 404, origin);

    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = "haruki.internal";
    target.pathname = mappedPath;

    try {
      const stub = env.HARUKI_CONTAINER.getByName("production-v6");
      const response = await stub.fetch(new Request(target, request));

      if (incoming.pathname === "/health" || !response.ok) {
        return withCors(response, origin);
      }

      const profile = await response.json();
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        return json({ error: "HARUKI_INVALID_PROFILE" }, 502, origin);
      }

      const match = incoming.pathname.match(/^\/api\/(jp|tw|en|kr|cn)\/user\/(\d{1,20})\/profile$/);
      return json({
        data: profile,
        uid: match[2],
        region: match[1],
        source: "Haruki v6.33.0",
        fetchedAt: new Date().toISOString(),
        cached: false,
      }, 200, origin);
    } catch {
      return json({
        error: env.HARUKI_CONFIG_YAML && env.HARUKI_ACCOUNTS_JSON
          ? "HARUKI_UNAVAILABLE"
          : "HARUKI_NOT_CONFIGURED",
      }, 503, origin);
    }
  },
};
