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

  proto.send = function patchedSend(
    this: XMLHttpRequest,
    body?: Document | string | FormData | Blob | ArrayBufferView | ArrayBuffer | null,
  ) {
    const userOnLoad = this.onload;
    if (typeof userOnLoad === 'function') {
      this.onload = (ev: ProgressEvent) => {
        if (this.status === 0) {
          const onError = this.onerror;
          if (typeof onError === 'function') {
            onError.call(this, ev);
            return;
          }
        }
        userOnLoad.call(this, ev);
      };
    }
    return originalSend.call(this, body as never);
  };
}
