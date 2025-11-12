'use strict';

/**
 * First-Run Scaffold (no deps, no JSX)
 * - Loads .env (placeholders fine)
 * - Writes Data/first_run_sample.json
 * - Creates SQLite DB using system Python (Data/first_run.db) and inserts a row
 * Run:  npx tsx intermodal_mvp_systems_builder_scaffold.jsx --first-run --out Data/first_run_sample.json
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function parseArgs(argv) {
  const out = { flags: {}, positionals: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const sp = a.indexOf('=');
      if (sp > -1) out.flags[a.slice(2, sp)] = a.slice(sp + 1);
      else out.flags[a.slice(2)] = true;
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}

function loadDotEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const ix = line.indexOf('=');
    if (ix === -1) continue;
    const key = line.slice(0, ix).trim();
    let val = line.slice(ix + 1);
    const q = val[0];
    if ((q === '"' || q === "'") && val[val.length - 1] === q) {
      val = val.slice(1, -1);
    }
    env[key] = val;
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return env;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function pythonSqliteSmoke(dbPath) {
  const pyPath = path.join('Data', 'first_run_sqlite.py');
  const pyCode = `import sqlite3, json, time, os, sys

db = sys.argv[1]
os.makedirs(os.path.dirname(db), exist_ok=True)

conn = sqlite3.connect(db)
c = conn.cursor()
c.execute("CREATE TABLE IF NOT EXISTS first_run (ts TEXT, note TEXT)")
c.execute("INSERT INTO first_run (ts, note) VALUES (?, ?)", (time.strftime("%Y-%m-%dT%H:%M:%S"), "ok"))
conn.commit()
count = c.execute("SELECT COUNT(*) FROM first_run").fetchone()[0]
conn.close()

print(json.dumps({"db_path": db, "rows": int(count)}))`;
  fs.mkdirSync(path.dirname(pyPath), { recursive: true });
  fs.writeFileSync(pyPath, pyCode, 'utf8');
  const out = cp.execFileSync('python3', [pyPath, dbPath], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return JSON.parse(out);
}


(function main() {
  const args = parseArgs(process.argv);
  const isFirstRun = !!args.flags['first-run'];
  const outPath = (typeof args.flags['out'] === 'string' ? args.flags['out'] : 'Data/first_run_sample.json');
  if (!isFirstRun) {
    console.error('Pass --first-run to execute the setup smoke test.');
    process.exit(2);
  }

  const envLoaded = loadDotEnv('.env');
  ensureDir(path.dirname(typeof outPath === 'string' ? outPath : 'Data/first_run_sample.json'));

  let dbResult = null;
  let dbError = null;
  try {
    dbResult = pythonSqliteSmoke(path.join('Data', 'first_run.db'));
  } catch (e) {
    dbError = String(e && e.message ? e.message : e);
  }

  let npmV = null;
  try { npmV = cp.execFileSync('npm', ['-v'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); } catch {}

  const result = {
    timestamp: new Date().toISOString(),
    node: process.version,
    npm: npmV,
    cwd: process.cwd(),
    env_present: {
      SUPABASE_URL: Object.prototype.hasOwnProperty.call(envLoaded, 'SUPABASE_URL'),
      SUPABASE_ANON_KEY: Object.prototype.hasOwnProperty.call(envLoaded, 'SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE: Object.prototype.hasOwnProperty.call(envLoaded, 'SUPABASE_SERVICE_ROLE'),
      AMADEUS_CLIENT_ID: Object.prototype.hasOwnProperty.call(envLoaded, 'AMADEUS_CLIENT_ID'),
      AMADEUS_CLIENT_SECRET: Object.prototype.hasOwnProperty.call(envLoaded, 'AMADEUS_CLIENT_SECRET'),
      ROME2RIO_API_KEY: Object.prototype.hasOwnProperty.call(envLoaded, 'ROME2RIO_API_KEY'),
      SKYSCANNER_API_KEY: Object.prototype.hasOwnProperty.call(envLoaded, 'SKYSCANNER_API_KEY'),
      FLIXBUS_API_KEY: Object.prototype.hasOwnProperty.call(envLoaded, 'FLIXBUS_API_KEY'),
      UBER_SERVER_TOKEN: Object.prototype.hasOwnProperty.call(envLoaded, 'UBER_SERVER_TOKEN'),
    },
    db: dbResult ? { ok: true, ...dbResult } : { ok: false, error: dbError },
    out_path: outPath,
  };

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

  const ok = result.db && result.db.ok === true;
  console.log('First-Run complete.');
  console.log('Artifact:', outPath);
  if (ok) {
    console.log('SQLite write/read ✅', result.db);
    process.exit(0);
  } else {
    console.log('SQLite write/read ❌', result.db);
    process.exit(1);
  }
})();
