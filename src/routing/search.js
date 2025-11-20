// src/routing/search.js
// Hybrid Branch-and-Bound Search Engine with:
// - Generalized cost objective
// - Dominance pruning
// - Detour pruning
// - Lower-bound early stopping
// - Timeout + expansion limit
// - Area-aware termination

import { logDev } from "./config.js";
import { computeLegGeneralizedCost, shouldPrune, estimateLowerBound } from "./generalizedCost.js";
import { buildGraph } from "./graph.js";

/**
 * Represent a partial search state.
 */
function createState(nodeId, arrivalTimeUtc, genCost, transfers, path) {
  return {
    nodeId,
    arrivalTimeUtc,
    genCost,
    transfers,
    path, // [{ edge_leg, offer }]
  };
}

/**
 * Dominance table:
 * For each node + time bucket, store best genCost so far.
 *
 * Key format: `${nodeId}:${bucket}`
 */
function makeDominanceKey(nodeId, arrivalTimeUtc) {
  const t = Date.parse(arrivalTimeUtc);
  const bucket = Math.floor(t / (5 * 60 * 1000)); // 5-minute time bucket
  return `${nodeId}:${bucket}`;
}

/**
 * Check dominance against table:
 * - If a previous state reached same (node, time-bucket) with lower gen cost → prune
 */
function isDominated(state, dominanceMap) {
  const key = makeDominanceKey(state.nodeId, state.arrivalTimeUtc);
  const prevBest = dominanceMap.get(key);

  if (prevBest !== undefined && prevBest <= state.genCost) {
    logDev("Dominance prune:", { key, prevBest, incoming: state.genCost });
    return true;
  }

  // Update the best known cost
  dominanceMap.set(key, state.genCost);
  return false;
}

/**
 * Check if a state is a destination match:
 * - Exact address or hotel → only exact node
 * - Area → any node in that area
 */
function isDestination(state, destSpec) {
  if (destSpec.isAddress) {
    return state.nodeId === destSpec.nodes[0].id;
  }

  if (destSpec.isArea || destSpec.isHotelQuery) {
    const destIds = new Set(destSpec.nodes.map((n) => n.id));
    return destIds.has(state.nodeId);
  }

  return false;
}

/**
 * Extract endpoint nodes for destination early LB termination.
 */
function extractDestinationNodes(destSpec) {
  return destSpec.nodes;
}

/**
 * Main search function.
 */
export async function searchItinerariesDoorToDoor(
  originSpec,
  destSpec,
  params = {}
) {
  const {
    maxExpansions = 100000,
    timeoutMs = 5000,
    timeValuePerHour = 20,
    transferPenalty = 6,
    maxDetourFactor = 2.2,
  } = params;

  logDev("SEARCH INIT", {
    originSpec,
    destSpec,
    params,
  });

  // Build graph
  const { nodes, adj } = await buildGraph();

  // Make quick node lookup map
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // For origin, we expect exactly 1 synthetic address node OR multiple area/hotel nodes
  const originNodes = originSpec.nodes;
  const destNodes = extractDestinationNodes(destSpec);

  // Initialize frontier (simple priority queue using sort)
  let frontier = [];

  // Initialize dominance map
  const dominanceMap = new Map();

  // Initialize best solution
  let bestCost = null;
  let bestState = null;

  // Start clock
  const startTime = Date.now();

  // Seed frontier with each possible origin node
  for (const orig of originNodes) {
    // For synthetic nodes (id null), we allow search but they won't be matched
    if (orig.id == null) {
      // Synthetic origin not persisted yet — we attach a fake ID
      // Real impl: persist node before search.
      orig.id = -Math.floor(Math.random() * 1000000);
    }

    const initial = createState(
      orig.id,
      new Date().toISOString(),
      0,
      0,
      []
    );

    frontier.push(initial);
  }

  let expansions = 0;

  // Main loop
  while (frontier.length > 0) {
    // Timeout check
    if (Date.now() - startTime > timeoutMs) {
      return {
        search_status: "TIME_BUDGET_EXHAUSTED",
        best_itinerary: bestState,
        expansions,
      };
    }

    // Expansion budget
    if (expansions > maxExpansions) {
      return {
        search_status: "TIME_BUDGET_EXHAUSTED",
        best_itinerary: bestState,
        expansions,
      };
    }

    // Sort frontier by genCost (best-first)
    frontier.sort((a, b) => a.genCost - b.genCost);

    const state = frontier.shift();
    expansions++;

    logDev("EXPANDING STATE", {
      nodeId: state.nodeId,
      genCost: state.genCost,
      pathLen: state.path.length,
    });

    // Destination check
    if (isDestination(state, destSpec)) {
      const arrivalCost = state.genCost;
      logDev("DESTINATION REACHED", { arrivalCost });

      if (bestCost === null || arrivalCost < bestCost) {
        bestCost = arrivalCost;
        bestState = state;
      }

      // Hybrid early stopping:
      if (frontier.length > 0) {
        const lbFrontier =
          frontier[0].genCost +
          estimateLowerBound(
            nodeById.get(frontier[0].nodeId),
            nodeById.get(destNodes[0].id), // approximate LB to any destination node
            params
          );

        if (lbFrontier >= bestCost) {
          logDev("EARLY OPTIMAL TERMINATION", {
            bestCost,
            lbFrontier,
          });

          return {
            search_status: "OK",
            best_itinerary: bestState,
            expansions,
          };
        }
      }

      // Continue searching for potentially better solutions
      continue;
    }

    // No specific adjacency from this node
    const outgoing = adj[state.nodeId] || [];
    if (outgoing.length === 0) continue;

    // Process outgoing legs
    for (const leg of outgoing) {
      // Pruning
      if (shouldPrune(state, leg, bestCost, nodeById.get(destNodes[0].id), params)) {
        continue;
      }

      // Compute new gen cost
      const {
        newGenCost,
        newTransfers,
        legDurationMin,
      } = computeLegGeneralizedCost(state, leg, params);

      // Create new state
      const newState = createState(
        leg.edge_leg.destination_node_id,
        leg.offer.arrival_time_utc,
        newGenCost,
        newTransfers,
        [...state.path, leg]
      );

      // Dominance pruning
      if (isDominated(newState, dominanceMap)) continue;

      frontier.push(newState);
    }
  }

  // No feasible route found
  return {
    search_status: "NO_FEASIBLE_ROUTE",
    best_itinerary: null,
    expansions,
  };
}
