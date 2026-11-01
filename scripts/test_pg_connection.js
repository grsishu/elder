import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.argv[2] || process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('Usage: node scripts/test_pg_connection.js "<DATABASE_URL>"');
  console.log('Or set DATABASE_URL in your environment.');
  process.exit(1);
}

const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
console.log(`\n[Test] Testing connection to PostgreSQL: ${maskedUrl}`);

const isRemote =
  !dbUrl.includes('localhost') &&
  !dbUrl.includes('127.0.0.1');

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000,
});

async function run() {
  try {
    const client = await pool.connect();
    console.log('[Test] Connected to PostgreSQL successfully!');

    const res = await client.query('SELECT version(), NOW() as current_time');
    console.log('[Test] PostgreSQL Version:', res.rows[0].version.split(' ')[0], res.rows[0].version.split(' ')[1]);
    console.log('[Test] Server Time:', res.rows[0].current_time);

    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`[Test] Tables in database (${tablesRes.rows.length}):`);
    tablesRes.rows.forEach(r => console.log('  -', r.table_name));

    client.release();
    await pool.end();
    console.log('\n[Test] SUCCESS: Database is accessible and fully operational!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n[Test] FAILED: Could not connect to PostgreSQL:');
    console.error(err.message);
    await pool.end();
    process.exit(1);
  }
}

run();
