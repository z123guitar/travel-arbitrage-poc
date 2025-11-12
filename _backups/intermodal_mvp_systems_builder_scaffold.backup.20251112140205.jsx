/**
 * First-Run Scaffold (Node + Python sqlite check)
 * - Loads .env (basic parser, no deps)
 * - Creates Data/first_run_sample.json
 * - Creates SQLite DB via python3 (Data/first_run.db) and inserts a row
 * Usage: npx tsx intermodal_mvp_systems_builder_scaffold.jsx --first-run --out Data/first_run_sample.json
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function parseArgs(argv) {
  const out = { flags: {}, positionals: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=");
      out.flags[k.replace(/^--/, "")] = v ?? true;
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}

function loadDotEnv(file = ".env") {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1);
    if ((val.startsWith(') && val.endsWith(')) || (val.startsWith(") && val.endsWith("))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
    if (process.env[key] === undefined) { process.env[key] = val; }
  }
  return env;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function pythonSqliteSmoke(dbPath) {
  const py = .trim();
  const out = execSync(, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out);
}

(async function main() {
  const args = parseArgs(process.argv);
  const isFirstRun = !!args.flags["first-run"];
  const outPath = args.flags["out"] || "Data/first_run_sample.json";

  if (!isFirstRun) {
    console.error("Pass --first-run to execute the setup smoke test.");
    process.exit(2);
  }

  // Load env
  const envLoaded = loadDotEnv(".env");

  // Prepare Data dir
  const dataDir = path.dirname(outPath);
  ensureDir(dataDir);

  // DB smoke test via python sqlite3
  let dbResult = null;
  let dbError = null;
  try {
    dbResult = pythonSqliteSmoke(path.join("Data", "first_run.db"));
  } catch (e) {
    dbError = String(e);
  }

  // Compose result
  const result = {
    timestamp: new Date().toISOString(),
    node: process.version,
    npm: (() => { try { return execSync("npm -v").toString().trim(); } catch { return null; } })(),
    cwd: process.cwd(),
    env_present: {
      SUPABASE_URL: "SUPABASE_URL" in envLoaded,
      SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY" in envLoaded,
      SUPABASE_SERVICE_ROLE: "SUPABASE_SERVICE_ROLE" in envLoaded,
      AMADEUS_CLIENT_ID: "AMADEUS_CLIENT_ID" in envLoaded,
      AMADEUS_CLIENT_SECRET: "AMADEUS_CLIENT_SECRET" in envLoaded,
      ROME2RIO_API_KEY: "ROME2RIO_API_KEY" in envLoaded,
      SKYSCANNER_API_KEY: "SKYSCANNER_API_KEY" in envLoaded,
      FLIXBUS_API_KEY: "FLIXBUS_API_KEY" in envLoaded,
      UBER_SERVER_TOKEN: "UBER_SERVER_TOKEN" in envLoaded
    },
    db: dbResult ? { ok: true, ...dbResult } : { ok: false, error: dbError },
    out_path: outPath
  };

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  const ok = result.db && result.db.ok === true;
  console.log("First-Run complete.");
  console.log("Artifact:", outPath);
  if (ok) {
    console.log("SQLite write/read ✅", result.db);
    process.exit(0);
  } else {
    console.log("SQLite write/read ❌", result.db);
    process.exit(1);
  }
})();
