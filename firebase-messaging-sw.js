// Service worker: receives push messages while the app is closed / in background.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCHMYRJ42snU4pF-7w66QroXF9tG_4PcsE",
  authDomain: "nbc-property-removal.firebaseapp.com",
  projectId: "nbc-property-removal",
  storageBucket: "nbc-property-removal.firebasestorage.app",
  messagingSenderId: "522200636163",
  appId: "1:522200636163:web:7f787f46af7770db56e736"
});

const messaging = firebase.messaging();

// Messages are sent data-only (title/body/link in `data`) so we always show them ourselves.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || "NBC Property Removal", {
    body: d.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || undefined,
    data: { link: d.link || "./" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "./";
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); return; } }
    if (clients.openWindow) await clients.openWindow(link);
  })());
});
