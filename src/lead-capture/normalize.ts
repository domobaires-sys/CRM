/**
 * Normalización de datos de contacto para poder deduplicar entre canales.
 * Un mismo cliente puede llenar el formulario web con "011 15 5555-1234" y
 * después escribir por WhatsApp desde 5491155551234: ambos deben terminar en
 * +5491155551234.
 */

/**
 * Normaliza un teléfono a E.164. Pensado para Argentina (código 54, con el 9
 * de celular que usa WhatsApp). Números de otros países deben venir con "+".
 * Devuelve undefined si no puede interpretarlo.
 */
export function normalizePhone(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const hasPlus = input.trim().startsWith("+") || input.trim().startsWith("00");
  let digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8) return undefined;

  if (digits.startsWith("54")) return normalizeArgentine(digits.slice(2));
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  return normalizeArgentine(digits);
}

/** Recibe un número argentino sin el 54 y devuelve +549 + área + número (10 dígitos). */
function normalizeArgentine(national: string): string | undefined {
  let n = national;
  if (n.startsWith("9") && n.length === 11) n = n.slice(1);
  if (n.startsWith("0")) n = n.slice(1);
  if (n.length === 12) {
    // Quita el "15" de celular que va después del código de área (2 a 4 dígitos).
    for (const areaLen of [2, 3, 4]) {
      if (n.slice(areaLen, areaLen + 2) === "15") {
        n = n.slice(0, areaLen) + n.slice(areaLen + 2);
        break;
      }
    }
  }
  if (n.length !== 10) return undefined;
  return `+549${n}`;
}

export function normalizeEmail(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export function cleanName(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const name = input.replace(/\s+/g, " ").trim();
  return name || undefined;
}
