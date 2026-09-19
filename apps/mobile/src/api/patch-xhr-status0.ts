/**
 * Android XHR can fire `onload` with HTTP status 0 on connection failure.
 * whatwg-fetch then runs `new Response(body, { status: 0 })` inside setTimeout,
 * which throws RangeError (uncaught) instead of rejecting the fetch promise.
 * Reroute status-0 loads to `onerror` so fetch rejects with TypeError as expected.
 */
export function patchXhrStatusZero(): void {
  if (typeof XMLHttpRequest === 'undefined') return;

  const proto = XMLHttpRequest.prototype;
  const originalSend = proto.send;

  proto.send = function patchedSend(body?: Document | string | FormData | Blob | ArrayBufferView | ArrayBuffer | null) {
    const xhr = this;
    const userOnLoad = xhr.onload;
    if (typeof userOnLoad === 'function') {
      xhr.onload = function onLoadStatusZeroGuard(ev: ProgressEvent) {
        if (xhr.status === 0) {
          const onError = xhr.onerror;
          if (typeof onError === 'function') {
            onError.call(xhr, ev);
            return;
          }
        }
        userOnLoad.call(xhr, ev);
      };
    }
    return originalSend.call(xhr, body as never);
  };
}
