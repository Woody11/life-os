// Vertical stack used next to the review/edit form so the source photos stay
// visible while transcribing corrections — a horizontal PhotoStrip would
// scroll out of view once the form grows taller than the viewport.
export default function PhotoRail({ photos }) {
  if (!photos?.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto md:w-40 md:shrink-0 md:flex-col md:overflow-visible">
      {photos.map((p) => (
        <img
          key={p.id}
          src={p.url}
          alt={p.original_name || 'recipe photo'}
          className="h-40 w-40 shrink-0 rounded-xl border border-white/10 object-cover md:h-auto md:w-full"
        />
      ))}
    </div>
  );
}
