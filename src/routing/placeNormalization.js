// src/routing/placeNormalization.js
// Resolves origin/destination user specs into areas, address nodes, hotel sets, etc.

import { openDb } from "../db/connection.js";
import { logDev } from "./config.js";
import { NodeKind } from "./types.js";

/**
 * Synthetic MVP geocoder for an address.
 * In real MVP: call a free geocoder or cached offline tiles.
 */
function geocodeAddressRaw(addressString) {
  logDev("geocodeAddressRaw (synthetic)", addressString);

  // Synthetic placeholder using hash → coordinates in US
  const hash = [...addressString].reduce((a, c) => a + c.charCodeAt(0), 0);
  const lat = 39.0 + (hash % 100) * 0.001; // 39.000 - 39.099
  const lon = -86.0 - (hash % 100) * 0.001; // -86.000 - -86.099

  return { lat, lon };
}

/**
 * Look up area by name (city/region).
 */
async function lookupAreaByName(db, nameRaw) {
  return new Promise((resolve, reject) => {
    const like = `%${nameRaw}%`;
    const sql = "SELECT * FROM area WHERE name LIKE ? LIMIT 5";

    db.all(sql, [like], (err, rows) => {
      if (err) return reject(err);
      logDev("lookupAreaByName result", { query: nameRaw, rows });
      resolve(rows || []);
    });
  });
}

/**
 * Look up nodes belonging to an area.
 */
async function lookupNodesInArea(db, areaId) {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM location_node WHERE area_id = ?";
    db.all(sql, [areaId], (err, rows) => {
      if (err) return reject(err);
      logDev("lookupNodesInArea", { areaId, count: rows.length });
      resolve(rows || []);
    });
  });
}

/**
 * Create an address node.
 * Phase 3 will persist this to DB. Here we return a structure.
 */
function createAddressNode(address, lat, lon) {
  logDev("createAddressNode", { address, lat, lon });

  return {
    id: null, // Not persisted yet
    name: address,
    kind: NodeKind.ADDRESS,
    lat,
    lon,
    area_id: null,
    is_hub: 0,
  };
}

/**
 * Normalize raw place specification.
 * Supports:
 * - address
 * - city name
 * - area
 * - simple hotel queries ("hotel near X")
 */
export async function normalizePlaceSpec(specRaw) {
  logDev("normalizePlaceSpec input:", specRaw);

  const spec = specRaw.trim();
  const db = openDb();

  // (1) Detect addresses explicitly
  if (spec.startsWith("address:")) {
    const addr = spec.replace("address:", "").trim();
    const { lat, lon } = geocodeAddressRaw(addr);

    return {
      isAddress: true,
      address: addr,
      nodes: [createAddressNode(addr, lat, lon)],
    };
  }

  // (2) Detect simple hotel queries
  if (spec.toLowerCase().startsWith("hotel")) {
    // Example: "hotel near Chicago" → resolve "Chicago" as area
    const words = spec.split(/\s+/);
    const nearIndex = words.indexOf("near");

    if (nearIndex !== -1 && nearIndex < words.length - 1) {
      const target = words.slice(nearIndex + 1).join(" ");
      const areas = await lookupAreaByName(db, target);

      if (areas.length > 0) {
        const area = areas[0];
        const nodes = await lookupNodesInArea(db, area.id);

        // Filter only nodes that are hotel-kind or addresses that look like hotels
        const hotels = nodes.filter(
          (n) => n.kind === NodeKind.HOTEL || /hotel/i.test(n.name)
        );

        logDev("normalize hotel query", { spec, area, hotels });

        return {
          isHotelQuery: true,
          area,
          nodes: hotels,
        };
      }
    }

    // Fallback: no area match → synthetic address node
    const { lat, lon } = geocodeAddressRaw(spec);
    return {
      isHotelQuery: true,
      nodes: [createAddressNode(spec, lat, lon)],
    };
  }

  // (3) Try area lookup (city / region)
  const areas = await lookupAreaByName(db, spec);
  if (areas.length > 0) {
    const area = areas[0];
    const nodes = await lookupNodesInArea(db, area.id);

    logDev("normalize area", { area, nodes });

    return {
      isArea: true,
      area,
      nodes,
    };
  }

  // (4) Final fallback — synthetic geocoded address
  const { lat, lon } = geocodeAddressRaw(spec);

  return {
    isAddress: true,
    address: spec,
    nodes: [createAddressNode(spec, lat, lon)],
  };
}
