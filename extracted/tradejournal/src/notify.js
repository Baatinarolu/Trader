'use strict';
/**
 * Outbound notifications — the app telling you something happened.
 *
 * No SMTP client and no vendor SDK: every supported channel is a plain HTTPS
 * POST, which is why it costs nothing and works from a free deployment.
 *   telegram  https://api.telegram.org/bot<token>/sendMessage  (body carries chat_id)
 *   discord   https://discord.com/api/webhooks/…              ({"content": …})
 *   slack     https://hooks.slack.com/services/…              ({"text": …})
 *   webhook   your URL, receives {"event":…, "text":…, "data":…}
 *
 * Everything is best-effort: a failed notification is recorded, never thrown,
 * because an alert must not break the trade path.
 */

const FORMAT = { telegram: 'telegram', discord: 'discord', slack: 'slack', webhook: 'webhook' };

function shape(kind, text, payload) {
  switch (FORMAT[kind]) {
    case 'discord': return { body: { content: text }, parse: 'json' };
    case 'slack': return { body: { text }, parse: 'json' };
    case 'telegram': return { body: { chat_id: payload && payload.chat_id, text, parse_mode: 'HTML' }, parse: 'json' };
    default: return { body: { event: payload && payload.event, text, data: payload && payload.data }, parse: 'json' };
  }
}

/** Send one message to one channel. Returns a result object; never throws. */
async function sendOne(channel, event, text, data) {
  const started = Date.now();
  try {
    if (!channel || !channel.enabled) return { ok: false, skipped: true, reason: 'channel disabled' };
    if (!/^https:\/\//i.test(String(channel.url || ''))) return { ok: false, reason: 'channel url must be https' };
    const shaped = shape(channel.kind, text, { event, data, chat_id: channel.chat_id });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(channel.url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(shaped.body), signal: ctl.signal,
    });
    clearTimeout(timer);
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, ms: Date.now() - started, body: String(body).slice(0, 160) };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - started };
  }
}

module.exports = { FORMAT, shape, sendOne };
