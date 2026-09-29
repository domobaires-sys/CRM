/**
 * Verificación de la firma X-Hub-Signature-256 que Meta agrega a cada webhook
 * (HMAC-SHA256 del cuerpo crudo con el App Secret). Usa Web Crypto para
 * funcionar igual en Node, Vercel, Cloudflare o Supabase Edge Functions.
 */
export async function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = header.slice("sha256=".length).toLowerCase();

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  const actual = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");

  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
