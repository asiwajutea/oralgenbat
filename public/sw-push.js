// Push notification service worker
// Handles background push events and notification clicks

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: 'New Notification',
      body: event.data.text(),
    };
  }

  const title = payload.title || 'Backend Audit Tool';
  const options = {
    body: payload.message || payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.notification_id || payload.push_notification_id || Date.now().toString(),
    data: {
      url: payload.url || '/',
      notification_id: payload.notification_id,
      push_notification_id: payload.push_notification_id,
    },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';
  const notificationId = event.notification.data?.notification_id;
  const pushNotificationId = event.notification.data?.push_notification_id;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Try to focus existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);

          // Track interaction
          if (pushNotificationId) {
            trackInteraction(pushNotificationId);
          }
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen).then(function() {
          if (pushNotificationId) {
            trackInteraction(pushNotificationId);
          }
        });
      }
    })
  );
});

function trackInteraction(pushNotificationId) {
  // Best-effort tracking - fire and forget
  try {
    fetch(self.location.origin + '/api/track-push-interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ push_notification_id: pushNotificationId }),
    }).catch(function() {});
  } catch (e) {
    // Ignore errors
  }
}
