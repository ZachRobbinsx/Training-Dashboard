// Single-password gate. The cookie holds a hash of (password + secret), never the password.
export async function authToken(): Promise<string | null> {
  const pw = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!pw || !secret) return null; // not configured -> nobody gets in
  const data = new TextEncoder().encode(`${pw}::${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
