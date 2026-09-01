/**
 * LECHAIM Admin — extra print path for phones.
 * If 127.0.0.1:3001 is reachable, the existing local sendTicket is left untouched.
 * Only when localhost is unavailable does this call setSendTicket (Supabase print_jobs).
 */
(function (global) {
  'use strict';

  const PROBE_MS = 500;
  const TABLE = 'print_jobs';

  function printServiceUrl() {
    return global.LechaimPrintEngine?.PRINT_SERVICE_URL || 'http://127.0.0.1:3001/print';
  }

  function printServiceOrigin() {
    return printServiceUrl().replace(/\/print\/?$/, '');
  }

  function getClient() {
    return global.LechaimInventory?.getClient?.()
      || global.LechaimSupabaseOrders?.getClient?.()
      || null;
  }

  async function probeLocalPrintService() {
    const ctrl = new AbortController();
    const t = global.setTimeout(() => ctrl.abort(), PROBE_MS);
    try {
      const res = await fetch(`${printServiceOrigin()}/`, {
        method: 'GET',
        signal: ctrl.signal,
        cache: 'no-store',
      });
      return res.ok;
    } catch (_) {
      return false;
    } finally {
      global.clearTimeout(t);
    }
  }

  async function sendTicketToLocalService(ticket, channel) {
    const printer = channel === 'bar' ? 'bar' : 'kitchen';
    let response;
    try {
      response = await fetch(printServiceUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printer,
          ticket: String(ticket),
        }),
      });
    } catch (err) {
      console.error('[admin-print-cloud] local print service unavailable', err);
      return false;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      console.error('[admin-print-cloud] invalid local print response', err);
      return false;
    }

    return response.ok && data?.success === true;
  }

  async function sendTicketToCloud(ticket, channel) {
    const sb = getClient();
    if (!sb) {
      console.error('[admin-print-cloud] Supabase client missing');
      return false;
    }

    const { data: authData, error: authErr } = await sb.auth.getSession();
    if (authErr || !authData?.session?.user?.id) {
      console.error('[admin-print-cloud] admin session required for cloud print');
      return false;
    }

    const printer = channel === 'bar' ? 'bar' : 'kitchen';
    const { error } = await sb.from(TABLE).insert({
      user_id: authData.session.user.id,
      printer,
      ticket: String(ticket),
      status: 'pending',
      source: 'phone',
    });

    if (error) {
      console.error('[admin-print-cloud] print_jobs insert failed', error);
      return false;
    }
    return true;
  }

  async function sendTicketRouted(ticket, channel) {
    if (await probeLocalPrintService()) {
      return sendTicketToLocalService(ticket, channel);
    }
    return sendTicketToCloud(ticket, channel);
  }

  async function init() {
    const engine = global.LechaimPrintEngine;
    if (!engine || typeof engine.setSendTicket !== 'function') return;

    const local = await probeLocalPrintService();
    if (local) {
      console.log('[admin-print-cloud] local print service available — using 127.0.0.1:3001');
      return;
    }

    engine.setSendTicket(sendTicketRouted);
    console.log('[admin-print-cloud] local print service unavailable — cloud print_jobs enabled');
  }

  init();
})(window);
