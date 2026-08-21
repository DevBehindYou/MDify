export function EmptyOutput() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-center gap-3 rounded-2xl"
      style={{ border: '1px dashed var(--glass-border)' }}
    >
      <div className="relative">
        <div className="glass-circle w-14 h-14 grid place-items-center text-2xl">
          <span style={{ fontFamily: 'var(--mono)' }}>#</span>
        </div>
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full grid place-items-center text-[10px] t-accent"
          style={{
            background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          }}
        >
          ↓
        </div>
      </div>
      <div>
        <p className="text-sm font-medium t-muted">No output yet</p>
        <p className="text-xs t-faint mt-0.5">Converted Markdown will appear here</p>
      </div>
    </div>
  );
}
