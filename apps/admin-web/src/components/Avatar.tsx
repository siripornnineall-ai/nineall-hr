export function Avatar({ url, size = 32 }: { url: string | null | undefined; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: size * 0.6 }}>
          person
        </span>
      )}
    </span>
  );
}
