// Thin fetch wrappers + toast helper. Global `api` and `toast`.

const api = {
  async req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.code = data.code;
      err.hint = data.hint;
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get: (url) => api.req('GET', url),
  post: (url, body) => api.req('POST', url, body || {}),
  patch: (url, body) => api.req('PATCH', url, body),
  del: (url, body) => api.req('DELETE', url, body || {}),
};

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
