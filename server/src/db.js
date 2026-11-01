import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { config } from './config.js';

const require = createRequire(import.meta.url);
let sqlite3Module = null;

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isSqlite = process.env.USE_SQLITE === 'true' || config.databaseUrl.startsWith('sqlite:');
let pgPool = null;
let sqliteDb = null;
let dbInitialized = false;

// Ensure server/data directory exists for persistent SQLite database
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const sqlitePath = process.env.SQLITE_PATH || path.join(dataDir, 'elder.db');

export function getDatabaseType() {
  return isSqlite ? 'sqlite' : 'postgresql';
}

export function initSqliteDb() {
  if (sqliteDb) return sqliteDb;
  if (!sqlite3Module) {
    try {
      sqlite3Module = require('sqlite3');
    } catch (err) {
      console.warn(`[DB] SQLite3 native module could not be loaded (${err.message}).`);
      if (config.nodeEnv === 'production') {
        throw new Error(
          `SQLite3 is not supported in this production environment (${err.message}). PostgreSQL is required. Please configure DATABASE_URL in your Render Web Service settings.`
        );
      }
      throw err;
    }
  }
  sqliteDb = new sqlite3Module.Database(sqlitePath);
  sqliteDb.configure('busyTimeout', 5000);
  isSqlite = true;
  return sqliteDb;
}

export async function initDb() {
  if (dbInitialized) return;

  const isProduction = config.nodeEnv === 'production';
  const rawDbUrl = (process.env.DATABASE_URL || config.databaseUrl || '').trim();
  const isInvalidProdUrl =
    !rawDbUrl ||
    rawDbUrl.includes('localhost') ||
    rawDbUrl.includes('127.0.0.1');

  if (isProduction) {
    if (isInvalidProdUrl) {
      console.error('\n' + '='.repeat(80));
      console.error('[CRITICAL DATABASE CONFIGURATION ERROR]');
      console.error('Smriti Saathi is running in PRODUCTION mode, but a valid remote DATABASE_URL is missing!');
      console.error('');
      console.error('Render PostgreSQL setup required:');
      console.error('1. In your Render Dashboard, click "New +" -> "PostgreSQL".');
      console.error('2. Create the database named "elder-db" in region Singapore.');
      console.error('3. Copy the "Internal Database URL" (e.g. postgresql://elder_user:...@dpg-...:5432/elder_db).');
      console.error('4. Go to your Web Service -> "Environment" -> Add "DATABASE_URL" and paste the URL.');
      console.error('5. Save changes to trigger automatic deployment.');
      console.error('='.repeat(80) + '\n');
      throw new Error(
        'DATABASE_URL environment variable is required in production. Please configure Render PostgreSQL.'
      );
    }

    try {
      const isRemotePg =
        !config.databaseUrl.includes('localhost') &&
        !config.databaseUrl.includes('127.0.0.1');

      pgPool = new Pool({
        connectionString: config.databaseUrl,
        ssl: isRemotePg ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
      });

      const testClient = await pgPool.connect();
      testClient.release();
      isSqlite = false;
      console.log('[DB] Connected to PostgreSQL production database successfully.');
    } catch (err) {
      const maskedUrl = config.databaseUrl.replace(/:[^:@]+@/, ':****@');
      console.error('\n' + '='.repeat(80));
      console.error('[CRITICAL DATABASE CONNECTION ERROR]');
      console.error(`Failed to connect to PostgreSQL at ${maskedUrl}`);
      console.error(`Error details: ${err.message}`);
      console.error('');
      console.error('Troubleshooting:');
      console.error('1. Verify your Render PostgreSQL database is in status "Available".');
      console.error('2. Make sure you used the "Internal Database URL" if deploying in the same region.');
      console.error('3. Check that the password and database name in DATABASE_URL are correct.');
      console.error('='.repeat(80) + '\n');
      throw new Error(`Production PostgreSQL connection failed: ${err.message}`);
    }
  } else {
    // Development or test mode: try PostgreSQL if configured, otherwise fall back to SQLite
    const shouldTryPg = !isSqlite && Boolean(config.databaseUrl && config.databaseUrl.trim());

    if (shouldTryPg) {
      try {
        const isRemotePg =
          config.databaseUrl.includes('render.com') ||
          config.databaseUrl.includes('neon.tech') ||
          config.databaseUrl.includes('supabase.co') ||
          config.databaseUrl.includes('sslmode=require') ||
          config.databaseUrl.includes('amazonaws.com');

        pgPool = new Pool({
          connectionString: config.databaseUrl,
          ssl: isRemotePg ? { rejectUnauthorized: false } : false,
          connectionTimeoutMillis: 3000,
        });

        const testClient = await pgPool.connect();
        testClient.release();
        isSqlite = false;
        console.log('[DB] Connected to PostgreSQL successfully.');
      } catch (err) {
        console.warn(`[DB] Local PostgreSQL connection failed (${err.message}). Falling back to SQLite (${sqlitePath})...`);
        isSqlite = true;
        if (pgPool) {
          try { await pgPool.end(); } catch { /* ignore */ }
          pgPool = null;
        }
        initSqliteDb();
      }
    } else {
      initSqliteDb();
      console.log(`[DB] Running on SQLite (${sqlitePath})`);
    }
  }

  dbInitialized = true;
}

function translateSqlForSqlite(sql) {
  let s = sql;

  // 1. Strip extensions & type casts
  s = s.replace(/CREATE EXTENSION[^\n;]+;/gi, '');
  s = s.replace(/::[a-zA-Z_]+/g, '');

  // 2. Data types
  s = s.replace(/\bUUID\b/gi, 'TEXT');
  s = s.replace(/\bTIMESTAMP WITH TIME ZONE\b/gi, 'TEXT');
  s = s.replace(/\bTIMESTAMP\b/gi, 'TEXT');
  s = s.replace(/\bJSONB\b/gi, 'TEXT');
  s = s.replace(/\bBYTEA\b/gi, 'BLOB');
  s = s.replace(/\bNUMERIC\([^)]+\)/gi, 'REAL');
  s = s.replace(/gen_random_uuid\(\)/gi, "(lower(hex(randomblob(16))))");

  // 3. Current time / intervals
  s = s.replace(/\bDEFAULT\s+NOW\(\)/gi, "DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))");
  s = s.replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\b/gi, "DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))");
  s = s.replace(/\bNOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*seconds?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-$1 seconds')");
  s = s.replace(/\bNOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*minutes?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-$1 minutes')");
  s = s.replace(/\bNOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-$1 hours')");
  s = s.replace(/\bNOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-$1 days')");
  s = s.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s*'(\d+)\s*days?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+$1 days')");
  s = s.replace(/\bNOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  s = s.replace(/CURRENT_DATE/gi, "(date('now'))");

  // 4. Alter table
  s = s.replace(/\bALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ALTER TABLE $1 ADD COLUMN');

  return s;
}

const booleanColumns = new Set([
  'unreliable_for_safety', 'verified', 'active', 'share_location', 'share_health', 'share_progress',
  'routine_drift_enabled', 'auto_lost_enabled', 'can_see_location', 'can_see_progress', 'can_see_health',
  'can_manage_reminders', 'can_approve_rides', 'is_emergency_contact', 'is_active',
  'send_weekly_sunday_1800', 'send_monthly', 'alert_caregivers', 'read', 'acknowledged',
  'night_rule_enabled', 'auto_calls_enabled'
]);

function normalizeRow(row) {
  if (!row) return row;
  const normalized = { ...row };
  for (const [key, val] of Object.entries(normalized)) {
    if (booleanColumns.has(key) || /^(is_|can_|has_)|(_enabled|_active)$/.test(key)) {
      if (val === 1) normalized[key] = true;
      else if (val === 0) normalized[key] = false;
    }
  }
  return normalized;
}

function adaptQueryAndParamsForSqlite(text, params = []) {
  let s = text;
  const newParams = [];

  // Replace Postgres $1, $2, $3 with SQLite ? and map params correctly even when $1 is repeated
  s = s.replace(/\$(\d+)/g, (_, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    newParams.push(params[idx]);
    return '?';
  });

  // Handle TO_TIMESTAMP(unix_timestamp)
  s = s.replace(/TO_TIMESTAMP\((\d+)\)/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', $1, 'unixepoch')");

  // Handle chaining of intervals like NOW() - INTERVAL '1 days' - INTERVAL '10 minutes'
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*days?'\s*-\s*INTERVAL\s*'(\d+)\s*minutes?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-$1 days', '-$2 minutes')");

  // Replace Postgres intervals
  s = s.replace(/NOW\(\)\s*([+-])\s*INTERVAL\s*'(\d+)\s*seconds?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '$1$2 seconds')");
  s = s.replace(/NOW\(\)\s*([+-])\s*INTERVAL\s*'(\d+)\s*minutes?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '$1$2 minutes')");
  s = s.replace(/NOW\(\)\s*([+-])\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '$1$2 hours')");
  s = s.replace(/NOW\(\)\s*([+-])\s*INTERVAL\s*'(\d+)\s*days?'/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '$1$2 days')");
  s = s.replace(/\bNOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  s = s.replace(/\bCURRENT_TIMESTAMP\b/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  s = s.replace(/version\(\)/gi, "'SQLite 3'");

  // Strip Postgres vendor-specific row locks (FOR UPDATE SKIP LOCKED)
  s = s.replace(/\s*FOR\s+UPDATE(\s+SKIP\s+LOCKED)?/gi, '');

  // Replace JSON casts
  s = s.replace(/::[a-zA-Z_]+/g, '');

  return { adaptedSql: s, adaptedParams: newParams.length > 0 ? newParams : params };
}

export async function query(text, params = []) {
  if (!dbInitialized) {
    await initDb();
  }

  const start = Date.now();

  if (!isSqlite && pgPool) {
    const res = await pgPool.query(text, params);
    const duration = Date.now() - start;
    if (config.nodeEnv === 'development' && duration > 500) {
      console.warn(`Slow PG query (${duration}ms):`, text.substring(0, 100));
    }
    return res;
  }

  // SQLite execution
  const db = initSqliteDb();
  const { adaptedSql, adaptedParams } = adaptQueryAndParamsForSqlite(text, params);

  // Convert params: serialize objects/arrays to JSON strings, dates to ISO strings, booleans to 0/1 if needed
  const normalizedParams = adaptedParams.map(p => {
    if (p === undefined) return null;
    if (p instanceof Date) return p.toISOString();
    if (typeof p === 'object' && p !== null && !Buffer.isBuffer(p)) {
      return JSON.stringify(p);
    }
    if (typeof p === 'boolean') {
      return p ? 1 : 0;
    }
    return p;
  });

  return new Promise((resolve, reject) => {
    const trimmed = adaptedSql.trim();
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(trimmed);
    const hasReturning = /\bRETURNING\b/i.test(trimmed);

    if (isSelect || hasReturning) {
      db.all(adaptedSql, normalizedParams, (err, rows) => {
        if (err) return reject(err);
        const processedRows = (rows || []).map(normalizeRow);
        resolve({
          rows: processedRows,
          rowCount: processedRows.length,
        });
      });
    } else {
      db.run(adaptedSql, normalizedParams, function (err) {
        if (err) return reject(err);
        resolve({
          rows: [],
          rowCount: this.changes,
          lastID: this.lastID,
        });
      });
    }
  });
}

export const pool = {
  query: (text, params) => query(text, params),
  connect: async () => {
    if (!dbInitialized) await initDb();
    if (!isSqlite && pgPool) {
      return await pgPool.connect();
    }
    return {
      query: (text, params) => query(text, params),
      release: () => {},
    };
  },
  get totalCount() {
    return pgPool ? pgPool.totalCount : 1;
  },
  get idleCount() {
    return pgPool ? pgPool.idleCount : 1;
  },
  end: async () => {
    if (pgPool) await pgPool.end();
    if (sqliteDb) {
      await new Promise(r => sqliteDb.close(r));
      sqliteDb = null;
    }
    dbInitialized = false;
  },
};

export async function runMigrations() {
  if (!dbInitialized) {
    await initDb();
  }

  console.log(`[DB] Running database migrations on ${isSqlite ? 'SQLite' : 'PostgreSQL'}...`);
  const migrationsDir = path.resolve(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn('[DB] Migrations directory not found:', migrationsDir);
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  if (isSqlite) {
    const db = initSqliteDb();
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const rawSql = fs.readFileSync(filePath, 'utf8');
      const translated = translateSqlForSqlite(rawSql);
      const statements = translated
        .split(';')
        .map(st => st.replace(/^(--[^\n]*\n|\s+)+/, '').trim())
        .filter(st => st.length > 0);

      for (const stmt of statements) {
        try {
          // Debug
          // console.log('Running:', stmt);
          await new Promise((resolve, reject) => {
            db.run(stmt, (err) => {
              if (err) {
                // Ignore idempotent errors in SQLite
                if (
                  err.message.includes('duplicate column name') ||
                  err.message.includes('already exists') ||
                  err.message.includes('UNIQUE constraint failed')
                ) {
                  resolve();
                } else {
                  reject(err);
                }
              } else {
                resolve();
              }
            });
          });
        } catch (err) {
          console.error(`[DB] SQLite migration failed on ${file}:`);
          console.error(stmt);
          console.error('Error message:', err.message);
          throw err;
        }
      }
      console.log(`[DB] Successfully applied migration: ${file}`);
    }
  } else {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`[DB] Successfully applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB] Migration failed on ${file}:`, err.message);
        throw err;
      } finally {
        client.release();
      }
    }
  }
  console.log('[DB] Migrations completed successfully.');
}
