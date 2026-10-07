// Trademark: Edge is black, Ball is blue. Never recolor.

export default function BrandMark({
  className = "text-lg font-bold tracking-tight",
}: {
  className?: string;
}) {
  return (
    <span className={`text-slate-900 ${className}`}>
      Edge<span className="text-blue-600">Ball</span>
    </span>
  );
}
