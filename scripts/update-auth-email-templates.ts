import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = {
  confirmation: "Confirm your EdgeBall email address",
  magic_link: "Your EdgeBall sign-in link",
  recovery: "Reset your EdgeBall password",
  invite: "You're invited to EdgeBall",
  email_change: "Confirm your new EdgeBall email",
  reauthentication: "{{ .Token }} is your EdgeBall verification code",
} as const;

function projectRefFromSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? projectRefFromSupabaseUrl();

  if (!accessToken) {
    throw new Error(
      "Missing SUPABASE_ACCESS_TOKEN. Create a temporary token at Supabase Dashboard → Account → Access Tokens and pass it in the shell environment.",
    );
  }
  if (!projectRef) {
    throw new Error(
      "Missing SUPABASE_PROJECT_REF and NEXT_PUBLIC_SUPABASE_URL. Set SUPABASE_PROJECT_REF to the hosted project ref.",
    );
  }

  const payload: Record<string, string> = {};
  for (const [flow, subject] of Object.entries(TEMPLATES)) {
    const filePath = join(process.cwd(), "supabase", "templates", `${flow}.html`);
    payload[`mailer_subjects_${flow}`] = subject;
    payload[`mailer_templates_${flow}_content`] = readFileSync(filePath, "utf8");
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Management API failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  console.log(`Updated ${Object.keys(TEMPLATES).length} auth email templates for project ${projectRef}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
