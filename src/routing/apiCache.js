// src/routing/apiCache.js
import crypto from "crypto";
import { openDb } from "../db/connection.js";
import { logDev } from "./config.js";

/**
 * Create a canonical hash from provider params.
 */
export function canonicalHash(obj) {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Try to fetch cached provider data.
 */
export async function apiCacheGet(provider, endpoint, params) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    const hash = canonicalHash(params);

    const sql =
      "SELECT * FROM api_cache WHERE provider=? AND endpoint=? AND canonical_params_hash=?";

    db.get(sql, [provider, endpoint, hash], (err, row) => {
      if (err) {
        logDev("apiCacheGet error:", err);
        return reject(err);
      }
      if (row) {
        const now = Date.now();
        const expires = Date.parse(row.expires_at_utc);
        const valid = now < expires;

        logDev("apiCacheGet hit:", { provider, endpoint, valid });

        // Update last_used + hit_count
        db.run(
          "UPDATE api_cache SET last_used_at_utc=?, hit_count=hit_count+1 WHERE id=?",
          [new Date().toISOString(), row.id]
        );

        if (valid) {
          return resolve(JSON.parse(row.response_body_json));
        }
      }

      resolve(null);
    });
  });
}

/**
 * Insert provider response into cache.
 */
export async function apiCachePut(
  provider,
  endpoint,
  params,
  response,
  ttlHours = 6
) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    const hash = canonicalHash(params);

    const now = new Date();
    const expires = new Date(now.getTime() + ttlHours * 3600 * 1000);

    const sql = `
      INSERT INTO api_cache (
        provider,
        endpoint,
        canonical_params_hash,
        canonical_params_json,
        response_body_json,
        created_at_utc,
        expires_at_utc,
        last_used_at_utc,
        hit_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    db.run(
      sql,
      [
        provider,
        endpoint,
        hash,
        JSON.stringify(params),
        JSON.stringify(response),
        now.toISOString(),
        expires.toISOString(),
        now.toISOString(),
      ],
      function (err) {
        if (err) {
          logDev("apiCachePut error:", err);
          return reject(err);
        }
        logDev("apiCachePut stored:", { id: this.lastID });
        resolve(this.lastID);
      }
    );
  });
}
