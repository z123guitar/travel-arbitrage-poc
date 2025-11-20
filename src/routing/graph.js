// src/routing/graph.js
// Build searchable graph structure from:
// - DB nodes
// - DB edges (structural)
// - DB offers (time windows)
// - Generated transfers (walk, rideshare, shuttle)

import { openDb } from "../db/connection.js";
import { logDev } from "./config.js";
import {
  generateWalkTransfer,
  generateRideshareTransfer,
  generateShuttleTransfer,
} from "./transfers.js";

/**
 * Load nodes from DB.
 */
async function loadNodes() {
  const db = openDb();
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM location_node";
    db.all(sql, [], (err, rows) => {
      db.close();
      if (err) return reject(err);
      logDev("loadNodes", { count: rows.length });
      resolve(rows || []);
    });
  });
}

/**
 * Load structural edges (edge_leg rows) from DB.
 */
async function loadStructuralEdges() {
  const db = openDb();
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM edge_leg";
    db.all(sql, [], (err, rows) => {
      db.close();
      if (err) return reject(err);
      logDev("loadStructuralEdges", { count: rows.length });
      resolve(rows || []);
    });
  });
}

/**
 * Load offers for edges.
 */
async function loadOffers() {
  const db = openDb();
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM offer";
    db.all(sql, [], (err, rows) => {
      db.close();
      if (err) return reject(err);
      logDev("loadOffers", { count: rows.length });
      resolve(rows || []);
    });
  });
}

/**
 * Create adjacency map:
 * {
 *   [node_id]: [
 *     { edge_leg, offer }...
 *   ]
 * }
 */
function buildAdjacency(nodes, edges, offers) {
  const adj = {};
  for (const n of nodes) {
    adj[n.id] = [];
  }

  // group offers by edge_leg_id
  const offersByEdge = {};
  for (const off of offers) {
    const list = offersByEdge[off.edge_leg_id] || [];
    list.push(off);
    offersByEdge[off.edge_leg_id] = list;
  }

  for (const e of edges) {
    const list = offersByEdge[e.id] || [];

    // expand each offer into a searchable timed-edge
    for (const off of list) {
      adj[e.origin_node_id].push({
        edge_leg: e,
        offer: off,
      });
    }
  }

  return adj;
}

/**
 * Insert transfer edges (walk & rideshare) between nodes within radius.
 */
function addTransferEdges(nodes, adj, radiusKm = 3.0) {
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id === b.id) continue;

      // simple distance check
      const dx = a.lat - b.lat;
      const dy = a.lon - b.lon;
      const distApprox = Math.sqrt(dx * dx + dy * dy) * 111;

      if (distApprox > radiusKm) continue;

      // generate walk transfer
      const walk = generateWalkTransfer(a, b);
      adj[a.id].push(walk);

      // generate rideshare
      const rs = generateRideshareTransfer(a, b);
      adj[a.id].push(rs);

      // generate shuttle (optional)
      const sh = generateShuttleTransfer(a, b);
      adj[a.id].push(sh);
    }
  }

  logDev("addTransferEdges completed");
}

/**
 * Build the graph used by the routing engine.
 */
export async function buildGraph() {
  const nodes = await loadNodes();
  const edges = await loadStructuralEdges();
  const offers = await loadOffers();

  const adj = buildAdjacency(nodes, edges, offers);

  // add transfers
  addTransferEdges(nodes, adj);

  logDev("Graph constructed", {
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  return { nodes, adj };
}
