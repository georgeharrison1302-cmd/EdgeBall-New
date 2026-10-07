export function LensPills<T extends string>({
  options,
  current,
  onChange,
}: {
  options: Array<{ id: T; label: string }>;
  current: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.id === current;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              active
                ? "border-[var(--cobalt)] bg-[var(--cobalt)] text-white"
                : "border-[var(--line)] bg-white text-[var(--ink)]/80"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
