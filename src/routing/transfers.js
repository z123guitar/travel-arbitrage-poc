// src/routing/transfers.js
// Transfer generation (walk, rideshare, shuttle, public-transit static templates)
// These create edge_leg + offer structures used by the routing engine.
// No DB writes yet — Phase 3 will handle persistence.

import { EdgeMode, OfferSourceType, DEFAULT_RIDESHARE_MODEL } from "./types.js";
import { logDev } from "./config.js";

/**
 * Compute haversine distance in km.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generate a walking transfer between two nodes.
 * - No price
 * - Duration estimated from distance
 * - Synthetic but valid within static timeline semantics
 */
export function generateWalkTransfer(originNode, destNode) {
  const distanceKm = haversine(
    originNode.lat,
    originNode.lon,
    destNode.lat,
    destNode.lon
  );

  // walking speed ~ 5 km/h
  const durationMin = Math.max(3, Math.round((distanceKm / 5) * 60));

  const now = new Date();
  const arrival = new Date(now.getTime() + durationMin * 60000);

  logDev("generateWalkTransfer", {
    from: originNode.name,
    to: destNode.name,
    distanceKm,
    durationMin,
  });

  return {
    edge_leg: {
      mode: EdgeMode.WALK,
      is_transfer: 1,
      distance_km: distanceKm,
      duration_min: durationMin,
      co_located: distanceKm < 0.3 ? 1 : 0,
      structure_type: "static",
    },
    offer: {
      departure_time_utc: now.toISOString(),
      arrival_time_utc: arrival.toISOString(),
      price_total: 0,
      currency: "USD",
      source_type: OfferSourceType.MANUAL_STATIC,
      retrieval_time_utc: now.toISOString(),
      is_static: 1,
      validity_window_hrs: 9999,
    },
  };
}

/**
 * Deterministic MVP rideshare cost estimate.
 * Returns synthetic edge_leg + offer objects that the search engine can ingest.
 */
export function generateRideshareTransfer(
  originNode,
  destNode,
  opts = DEFAULT_RIDESHARE_MODEL
) {
  const {
    base_fare,
    per_km,
    per_min,
    avg_speed_kmh,
    surge_coeff,
  } = { ...DEFAULT_RIDESHARE_MODEL, ...opts };

  const distanceKm = haversine(
    originNode.lat,
    originNode.lon,
    destNode.lat,
    destNode.lon
  );

  const durationMin = Math.max(
    5,
    Math.round((distanceKm / avg_speed_kmh) * 60)
  );

  let price =
    (base_fare + per_km * distanceKm + per_min * durationMin) * surge_coeff;

  price = Math.round(price * 100) / 100;

  const now = new Date();
  const arrival = new Date(now.getTime() + durationMin * 60000);

  logDev("generateRideshareTransfer", {
    from: originNode.name,
    to: destNode.name,
    distanceKm,
    durationMin,
    price,
  });

  return {
    edge_leg: {
      mode: EdgeMode.RIDESHARE,
      is_transfer: 1,
      distance_km: distanceKm,
      duration_min: durationMin,
      co_located: distanceKm < 0.3 ? 1 : 0,
      structure_type: "dynamic_template",
    },
    offer: {
      departure_time_utc: now.toISOString(),
      arrival_time_utc: arrival.toISOString(),
      price_total: price,
      currency: "USD",
      source_type: OfferSourceType.ESTIMATED_MODEL,
      retrieval_time_utc: now.toISOString(),
      ttl_hrs: 1,
      is_static: 0,
    },
  };
}

/**
 * Shuttle/public-transit template.
 * You may extend this later with static GTFS subsets or curated schedules.
 */
export function generateShuttleTransfer(
  originNode,
  destNode,
  opts = { flat_price: 12, avg_speed_kmh: 25 }
) {
  const distanceKm = haversine(
    originNode.lat,
    originNode.lon,
    destNode.lat,
    destNode.lon
  );
  const durationMin = Math.round((distanceKm / opts.avg_speed_kmh) * 60);

  const now = new Date();
  const arrival = new Date(now.getTime() + durationMin * 60000);

  const price = opts.flat_price ?? 12;

  logDev("generateShuttleTransfer", {
    from: originNode.name,
    to: destNode.name,
    distanceKm,
    durationMin,
    price,
  });

  return {
    edge_leg: {
      mode: EdgeMode.SHUTTLE,
      is_transfer: 1,
      distance_km: distanceKm,
      duration_min: durationMin,
      co_located: distanceKm < 0.3 ? 1 : 0,
      structure_type: "static",
    },
    offer: {
      departure_time_utc: now.toISOString(),
      arrival_time_utc: arrival.toISOString(),
      price_total: price,
      currency: "USD",
      source_type: OfferSourceType.MANUAL_STATIC,
      retrieval_time_utc: now.toISOString(),
      validity_window_hrs: 24,
      is_static: 1,
    },
  };
}
