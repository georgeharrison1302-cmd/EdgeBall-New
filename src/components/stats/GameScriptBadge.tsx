export type GameScript = {
  label: string;
  detail: string;
};

export function GameScriptBadge({ script }: { script: GameScript | null | undefined }) {
  if (!script) return null;
  return (
    <span
      title={script.detail}
      className="inline-flex max-w-full items-center rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800"
    >
      {script.label}
    </span>
  );
}
