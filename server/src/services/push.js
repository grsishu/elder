import webpush from 'web-push';
import { config } from '../config.js';
import { query } from '../db.js';

let webPushInitialized = false;

export function initWebPush() {
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    try {
      webpush.setVapidDetails(
        config.vapidSubject || 'mailto:support@smritisaathi.in',
        config.vapidPublicKey,
        config.vapidPrivateKey
      );
      webPushInitialized = true;
    } catch (err) {
      console.warn('[WebPush] VAPID configuration error:', err.message);
    }
  }
}

initWebPush();

/**
 * Send push notification to all subscriptions for a user or elder
 */
export async function sendWebPushNotification({ userId, elderId, title, body, icon, data = {}, actions = [] }) {
  if (!webPushInitialized) {
    console.log('[WebPush] Mock delivery (VAPID not fully active):', { title, body });
    return { success: false, reason: 'NOT_INITIALIZED' };
  }

  const payload = JSON.stringify({
    title,
    body,
    icon: icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'smriti-reminder',
    data,
    actions,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
  });

  const subs = await query(
    `SELECT id, endpoint, keys FROM push_subscriptions
     WHERE user_id = $1 OR elder_id = $2`,
    [userId, elderId]
  );

  let sent = 0;
  for (const sub of subs.rows) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: typeof sub.keys === 'string' ? JSON.parse(sub.keys) : sub.keys,
      };

      await webpush.sendNotification(pushSubscription, payload);
      sent++;

      await query(
        `INSERT INTO push_logs (user_id, title, status) VALUES ($1, $2, 'delivered')`,
        [userId, title]
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Expired subscription, remove
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      }
      await query(
        `INSERT INTO push_logs (user_id, title, status, error_message) VALUES ($1, $2, 'failed', $3)`,
        [userId, title, err.message]
      );
    }
  }

  return { success: true, count: sent };
}
