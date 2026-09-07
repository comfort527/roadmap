// Shared request handling: deadlines include the response body, and cancellation never retries.
const WeatherRequests = (() => {
  function abortError() { return new DOMException('查詢已取消', 'AbortError'); }
  function check(signal) { if (signal?.aborted) throw abortError(); }
  function wait(ms, signal) {
    check(signal);
    return new Promise((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(abortError()); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  async function json(url, { signal, attempts = 2, timeoutMs = 20000 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      check(signal);
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      let timedOut = false, failure;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        let body;
        try { body = await response.json(); }
        catch (err) { if (controller.signal.aborted || response.ok) throw err; body = {}; }
        check(signal);
        if (!response.ok || body?.error) {
          const error = new Error(body?.reason || `天氣服務回應 ${response.status}`);
          error.status = response.status;
          const after = response.headers?.get('Retry-After');
          error.retryAfter = after ? Math.max(0, Number.isFinite(Number(after)) ? Number(after) * 1000 : Date.parse(after) - Date.now()) : 0;
          throw error;
        }
        return body;
      } catch (error) {
        check(signal);
        failure = timedOut ? new Error('天氣服務回應逾時，請稍後重試。') : error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
      const retryable = !failure.status || failure.status === 429 || failure.status >= 500;
      if (!retryable || attempt + 1 === attempts || failure.retryAfter > 30000) throw failure;
      await wait(Math.max(1000 * 2 ** attempt, failure.retryAfter || 0), signal);
    }
  }
  return { json, check, abortError };
})();
