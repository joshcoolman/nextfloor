/**
 * Whether a request came from the machine running the app.
 *
 * Destructive actions are local-only. The check is on the Host header rather
 * than a client-side flag, so hiding the UI is not the thing standing between a
 * visitor and someone else's building.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

export function isLocalRequest(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local");
}
