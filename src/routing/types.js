// src/routing/types.js
// Shared enums, constants, and type patterns for routing logic.

export const NodeKind = {
    AIRPORT: "airport",
    STATION: "station",
    BUS_TERMINAL: "bus_terminal",
    HOTEL: "hotel",
    ADDRESS: "address",
    AREA: "area",
    POI: "poi",
  };
  
  export const EdgeMode = {
    FLIGHT: "flight",
    TRAIN: "train",
    BUS: "bus",
    RIDESHARE: "rideshare",
    WALK: "walk",
    METRO: "metro",
    TRAM: "tram",
    SHUTTLE: "shuttle",
  };
  
  export const OfferSourceType = {
    API_LIVE: "api_live",
    CACHED: "cached",
    MANUAL_STATIC: "manual_static",
    ESTIMATED_MODEL: "estimated_model",
  };
  
  export const SearchStatus = {
    OK: "OK",
    TIME_EXHAUSTED: "TIME_BUDGET_EXHAUSTED",
    NO_ROUTE: "NO_FEASIBLE_ROUTE",
  };
  
  export const DEFAULT_RIDESHARE_MODEL = {
    base_fare: 3.00,
    per_km: 1.25,
    per_min: 0.25,
    avg_speed_kmh: 35,
    surge_coeff: 1.0,
  };
  