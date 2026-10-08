import "server-only";

export type AlertEmailItem = {
  title: string;
  body: string | null;
  href: string | null;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.edgeball.co.uk";

/** Email delivery is on only when Resend is configured. */
export function alertEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM);
}

/**
 * Send one digest per user listing this run's new alerts. Uses Resend's REST
 * API directly so no SDK dependency is needed. Never throws — delivery
 * failures must not fail the ingest job.
 */
export async function sendAlertDigest(to: string, alerts: AlertEmailItem[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  if (!apiKey || !from || alerts.length === 0) return false;

  const items = alerts
    .map((alert) => {
      const url = alert.href ? `${SITE_URL}${alert.href}` : SITE_URL;
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
        <a href="${url}" style="color:#2563eb;font-weight:700;text-decoration:none;">${escapeHtml(alert.title)}</a>
        ${alert.body ? `<p style="margin:4px 0 0;color:#64748b;font-size:13px;">${escapeHtml(alert.body)}</p>` : ""}
      </td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#eef3f9;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <p style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#2563eb;text-transform:uppercase;">EdgeBall alerts</p>
      <h1 style="margin:6px 0 16px;font-size:20px;color:#0f172a;">${alerts.length} new alert${alerts.length === 1 ? "" : "s"} from your watchlist</h1>
      <table role="presentation" style="width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 16px;border-collapse:collapse;">${items}</table>
      <p style="margin-top:16px;font-size:12px;color:#94a3b8;">
        <a href="${SITE_URL}/watchlist" style="color:#2563eb;">Open your watchlist</a> ·
        18+. Gamble responsibly.
      </p>
    </div></body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `${alerts.length} EdgeBall alert${alerts.length === 1 ? "" : "s"}: ${alerts[0].title}`,
        html,
      }),
    });
    if (!response.ok) {
      console.error(`[alerts email] ${to}: ${response.status} ${(await response.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(`[alerts email] ${to}:`, cause instanceof Error ? cause.message : cause);
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
