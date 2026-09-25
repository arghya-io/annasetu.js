/**
 * Only same-origin, absolute-path redirects are allowed after login.
 * Anything else (protocol-relative "//evil.com", "https://evil.com",
 * backslash tricks, control characters) falls back to the default.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  return candidate;
}
