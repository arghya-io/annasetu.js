'use client';

import { useEffect, useRef, useState } from 'react';
import { AnnaSathiAvatar } from './annasathi-avatar';
import { LanguageModal } from './language-modal';
import { MessageBubble, ThinkingBubble, type ChatMessage } from './message-bubble';
import { SuggestedChips, type SuggestedAction } from './suggested-chips';
import { MicButton, ListeningPanel, MicPermissionBanner, type VoiceState } from './mic-button';
import { AnnaSathiContextPanel, type AnnaSathiContextData } from './context-panel';
import { buildAssistantReply, type EligibleCentreSummary } from './response-engine';
import { ANNASATHI_LANGUAGES, DEFAULT_ANNASATHI_LANGUAGE, type AnnaSathiLanguage } from '@/lib/annasathi/languages';

const LISTEN_TIMEOUT_MS = 2400;

/** Demo transcript used when a simulated listening session completes naturally (no ASR wired up yet). */
function demoTranscript(language: AnnaSathiLanguage): string {
  return language.code === 'hi' ? 'मेरी बुकिंग की स्थिति क्या है?' : 'What is the status of my booking?';
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function AnnaSathiChat({
  farmerName,
  contextData,
  eligibleCentres,
}: {
  farmerName: string;
  contextData: AnnaSathiContextData;
  eligibleCentres: EligibleCentreSummary[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [processing, setProcessing] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [showMicBanner, setShowMicBanner] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [language, setLanguage] = useState<AnnaSathiLanguage>(DEFAULT_ANNASATHI_LANGUAGE);

  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, processing]);

  useEffect(() => () => {
    if (listenTimer.current) clearTimeout(listenTimer.current);
  }, []);

  function respond(userText: string) {
    setProcessing(true);
    // Simulated "thinking" delay — the real pipeline will await Bhashini/RAG here instead.
    window.setTimeout(() => {
      const reply = buildAssistantReply(userText, { ...contextData, farmerName, eligibleCentres });
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', text: reply.text, card: reply.card, error: reply.error, createdAt: new Date().toISOString() },
      ]);
      setProcessing(false);
    }, 700 + Math.random() * 500);
  }

  function sendUserMessage(text: string, viaVoice: boolean) {
    const trimmed = text.trim();
    if (!trimmed || processing) return;
    setMessages((prev) => [...prev, { id: newId(), role: 'user', text: trimmed, viaVoice, createdAt: new Date().toISOString() }]);
    respond(trimmed);
  }

  function handleChip(action: SuggestedAction) {
    sendUserMessage(action.label, false);
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue;
    setInputValue('');
    sendUserMessage(text, false);
  }

  async function handleMicClick() {
    if (voiceState === 'listening') {
      // User stopped early — the (simulated) recognizer never got a result.
      if (listenTimer.current) clearTimeout(listenTimer.current);
      setVoiceState('idle');
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', text: "Sorry, I didn't quite understand that. Please try again.", error: true, createdAt: new Date().toISOString() },
      ]);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setVoiceState('denied');
      setShowMicBanner(true);
      return;
    }

    setVoiceState('requesting');
    try {
      // Real permission check today; this is also where a real ASR session
      // would start once Bhashini is wired in. We only need the grant, so
      // the stream is stopped immediately rather than recorded anywhere.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceState('listening');
      listenTimer.current = setTimeout(() => {
        setVoiceState('idle');
        sendUserMessage(demoTranscript(language), true);
      }, LISTEN_TIMEOUT_MS);
    } catch {
      setVoiceState('denied');
      setShowMicBanner(true);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6 lg:flex-row">
      {/* ---- Chat panel ---- */}
      <section className="flex min-h-[70vh] flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft sm:min-h-[75vh]">
        {/* Companion header */}
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary to-primary/80 px-4 py-3.5 text-primary-foreground sm:px-6">
          <div className="flex items-center gap-3">
            <AnnaSathiAvatar size={40} online />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-base font-semibold sm:text-lg">AnnaSathi AI</h1>
                <span className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-2 py-0.5 text-[10px] font-semibold">
                  Online
                </span>
              </div>
              <p className="text-xs text-primary-foreground/80">Your AnnaSetu procurement companion</p>
            </div>
          </div>
          <button
            onClick={() => setLanguageOpen(true)}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 py-1.5 text-xs font-medium hover:bg-primary-foreground/20"
          >
            <span aria-hidden>🌐</span> <span className="hidden sm:inline">{language.nativeName}</span>
          </button>
        </div>

        {showMicBanner && <MicPermissionBanner onDismiss={() => setShowMicBanner(false)} />}

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isEmpty ? (
            <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center">
              <AnnaSathiAvatar size={112} />
              <span className="mt-3 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                🌾 Digital Assistant · AnnaSetu
              </span>
              <h2 className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">Namaste! I&rsquo;m AnnaSathi.</h2>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground sm:text-base">
                How can I help you with AnnaSetu today? Speak or type in your language.
              </p>

              <div className="mt-6 w-full">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Popular questions</p>
                <SuggestedChips onPick={handleChip} disabled={processing} />
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {processing && <ThinkingBubble />}
              <div ref={streamEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-border/70 bg-card p-3 sm:p-4">
          {voiceState === 'listening' && <ListeningPanel onStop={handleMicClick} />}

          {!isEmpty && (
            <div className="mb-3">
              <SuggestedChips onPick={handleChip} disabled={processing} />
            </div>
          )}

          <form onSubmit={handleTextSubmit} className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                placeholder="Type your agricultural query, or tap the microphone to speak…"
                disabled={processing}
                className="w-full rounded-2xl border border-border bg-secondary/40 py-3 pl-4 pr-16 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setLanguageOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-border"
              >
                {language.englishName}
              </button>
            </div>

            <MicButton state={voiceState} onClick={handleMicClick} />

            <button
              type="submit"
              disabled={processing || inputValue.trim().length === 0}
              aria-label="Send"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12"
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Speak naturally in your preferred language
            </span>
            <span className="hidden sm:inline">Voice-first · AnnaSetu prototype</span>
          </div>
        </div>
      </section>

      <AnnaSathiContextPanel language={language} data={contextData} />

      <LanguageModal
        open={languageOpen}
        current={language}
        onSelect={(lang) => {
          setLanguage(lang);
          setLanguageOpen(false);
        }}
        onClose={() => setLanguageOpen(false)}
      />
    </div>
  );
}

// Re-exported for callers that only need the language list shape.
export { ANNASATHI_LANGUAGES };
