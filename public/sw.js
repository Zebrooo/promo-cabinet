// Service worker промо-кабинета: только Web Push. Ничего не кэширует и не
// перехватывает fetch — кабинет остаётся обычным серверным приложением.
// Payload шлёт promo-bff (admin-notifier.ts): { title, body, url, tag }.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || 'Промо-кабинет';
  const url = data.url || '/cabinet/campaigns';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url },
    // Один и тот же tag (campaign-<id>) — повторное уведомление заменяет
    // предыдущее, а не плодит копии.
    ...(data.tag ? { tag: data.tag, renotify: true } : {}),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/cabinet/campaigns';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
