// Nazar's service worker: shows the notifications a person asked for, and opens the right screen.
self.addEventListener("push", (event) => {
  let msg = { title: "Nazar", body: "", url: "/home" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {}
  event.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, icon: "/icon.svg", badge: "/icon.svg", data: { url: msg.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(url).then((w) => (w || c).focus());
      return self.clients.openWindow(url);
    }),
  );
});
