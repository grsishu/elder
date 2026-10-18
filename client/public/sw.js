// Smriti Saathi Service Worker for Web Push & Offline Support

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification received
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'स्मृति साथी (Smriti Saathi)', body: event.data.text() };
    }
  }

  const title = data.title || 'स्मृति साथी रिमाइंडर';
  const options = {
    body: data.body || 'यह आपके लिए एक ज़रूरी स्मरण है।',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    vibrate: data.vibrate || [200, 100, 200, 100, 200],
    data: data.data || {},
    actions: data.actions || [
      { action: 'done', title: '✓ पूरा हुआ (Done)' },
      { action: 'snooze', title: '⏱ 10 मिनट बाद' },
    ],
    requireInteraction: true,
    tag: data.tag || 'smriti-reminder',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification action button click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const occId = event.notification.data?.occurrenceId;

  if (event.action === 'done' && occId) {
    event.waitUntil(
      fetch(`/api/reminders/${occId}/done`, { credentials: 'include', method: 'POST' })
    );
  } else if (event.action === 'snooze' && occId) {
    event.waitUntil(
      fetch(`/api/reminders/${occId}/snooze`, { credentials: 'include', method: 'POST' })
    );
  } else {
    // Open app
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
      })
    );
  }
});
