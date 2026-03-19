export function openOAuthPopup(url, expectedKind) {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, 'aio-oauth', 'width=640,height=760');
    if (!popup) {
      reject(new Error('Popup was blocked. Allow popups for AIO CRM and try again.'));
      return;
    }

    let finished = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closePoll);
      window.clearTimeout(timeoutId);
    };

    const settle = (fn, value) => {
      if (finished) return;
      finished = true;
      cleanup();
      fn(value);
    };

    const onMessage = (event) => {
      const payload = event?.data;
      if (!payload || payload.type !== 'aio-oauth') return;
      if (expectedKind && payload.kind && payload.kind !== expectedKind) return;
      if (payload.status === 'success') {
        settle(resolve, payload);
        return;
      }
      settle(reject, new Error(payload.message || 'OAuth connection failed.'));
    };

    const closePoll = window.setInterval(() => {
      if (popup.closed) {
        settle(reject, new Error('OAuth window was closed before the connection finished.'));
      }
    }, 500);

    const timeoutId = window.setTimeout(() => {
      try {
        popup.close();
      } catch {}
      settle(reject, new Error('OAuth connection timed out.'));
    }, 180000);

    window.addEventListener('message', onMessage);
    popup.focus();
  });
}
