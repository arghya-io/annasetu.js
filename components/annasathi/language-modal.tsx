'use client';

import { ANNASATHI_LANGUAGES, type AnnaSathiLanguage } from '@/lib/annasathi/languages';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LanguageModal({
  open,
  current,
  onSelect,
  onClose,
}: {
  open: boolean;
  current: AnnaSathiLanguage;
  onSelect: (lang: AnnaSathiLanguage) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choose language"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md rounded-2xl p-5"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
          <div>
            <h3 className="font-heading text-base font-semibold">Choose your language</h3>
            <p className="text-xs text-muted-foreground">More languages will be added as voice support expands.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {ANNASATHI_LANGUAGES.map((lang) => {
            const active = lang.code === current.code;
            return (
              <button
                key={lang.code}
                onClick={() => onSelect(lang)}
                className={cn(
                  'flex items-center justify-between rounded-xl border p-3 text-left transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-secondary',
                )}
              >
                <span>
                  <span className="block text-sm font-semibold">{lang.nativeName}</span>
                  <span className="block text-[11px] text-muted-foreground">{lang.englishName}</span>
                </span>
                {active && <span className="text-xs font-medium text-primary">Selected</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
          <p className="text-xs text-muted-foreground">Prototype — voice replies are not live in every language yet.</p>
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
