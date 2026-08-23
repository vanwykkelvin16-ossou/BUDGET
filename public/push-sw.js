/**
 * Web Push handlers, merged into the generated service worker via
 * workbox `importScripts`.
 *
 * The weekly nudge is sent WITHOUT a payload — encrypting a payload buys
 * nothing when the copy is generic, and a bare push has far fewer ways to
 * fail. That means the wording lives here, not on the server.
 */

/* eslint-env serviceworker */

var NUDGES = [
  {
    title: 'Your money misses you 🪙',
    body: "It's been a week. Log what you've spent and see today's fun money.",
  },
  {
    title: 'Randy here 👋',
    body: 'A week off the app is a week of guessing. Two taps gets you back on track.',
  },
  {
    title: 'Where did this week go? 📆',
    body: 'Catch the numbers up and keep your streak alive.',
  },
]

self.addEventListener('push', function (event) {
  // No payload by design — rotate the copy so a regular nudge doesn't
  // become wallpaper.
  var pick = NUDGES[new Date().getDay() % NUDGES.length]

  event.waitUntil(
    self.registration.showNotification(pick.title, {
      body: pick.body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'weekly-nudge',
      renotify: true,
      data: { url: './' },
    }),
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || './'

  event.waitUntil(
    (async function () {
      var open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (var i = 0; i < open.length; i++) {
        if ('focus' in open[i]) {
          await open[i].focus()
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
