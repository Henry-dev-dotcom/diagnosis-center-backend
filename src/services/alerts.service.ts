import { env } from '../config/env.js';

/*
  Phase 7: operational alerts. When ALERT_WEBHOOK_URL is set (a Slack, Teams
  or similar incoming-webhook URL), serious problems are posted there as
  { text }: unhandled server errors and billing-cycle failures. The same
  alert is sent at most once every ALERT_REPEAT_MINUTES, so an outage does
  not flood the channel. Alerts never contain patient data: only the kind of
  problem, the route and a short error message.
*/

const lastSent = new Map<string, number>();
const REPEAT_MS = 15 * 60_000;

export async function sendAlert(kind: string, message: string, fields: Record<string, string | number | undefined> = {}) {
  const url = env.ALERT_WEBHOOK_URL;
  if (!url || env.NODE_ENV === 'test') return false;
  const key = `${kind}:${message}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - REPEAT_MS) return false;
  lastSent.set(key, now);
  const detail = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join(' · ');
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `[LHIMS ${env.NODE_ENV}] ${kind}: ${message.slice(0, 300)}${detail ? `\n${detail}` : ''}` }),
      signal: AbortSignal.timeout(5000)
    });
    return true;
  } catch (error) {
    console.error('Alert could not be sent:', error instanceof Error ? error.message : error);
    return false;
  }
}
