/*
 * Installable app and offline support: registers the service worker (../sw.js),
 * offers a refresh when a new version is ready, and shows trip alerts as device
 * notifications (when allowed). Server-sent push needs VAPID keys on the server;
 * App.deviceNotify is the place to plug it in.
 */
window.App = window.App || {};
(() => {
  App.deviceNotify = async (text, link = '') => {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: text, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', data: { link }, tag: 'vanyatra' };
      if (reg) reg.showNotification('VanYatra', opts); else new Notification('VanYatra', opts);
    } catch (e) { /* not supported here */ }
  };
  App.enableDeviceAlerts = async () => {
    if (!('Notification' in window)) throw new Error('This browser can’t show notifications.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings.');
    return true;
  };

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const offerRefresh = (worker) => {
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar'; bar.className = 'consent-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<p class="small">A new version of VanYatra is ready.</p><div class="row gap"><button type="button" class="btn btn-sm btn-primary">Refresh</button></div>';
    bar.querySelector('button').onclick = () => { worker.postMessage('skipWaiting'); };
    document.body.append(bar);
  };
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing && document.getElementById('update-bar')) { refreshing = true; location.reload(); } });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) offerRefresh(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerRefresh(w); });
      });
    }).catch(() => { /* service workers unavailable (private mode etc.) */ });
  });
})();
