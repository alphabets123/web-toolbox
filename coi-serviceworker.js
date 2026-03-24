/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzuidhof/coi-serviceworker */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', (event) => {
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
      return;
    }

    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.status === 0) {
          return response;
        }

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
    );
  });
} else {
  // If we're in the window context, register the service worker.
  (() => {
    const script = document.currentScript;
    const reloader = () => {
      if (window.sessionStorage.getItem('coi-reload')) {
        window.sessionStorage.removeItem('coi-reload');
        // If we still don't have the headers, something is wrong.
        // But we try to avoid infinite reload.
      } else {
        window.sessionStorage.setItem('coi-reload', '1');
        window.location.reload();
      }
    };

    if (window.crossOriginIsolated !== undefined && !window.crossOriginIsolated) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(script.src).then((registration) => {
          registration.addEventListener('updatefound', () => {
            reloader();
          });
          if (registration.active) {
            reloader();
          }
        });
      }
    }
  })();
}
