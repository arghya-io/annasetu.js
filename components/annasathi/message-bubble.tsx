import { AnnaSathiAvatar } from './annasathi-avatar';
import { cn } from '@/lib/utils';
import type { AnnaSathiCard } from './cards';
import { AnnaSathiCardView } from './cards';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  /** Set on a user message that was produced by the (simulated) voice pipeline. */
  viaVoice?: boolean;
  /** Assistant messages can carry one contextual card, same as a real tool result would. */
  card?: AnnaSathiCard;
  /** Set when nothing matched — rendered as the "didn't understand" state instead of a normal reply. */
  error?: boolean;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground shadow-soft sm:max-w-md">
          <p className="text-sm leading-relaxed">{message.text}</p>
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-primary-foreground/70">
            <span>{formatClock(message.createdAt)}</span>
            {message.viaVoice && <span>· voice</span>}
          </div>
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex items-start gap-3">
        <AnnaSathiAvatar size={30} className="mt-0.5" />
        <div className="max-w-md rounded-2xl rounded-tl-sm border border-accent/30 bg-accent/5 p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
            <span aria-hidden>⚠</span> Voice clarity
          </p>
          <p className="mt-1 text-sm text-foreground">{message.text}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: speak clearly near the microphone, or tap one of the suggestions below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <AnnaSathiAvatar size={30} className="mt-0.5" />
      <div className="flex max-w-[90%] flex-1 flex-col gap-3 sm:max-w-2xl">
        <div className="rounded-2xl rounded-tl-sm border border-border/70 bg-card p-4 shadow-soft">
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
            <span className="font-heading text-xs font-semibold text-primary">AnnaSathi</span>
            <span className="text-[10px] text-muted-foreground">{formatClock(message.createdAt)}</span>
          </div>
          <p className={cn('whitespace-pre-line text-sm leading-relaxed text-foreground')}>{message.text}</p>
        </div>
        {message.card && <AnnaSathiCardView card={message.card} />}
      </div>
    </div>
  );
}

export function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3">
      <AnnaSathiAvatar size={30} className="mt-0.5" />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/70 bg-card px-4 py-3 shadow-soft">
        <span className="text-xs font-medium text-muted-foreground">AnnaSathi is thinking</span>
        <span className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}


