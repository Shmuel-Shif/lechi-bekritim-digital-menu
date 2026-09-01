/**
 * LECHAIM — Send Web Push to every active admin device.
 * Invoked by DB trigger (pg_net). Secret must match admin_push_config.webhook_secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function buildMessage(payload: Record<string, unknown>) {
  const type = String(payload.type || "");
  const tableNumber = asInt(payload.tableNumber ?? payload.table);
  const orderType = String(payload.orderType || "");
  const fulfillment = String(payload.fulfillmentType || payload.fulfillment_type || "").toLowerCase();
  const alertType = String(payload.alertType || payload.alert_type || "");
  const productName = String(payload.productName || payload.product_name || "").trim();
  const quantity = asInt(payload.quantity) || 1;
  const customerName = String(payload.customerName || payload.customer_name || "").trim();
  const partySize = asInt(payload.partySize ?? payload.party_size);
  const reservationDate = String(payload.reservationDate || payload.reservation_date || "").trim();
  const arrivalTime = String(payload.arrivalTime || payload.arrival_time || "").slice(0, 5);
  const sessionId = payload.sessionId ? String(payload.sessionId) : "";
  const orderId = payload.orderId ? String(payload.orderId) : "";

  let tab = "tables";
  let body = "יש עדכון באדמין";

  if (type === "waiter_call") {
    body = tableNumber ? `שולחן ${tableNumber} קורא למלצר` : "שולחן קורא למלצר";
    tab = "tables";
  } else if (type === "bill_request") {
    body = tableNumber ? `שולחן ${tableNumber} ביקש חשבון` : "שולחן ביקש חשבון";
    tab = "tables";
  } else if (type === "new_order") {
    if (orderType === "dine_in" || orderType === "dine-in") {
      body = tableNumber ? `שולחן ${tableNumber} — הזמנה חדשה` : "הזמנה חדשה";
      tab = "tables";
    } else if (orderType === "butcher") {
      body = "חנות בשר — הזמנה חדשה";
      tab = "butcher";
    } else if (orderType === "shabbat") {
      body = "הזמנת שבת חדשה";
      tab = "shabbat";
    } else if (fulfillment === "delivery") {
      body = "משלוח — הזמנה חדשה";
      tab = "delivery";
    } else {
      body = "איסוף עצמי — הזמנה חדשה";
      tab = "pickup";
    }
  } else if (type === "table_opened") {
    body = tableNumber ? `שולחן ${tableNumber} נפתח` : "שולחן נפתח";
    tab = "tables";
  } else if (type === "dish_ready") {
    const qtyBit = quantity > 1 ? ` ×${quantity}` : "";
    const name = productName || "מנה";
    body = tableNumber
      ? `שולחן ${tableNumber} — ${name}${qtyBit} מוכן`
      : `${name}${qtyBit} מוכן`;
    tab = "kitchen";
  } else if (type === "kitchen_all_ready") {
    body = tableNumber
      ? `שולחן ${tableNumber} — כל ההזמנה מוכנה`
      : "כל ההזמנה מוכנה";
    tab = "kitchen";
  } else if (type === "kitchen_alert") {
    tab = "kitchen";
    if (alertType === "fire") body = "המטבח צריך אש";
    else if (alertType === "gas") body = "המטבח צריך גז";
    else if (alertType === "close_kitchen") body = "המטבח מבקש לסגור";
    else if (alertType === "out_of_stock") {
      body = productName ? `נגמר במלאי: ${productName}` : "נגמר במלאי";
    } else if (alertType === "fault") {
      const extra = [productName, String(payload.message || "").trim()].filter(Boolean).join(" · ");
      body = extra ? `תקלה במטבח: ${extra}` : "תקלה במטבח";
    } else {
      body = String(payload.message || "").trim() || "קריאה מהמטבח";
    }
  } else if (type === "reservation_pending") {
    const who = customerName || "לקוח";
    const seats = partySize ? `${partySize} סועדים` : "";
    const when = [reservationDate, arrivalTime].filter(Boolean).join(" ");
    body = ["הזמנת מקום חדשה", who, seats, when].filter(Boolean).join(" · ");
    tab = "reservations";
  }

  const params = new URLSearchParams({ tab, type });
  if (tableNumber) params.set("table", String(tableNumber));
  if (orderId) params.set("order", orderId);
  if (sessionId) params.set("session", sessionId);

  return {
    title: "לחיים אדמין",
    body,
    tag: `lechaim-${type}-${payload.alertId || payload.reservationId || productName || tableNumber || sessionId || orderId || "x"}`,
    tab,
    table: tableNumber,
    sessionId,
    orderId,
    type,
    url: `./admin.html?${params.toString()}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const expected = String(Deno.env.get("PUSH_WEBHOOK_SECRET") || "").trim();
  const got = String(req.headers.get("x-webhook-secret") || "").trim();
  if (!expected || got !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_) {
    return json({ error: "invalid_body" }, 400);
  }

  const type = String(payload.type || "");
  if (!type || ![
    "waiter_call",
    "bill_request",
    "new_order",
    "table_opened",
    "dish_ready",
    "kitchen_all_ready",
    "kitchen_alert",
    "reservation_pending",
  ].includes(type)) {
    return json({ error: "unknown_type", skipped: true });
  }

  const publicKey = String(Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();
  const privateKey = String(Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
  const subject = String(Deno.env.get("VAPID_SUBJECT") || "mailto:hello@lechaimgr.com").trim();
  if (!publicKey || !privateKey) {
    return json({ error: "missing_vapid" }, 500);
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "missing_supabase" }, 500);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await sb
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("active", true);

  if (error) {
    return json({ error: error.message }, 500);
  }

  const message = buildMessage(payload);
  const list = Array.isArray(rows) ? rows : [];
  let sent = 0;
  const gone: string[] = [];

  for (const row of list) {
    try {
      await webpush.sendNotification(
        {
          endpoint: String(row.endpoint),
          keys: {
            p256dh: String(row.p256dh),
            auth: String(row.auth),
          },
        },
        JSON.stringify(message),
        { TTL: 3600, urgency: "high" },
      );
      sent += 1;
    } catch (err) {
      const statusCode = Number((err as { statusCode?: number })?.statusCode) || 0;
      if (statusCode === 404 || statusCode === 410) {
        gone.push(String(row.id));
      } else {
        console.error("[send-admin-push] send failed", err);
      }
    }
  }

  if (gone.length) {
    await sb.from("admin_push_subscriptions").delete().in("id", gone);
  }

  return json({ ok: true, sent, pruned: gone.length });
});
