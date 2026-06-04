// Demo-visit tracking, injected into every published page at deploy time.
// Answers one question per prospect: "did they open their demo?"
//
// Config-driven from config.operator.json — no tracking block, no injection
// (the platform stays ready; activating it is a one-line config change):
//
//   "tracking": { "provider": "goatcounter", "goatcounter": { "code": "quartier" } }
//     → GoatCounter (free, no cookies, GDPR-friendly — no consent banner
//       needed). Counts per path, so /webs/<slug>/... gives per-prospect
//       visits out of the box. Stats UI + API at https://<code>.goatcounter.com
//
//   "tracking": { "provider": "beacon", "endpoint": "https://..." }
//     → POSTs { slug, path, referrer, t } to your own endpoint via
//       navigator.sendBeacon (fire-and-forget, survives page unload).
//       No cookies, no PII collected on the page.

function trackingSnippet(config, slug) {
  const tracking = config.tracking || {};
  if (tracking.provider === 'goatcounter' && tracking.goatcounter && tracking.goatcounter.code) {
    const code = String(tracking.goatcounter.code).replace(/[^a-zA-Z0-9-]/g, '');
    if (!code) return '';
    return `<script data-goatcounter="https://${code}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`;
  }
  if (tracking.provider === 'beacon' && tracking.endpoint) {
    // <-escape so a literal "</script>" in config can never terminate
    // the inline script tag (identical string at runtime, inert in HTML).
    const jsString = (v) => JSON.stringify(String(v)).replace(/</g, '\\u003c');
    const endpoint = jsString(tracking.endpoint);
    const slugJson = jsString(slug);
    return `<script>
(function(){try{
  var payload=JSON.stringify({slug:${slugJson},path:location.pathname,referrer:document.referrer||null,t:new Date().toISOString()});
  if(navigator.sendBeacon){navigator.sendBeacon(${endpoint},new Blob([payload],{type:'application/json'}));}
  else{fetch(${endpoint},{method:'POST',body:payload,keepalive:true}).catch(function(){});}
}catch(e){}})();
</script>`;
  }
  return '';
}

// Insert the snippet right before </body> (fallback: append). Idempotent on
// re-publish because publish.js always rewrites the slug dir from source.
function injectTracking(html, snippet) {
  if (!snippet) return html;
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + '\n' + snippet + '\n';
  return html.slice(0, idx) + snippet + '\n' + html.slice(idx);
}

module.exports = { trackingSnippet, injectTracking };
