-- 002_door_to_door_graph.sql
-- Door-to-door graph schema: locations, areas, edges, offers, API cache, itineraries.

PRAGMA foreign_keys = ON;

-- Areas (cities / metros / neighborhoods)
CREATE TABLE IF NOT EXISTS area (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL,      -- 'city', 'metro', 'neighborhood', 'airport_catchment'
  country_code     TEXT,
  center_lat       REAL NOT NULL,
  center_lon       REAL NOT NULL,
  radius_km        REAL NOT NULL,
  parent_area_id   INTEGER,
  created_at_utc   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at_utc   TEXT NOT NULL
);

-- Location nodes: airports, stations, bus terminals, hotels, addresses, areas, POIs
CREATE TABLE IF NOT EXISTS location_node (
  id                   INTEGER PRIMARY KEY,
  ext_ref              TEXT,              -- external reference, e.g. 'IATA:IND'
  name                 TEXT NOT NULL,
  kind                 TEXT NOT NULL,     -- 'airport','station','bus_terminal','hotel','address','area','poi'
  area_id              INTEGER,           -- FK to area.id
  lat                  REAL NOT NULL,
  lon                  REAL NOT NULL,
  is_hub               INTEGER NOT NULL DEFAULT 0,   -- 0/1

  mct_air_to_ground_min   INTEGER DEFAULT 30,        -- node-level MCT defaults
  mct_ground_to_air_min   INTEGER DEFAULT 60,
  mct_any_to_any_min      INTEGER DEFAULT 10,

  country_code         TEXT,
  timezone             TEXT,
  created_at_utc       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at_utc       TEXT NOT NULL
);

-- Directed legs between nodes (structure only, not prices)
CREATE TABLE IF NOT EXISTS edge_leg (
  id                 INTEGER PRIMARY KEY,
  from_node_id       INTEGER NOT NULL REFERENCES location_node(id),
  to_node_id         INTEGER NOT NULL REFERENCES location_node(id),
  mode               TEXT NOT NULL,  -- 'flight','train','bus','rideshare','walk','metro','tram', etc.
  is_transfer        INTEGER NOT NULL DEFAULT 0, -- 1 = transfer / first-last-mile
  carrier_code       TEXT,
  service_code       TEXT,           -- flight number, line code, etc.

  distance_km        REAL,
  duration_min       INTEGER NOT NULL,
  min_connection_min INTEGER,        -- override node-level MCT if set
  co_located         INTEGER NOT NULL DEFAULT 0,

  structure_type     TEXT NOT NULL,  -- 'static','dynamic_template'
  created_at_utc     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at_utc     TEXT NOT NULL
);

-- Priced offers for traversing edge_legs at specific times
CREATE TABLE IF NOT EXISTS offer (
  id                   INTEGER PRIMARY KEY,
  edge_leg_id          INTEGER NOT NULL REFERENCES edge_leg(id),

  departure_time_utc   TEXT NOT NULL,
  arrival_time_utc     TEXT NOT NULL,
  price_total          REAL NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'USD',

  source_type          TEXT NOT NULL, -- 'api_live','cached','manual_static','estimated_model'
  source_provider      TEXT,          -- 'amadeus','rome2rio','rideshare_model', etc.
  source_ref           TEXT,          -- provider offer id, fare key, etc.
  api_cache_id         INTEGER,       -- nullable FK to api_cache

  is_static            INTEGER NOT NULL DEFAULT 0,
  retrieval_time_utc   TEXT NOT NULL,
  validity_window_hrs  REAL,
  effective_from_utc   TEXT,
  last_verified_utc    TEXT,

  ttl_hrs              REAL,
  is_active            INTEGER NOT NULL DEFAULT 1,

  reliability_score    REAL,
  meta_json            TEXT
);

-- Provider response cache
CREATE TABLE IF NOT EXISTS api_cache (
  id                    INTEGER PRIMARY KEY,
  provider              TEXT NOT NULL,
  endpoint              TEXT NOT NULL,
  canonical_params_hash TEXT NOT NULL,
  canonical_params_json TEXT NOT NULL,
  response_body_json    TEXT NOT NULL,
  created_at_utc        TEXT NOT NULL,
  expires_at_utc        TEXT NOT NULL,
  last_used_at_utc      TEXT NOT NULL,
  hit_count             INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_cache_key
  ON api_cache (provider, endpoint, canonical_params_hash);

-- Door-to-door itinerary bundle (search result)
CREATE TABLE IF NOT EXISTS itinerary_bundle (
  id                     INTEGER PRIMARY KEY,
  origin_node_id         INTEGER NOT NULL REFERENCES location_node(id),
  dest_node_id           INTEGER NOT NULL REFERENCES location_node(id),

  origin_spec_raw        TEXT NOT NULL,
  dest_spec_raw          TEXT NOT NULL,

  legs_json              TEXT NOT NULL,  -- JSON array of legs with offer/edge/nodes

  price_total            REAL NOT NULL,
  duration_min           INTEGER NOT NULL,
  num_transfers          INTEGER NOT NULL,
  main_mode              TEXT,

  time_value_per_hour    REAL NOT NULL,
  transfer_penalty       REAL NOT NULL,
  risk_penalties_json    TEXT,

  gen_cost               REAL NOT NULL,
  search_status          TEXT NOT NULL,  -- 'OK','TIME_BUDGET_EXHAUSTED','NO_FEASIBLE_ROUTE'

  search_params_json     TEXT NOT NULL,
  search_started_at_utc  TEXT NOT NULL,
  search_finished_at_utc TEXT NOT NULL
);
