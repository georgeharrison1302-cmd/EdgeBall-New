/**
 * Section-level empty state that states what is missing and which store/source.
 * Pattern: `{human reason} ({source}).`
 * Use for betting chrome and section empties — not every cell dash.
 */
export function EmptyReason({
  title,
  detail,
  source,
  variant = "inline",
  className = "",
}: {
  title?: string;
  detail: string;
  source?: string;
  variant?: "inline" | "panel" | "center";
  className?: string;
}) {
  const body = formatEmptyReason(detail, source);

  if (variant === "panel" || variant === "center") {
    return (
      <div
        className={`rounded-2xl border border-dashed border-[#e2e8f0] bg-slate-50 px-4 py-6 text-[#64748b] ${
          variant === "center" ? "text-center" : ""
        } ${className}`.trim()}
      >
        {title ? <p className="text-sm font-medium text-[#0f172a]">{title}</p> : null}
        <p className={`text-sm ${title ? "mt-1" : ""}`.trim()}>{body}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {title ? <p className="text-sm font-medium text-[#0f172a]">{title}</p> : null}
      <p className={`text-sm text-[#64748b] ${title ? "mt-1" : ""}`.trim()}>{body}</p>
    </div>
  );
}

/** Format `{detail} ({source}).` without double punctuation. */
export function formatEmptyReason(detail: string, source?: string): string {
  const trimmed = detail.trim().replace(/\.+$/, "");
  if (!source) return `${trimmed}.`;
  return `${trimmed} (${source}).`;
}
