// Google redirects here after sign-in. Hand the result to the diary tab (same origin only), then
// wipe it from the address bar and close. The diary checks `state` so nothing else can inject a token.
;(function () {
  var result = location.hash.slice(1) || location.search.slice(1)
  history.replaceState(null, '', location.pathname)
  var msg = document.getElementById('msg')
  if (!result || typeof BroadcastChannel === 'undefined') {
    msg.textContent = 'Something went wrong. Close this window and try again from your diary.'
    return
  }
  var channel = new BroadcastChannel('little-corner-oauth')
  channel.postMessage(result)
  channel.close()
  msg.textContent = 'Connected! You can close this window and go back to your diary.'
  setTimeout(function () {
    window.close()
  }, 400)
})()
