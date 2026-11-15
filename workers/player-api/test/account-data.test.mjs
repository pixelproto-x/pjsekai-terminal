import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { ALLOWED_ORIGIN } from "../src/routes.mjs";

const GOOGLE_CLIENT_ID = "test-google-client.apps.googleusercontent.com";

function makeDatabase(initialRow = null) {
  const state = { row: initialRow, writes: [], statements: [] };
  return {
    state,
    prepare(sql) {
      state.statements.push(sql);
      return {
        bind(...values) {
          return {
            async first() {
              return state.row;
            },
            async run() {
              state.writes.push(values);
              state.row = {
                google_sub: values[0],
                email: values[1],
                data: values[2],
                updated_at: values[3],
              };
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function makeEnv(database) {
  return {
    GOOGLE_CLIENT_ID,
    USER_DATA_DB: database,
  };
}

function request(method = "GET", body) {
  return new Request("https://worker.example/api/account/data", {
    method,
    headers: {
      Origin: ALLOWED_ORIGIN,
      Authorization: "Bearer test-id-token",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function mockGoogleTokenInfo(overrides = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?access_token=/);
    return new Response(JSON.stringify({
      aud: GOOGLE_CLIENT_ID,
      azp: GOOGLE_CLIENT_ID,
      sub: "google-user-123",
      email: "player@example.com",
      email_verified: "true",
      scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      exp: String(Math.floor(Date.now() / 1000) + 3600),
      ...overrides,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("rejects account data requests without a Google OAuth access token", async () => {
  const db = makeDatabase();
  const req = new Request("https://worker.example/api/account/data", {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  const response = await worker.fetch(req, makeEnv(db));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
});

test("rejects Google tokens issued for a different client", async () => {
  const restore = mockGoogleTokenInfo({ aud: "another-client.apps.googleusercontent.com" });
  try {
    const response = await worker.fetch(request(), makeEnv(makeDatabase()));
    assert.equal(response.status, 401);
  } finally {
    restore();
  }
});

test("returns only the authenticated Google account's stored data", async () => {
  const db = makeDatabase({
    google_sub: "google-user-123",
    email: "player@example.com",
    data: JSON.stringify({ sekaiTheme: "nightcord", pjskSongFavorites: "[1,2]" }),
    updated_at: "2026-11-15T00:00:00.000Z",
  });
  const restore = mockGoogleTokenInfo();
  try {
    const response = await worker.fetch(request("GET"), makeEnv(db));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: { sekaiTheme: "nightcord", pjskSongFavorites: "[1,2]" },
      updatedAt: "2026-11-15T00:00:00.000Z",
      accountSub: "google-user-123",
    });
    assert.match(db.state.statements[0], /WHERE google_sub = \?/);
  } finally {
    restore();
  }
});

test("stores data under the verified Google subject, not a client-supplied user ID", async () => {
  const db = makeDatabase();
  const restore = mockGoogleTokenInfo();
  try {
    const response = await worker.fetch(
      request("PUT", { userId: "someone-else", data: { sekaiTheme: "leo-need" } }),
      makeEnv(db),
    );
    assert.equal(response.status, 200);
    assert.equal(db.state.writes.length, 1);
    assert.equal(db.state.writes[0][0], "google-user-123");
    assert.equal(db.state.writes[0][1], "player@example.com");
    assert.deepEqual(JSON.parse(db.state.writes[0][2]), { sekaiTheme: "leo-need" });
  } finally {
    restore();
  }
});

test("rejects requests from unapproved website origins", async () => {
  const response = await worker.fetch(new Request("https://worker.example/api/account/data", {
    headers: { Origin: "https://example.invalid", Authorization: "Bearer test-id-token" },
  }), makeEnv(makeDatabase()));
  assert.equal(response.status, 403);
});
