import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  let dbOk = false;
  try {
    const result = await pool.query('SELECT 1 as healthy');
    dbOk = result.rows[0]?.healthy === 1;
  } catch (err) {
    dbOk = false;
  }

  const statusCode = dbOk ? 200 : 503;
  return res.status(statusCode).json({
    status: dbOk ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected',
    version: '1.0.0',
    disclaimer: 'This app supports memory practice and safety. It does not diagnose or treat dementia or any medical condition. Please consult a doctor for health concerns.',
  });
});

export default router;
