type RankRowProps = {
  rank: number;
  name: string;
  meta: string;
  photo: string | null;
  value: number;
  max: number;
};

export default function RankRow({ rank, name, meta, photo, value, max }: RankRowProps) {
  const width = max > 0 ? Math.max(8, Math.round((Math.max(0, value) / max) * 100)) : 0;
  return (
    <li>
      <div className="flex items-center gap-3">
        <span className="w-4 text-sm text-gray-500">{rank}</span>
        {photo ? (
          <img src={photo} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
            {name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-900">{name}</p>
            <p className="text-sm font-semibold text-blue-600">{value}</p>
          </div>
          <p className="truncate text-xs text-gray-500">{meta}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${width}%` }} />
          </div>
        </div>
      </div>
    </li>
  );
}
