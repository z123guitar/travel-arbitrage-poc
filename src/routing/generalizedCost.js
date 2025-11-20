// src/routing/generalizedCost.js
// Generalized cost scoring + pruning utilities for routing search.

import { logDev } from "./config.js";

/**
 * Compute duration between two timestamps in minutes.
 */
function minutesBetween(startUtc, endUtc) {
  return (Date.parse(endUtc) - Date.parse(startUtc)) / 60000;
}

/**
 * Compute generalized cost for a NEW leg added to a partial path.
 * partial:
 *   - genCostSoFar
 *   - transfersSoFar
 *   - arrivalTimeUtc
 *
 * leg:
 *   - edge_leg
 *   - offer
 */
export function computeLegGeneralizedCost(partial, leg, params) {
  const {
    timeValuePerHour = 20,
    transferPenalty = 6,
    riskPenalty = 0, // placeholder
  } = params;

  const { genCostSoFar, transfersSoFar, arrivalTimeUtc } = partial;

  const { edge_leg, offer } = leg;

  const durationMin = minutesBetween(offer.departure_time_utc, offer.arrival_time_utc);
  const durationHours = durationMin / 60;

  const cash = offer.price_total || 0;

  // Transfer detection logic.
  const isTransfer = edge_leg.is_transfer === 1;
  const transferPenaltyCost = isTransfer ? transferPenalty : 0;

  // Risk bucket (placeholder — can extend later)
  const riskCost = riskPenalty;

  const newGenCost =
    genCostSoFar +
    cash +
    timeValuePerHour * durationHours +
    transferPenaltyCost +
    riskCost;

  const newTransfers = transfersSoFar + (isTransfer ? 1 : 0);

  return {
    newGenCost,
    newTransfers,
    legDurationMin: durationMin,
  };
}

/**
 * Lower-bound estimate for completing the route.
 * Very simple heuristic:
 *   LB = timeValuePerHour * (straight-line-distance / fastModeSpeed)
 *
 * You can refine later with:
 *   - known fast modes (HSR, flights)
 *   - cached corridor minima
 */
export function estimateLowerBound(originNode, destNode, params) {
  const { timeValuePerHour = 20 } = params;

  // approximate geodesic distance
  const dx = originNode.lat - destNode.lat;
  const dy = originNode.lon - destNode.lon;
  const distKm = Math.sqrt(dx * dx + dy * dy) * 111;

  // assume "fast-mode" speed ~ 700 km/h (flight-level)
  const fastModeHours = distKm / 700;

  const lb = timeValuePerHour * fastModeHours;

  logDev("LB estimate", { distKm, lb });

  return lb;
}

/**
 * Decide whether to prune based on:
 *   - gen cost + lower bound >= best cost
 *   - max detour
 *   - absurd branches
 */
export function shouldPrune(partial, nextLeg, bestCost, destNode, params) {
  const { maxDetourFactor = 2.2, timeValuePerHour = 20 } = params;

  const { newGenCost } = computeLegGeneralizedCost(partial, nextLeg, params);

  // If cost already exceeds best known → prune.
  if (bestCost !== null && newGenCost >= bestCost) {
    logDev("prune: cost exceeds best", { newGenCost, bestCost });
    return true;
  }

  // Lower-bound pruning
  const lb = estimateLowerBound(nextLeg.edge_leg, destNode, params);
  if (bestCost !== null && newGenCost + lb >= bestCost) {
    logDev("prune: LB+cost exceeds best", {
      newGenCost,
      lb,
      bestCost,
    });
    return true;
  }

  // Detour pruning (approx)
  // Partial distance approx: treat latitude/longitude deltas as proxy
  const dx = partial.origin.lat - nextLeg.edge_leg.destination_lat;
  const dy = partial.origin.lon - nextLeg.edge_leg.destination_lon;
  const distSoFar = Math.sqrt(dx * dx + dy * dy) * 111;

  const dx2 = partial.origin.lat - destNode.lat;
  const dy2 = partial.origin.lon - destNode.lon;
  const directDist = Math.sqrt(dx2 * dx2 + dy2 * dy2) * 111;

  if (distSoFar > maxDetourFactor * directDist) {
    logDev("prune: detour > maxDetourFactor", {
      distSoFar,
      directDist,
      factor: maxDetourFactor,
    });
    return true;
  }

  return false;
}
