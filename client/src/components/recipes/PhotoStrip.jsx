export default function PhotoStrip({ photos }) {
  if (!photos?.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {photos.map((p) => (
        <img key={p.id} src={p.url} alt={p.original_name || 'recipe photo'} className="h-40 w-40 shrink-0 rounded-xl border border-white/10 object-cover" />
      ))}
    </div>
  );
}
