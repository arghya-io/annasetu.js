export interface SuggestedAction {
  key: string;
  icon: string;
  label: string;
}

export const SUGGESTED_ACTIONS: SuggestedAction[] = [
  { key: 'book', icon: '🌾', label: 'Book procurement' },
  { key: 'booking', icon: '📋', label: 'Check my booking' },
  { key: 'token', icon: '⏱️', label: 'Check token & ETA' },
  { key: 'centre', icon: '📍', label: 'Find a procurement centre' },
  { key: 'howitworks', icon: 'ℹ️', label: 'How does AnnaSetu work?' },
];

export function SuggestedChips({ onPick, disabled }: { onPick: (action: SuggestedAction) => void; disabled?: boolean }) {
  return (
    <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible">
      {SUGGESTED_ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          disabled={disabled}
          onClick={() => onPick(action)}
          className="flex flex-shrink-0 snap-start items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-soft transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        >
          <span aria-hidden>{action.icon}</span> {action.label}
        </button>
      ))}
    </div>
  );
}
