/**
 * Sink en memoria: sirve para tests y desarrollo local, y documenta el
 * comportamiento que tiene que tener el sink real de la base del CRM.
 *
 * - Idempotente por (source, externalId): un reintento de Meta no duplica nada.
 * - Deduplica contactos por teléfono, email o id del canal: el mismo cliente
 *   que llena el formulario web y después escribe por WhatsApp queda en un
 *   solo lead, con las dos interacciones.
 */
import type { InboundLead, LeadSink, UpsertResult } from "../types.ts";

export interface StoredLead {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  handles: Record<string, string>;
  /** Canal por el que llegó la primera consulta. */
  firstSource: InboundLead["source"];
  interactions: InboundLead[];
  createdAt: string;
  updatedAt: string;
}

export class InMemoryLeadSink implements LeadSink {
  readonly leads = new Map<string, StoredLead>();
  private seen = new Map<string, string>();
  private byKey = new Map<string, string>();
  private nextId = 1;

  async upsert(lead: InboundLead): Promise<UpsertResult> {
    const eventKey = `${lead.source}:${lead.externalId}`;
    const seenId = this.seen.get(eventKey);
    if (seenId) return { leadId: seenId, created: false, duplicate: true };

    const keys = contactKeys(lead);
    const matchId = keys.map((k) => this.byKey.get(k)).find(Boolean);
    let created = false;
    let existing = matchId ? this.leads.get(matchId) : undefined;

    if (!existing) {
      created = true;
      existing = {
        id: `lead_${this.nextId++}`,
        handles: {},
        firstSource: lead.source,
        interactions: [],
        createdAt: lead.receivedAt,
        updatedAt: lead.receivedAt,
      };
      this.leads.set(existing.id, existing);
    }

    existing.name ??= lead.name;
    existing.phone ??= lead.phone;
    existing.email ??= lead.email;
    if (lead.contactHandle) existing.handles[lead.source] = lead.contactHandle;
    existing.interactions.push(lead);
    existing.updatedAt = lead.receivedAt;

    for (const k of keys) this.byKey.set(k, existing.id);
    this.seen.set(eventKey, existing.id);
    return { leadId: existing.id, created, duplicate: false };
  }
}

/** Claves por las que se reconoce al mismo contacto entre canales. */
export function contactKeys(lead: InboundLead): string[] {
  const keys: string[] = [];
  if (lead.phone) keys.push(`phone:${lead.phone}`);
  if (lead.email) keys.push(`email:${lead.email}`);
  if (lead.contactHandle) keys.push(`${lead.source}:${lead.contactHandle}`);
  return keys;
}
