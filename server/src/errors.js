import { pool } from './db.js';

// Circular buffer keeping the last 20 server errors in memory for instant /diagnostics response
const recentErrors = [];
const MAX_RECENT_ERRORS = 20;

export function logServerError({ message, stack, route, statusCode = 500 }) {
  const errorEntry = {
    id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    message: String(message),
    stack: stack ? String(stack).split('\n').slice(0, 5).join('\n') : null,
    route: route || 'unknown',
    statusCode,
  };

  recentErrors.unshift(errorEntry);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.pop();
  }

  // Also asynchronously record in database if DB is reachable
  pool.query(
    'INSERT INTO server_error_logs (message, stack, route, status_code) VALUES ($1, $2, $3, $4)',
    [errorEntry.message, errorEntry.stack, errorEntry.route, errorEntry.statusCode]
  ).catch(err => {
    console.error('Failed to write error to server_error_logs table:', err.message);
  });

  return errorEntry;
}

export function getRecentErrors() {
  return [...recentErrors];
}
