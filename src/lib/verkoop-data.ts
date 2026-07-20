// Datalaag verkoop (Eindsprint Blok L). Online-only, zelfde patroon als
// kelder-data.ts: leveren loopt UITSLUITEND via het atomische server-endpoint
// (order-leveren in voorraad.pb.js) — de voorraadmutatie blijft de enige bron
// van waarheid, de order is administratie eromheen.

import type { RecordModel } from "pocketbase";
import type { Klant, Order, OrderRegel, OrderStatus } from "./types";
import { ensureOnline, getPb, haalLijst } from "./data";
import { logAudit } from "./audit";

const GEEN_VERBINDING = "Geen verbinding — verkoopacties vereisen de server.";

async function pbOfFout() {
  const pb = getPb();
  if (!pb || !(await ensureOnline())) throw new Error(GEEN_VERBINDING);
  return pb;
}

// ============= Klanten =============
function klantFromPb(r: RecordModel): Klant {
  return {
    id: r.id,
    naam: r["naam"],
    type: r["type"] || null,
    contact: r["contact"] ?? "",
    notities: r["notities"] ?? "",
    created: r["created"],
  };
}

export async function fetchKlanten(): Promise<Klant[]> {
  return haalLijst("klanten", [], async (pb) => {
    const records = await pb.collection("klanten").getFullList({ sort: "naam" });
    return records.map(klantFromPb);
  });
}

export async function createKlant(input: Omit<Klant, "id">): Promise<Klant> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "klanten", input.naam);
  const r = await pb.collection("klanten").create({ ...input });
  return klantFromPb(r);
}

export async function verwijderKlant(id: string, naam: string): Promise<void> {
  const pb = await pbOfFout();
  logAudit("verwijderd", "klanten", naam);
  await pb.collection("klanten").delete(id);
}

// Fase 7 Blok A (AVG): klanten zonder enige order, ouder dan de ingestelde
// bewaartermijn. Alleen een voorstel-lijst — verwijderen blijft handmatig.
export function verweesdeKlanten(
  klanten: Klant[],
  orders: Order[],
  bewaartermijnMaanden: number,
): Klant[] {
  const metOrder = new Set(orders.map((o) => o.klant));
  const grens = new Date();
  grens.setMonth(grens.getMonth() - bewaartermijnMaanden);
  return klanten.filter((k) => {
    if (metOrder.has(k.id)) return false;
    const aangemaakt = k.created ? new Date(k.created.replace(" ", "T")) : null;
    return aangemaakt !== null && !isNaN(aangemaakt.getTime()) && aangemaakt < grens;
  });
}

// ============= Orders =============
function orderFromPb(r: RecordModel): Order {
  return {
    id: r.id,
    klant: r["klant"],
    datum: r["datum"],
    regels: Array.isArray(r["regels"]) ? (r["regels"] as OrderRegel[]) : [],
    status: r["status"],
    notities: r["notities"] ?? "",
    ingevoerd_door: r["ingevoerd_door"] ?? "",
    created: r["created"],
  };
}

export async function fetchOrders(): Promise<Order[]> {
  return haalLijst("orders", [], async (pb) => {
    const records = await pb.collection("orders").getFullList({ sort: "-datum,-created" });
    return records.map(orderFromPb);
  });
}

export interface OrderInput {
  klant: string;
  datum: string;
  regels: OrderRegel[];
  notities?: string;
  ingevoerd_door?: string;
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const pb = await pbOfFout();
  logAudit("aangemaakt", "orders", `${input.regels.length} regel(s) · ${input.datum}`);
  const r = await pb.collection("orders").create({ ...input, status: "concept" });
  return orderFromPb(r);
}

// Alleen concept-orders zijn nog vrij bewerkbaar; geleverd/betaald niet
// (de levering heeft dan al voorraadmutaties gegenereerd).
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "orders", `status -> ${status}`);
  await pb.collection("orders").update(id, { status });
}

export async function verwijderConceptOrder(id: string): Promise<void> {
  const pb = await pbOfFout();
  logAudit("verwijderd", "orders", id);
  await pb.collection("orders").delete(id);
}

export async function leverOrder(
  orderId: string,
  verantwoordelijke: string,
): Promise<{ ok: boolean; geleverd: { voorraad: string; aantal_huidig: number }[] }> {
  const pb = await pbOfFout();
  logAudit("gewijzigd", "orders", `geleverd: ${orderId}`);
  return await pb.send("/api/tappenmars/order-leveren", {
    method: "POST",
    body: { order_id: orderId, verantwoordelijke },
  });
}

// ============= Verkoopoverzicht =============
export interface OmzetRegel {
  sleutel: string; // wijnnaam of klanttype
  flessen: number;
  omzet: number;
}

export function omzetPerSleutel(
  orders: Order[],
  sleutelVanRegel: (order: Order, regel: OrderRegel) => string,
): OmzetRegel[] {
  const m = new Map<string, { flessen: number; omzet: number }>();
  for (const order of orders) {
    if (order.status === "concept") continue; // alleen geleverd/betaald telt
    for (const regel of order.regels) {
      const sleutel = sleutelVanRegel(order, regel);
      const acc = m.get(sleutel) ?? { flessen: 0, omzet: 0 };
      acc.flessen += regel.aantal;
      acc.omzet += regel.aantal * (regel.prijs || 0);
      m.set(sleutel, acc);
    }
  }
  return Array.from(m.entries())
    .map(([sleutel, v]) => ({ sleutel, ...v }))
    .sort((a, b) => b.omzet - a.omzet);
}
