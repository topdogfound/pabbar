/**
 * Where to go after sign-in. Only same-site paths into the invite and admin
 * areas are honoured, so `?next=` can never become an open redirect.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\/(invite|admin)(\/[A-Za-z0-9_\-./]*)?$/.test(value) && !value.includes("..") ? value : null;
}
