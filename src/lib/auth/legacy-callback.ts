// Identity providers configured before better-auth 1.7 redirect to
// /api/auth/oauth2/callback/:id; 1.7 only serves /api/auth/callback/:id.
// The generic OAuth providers keep announcing the old redirect URI (see
// buildAuth) so the URI registered at the identity provider stays valid, and
// the auth route maps incoming callbacks onto the new endpoint.
export const LEGACY_OAUTH2_CALLBACK_PREFIX = "/api/auth/oauth2/callback/"

export async function mapLegacyOAuthCallback(request: Request): Promise<Request> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(LEGACY_OAUTH2_CALLBACK_PREFIX)) return request
  url.pathname = `/api/auth/callback/${url.pathname.slice(LEGACY_OAUTH2_CALLBACK_PREFIX.length)}`
  // form_post callbacks carry a body; buffer it instead of re-streaming.
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()
  return new Request(url, { method: request.method, headers: request.headers, body })
}
