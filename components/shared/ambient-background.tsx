/**
 * Subtle blue-green ambient gradients behind the soft white/light-gray
 * canvas. Fixed + pointer-events-none so it never interferes with layout or
 * interaction; low opacity and heavy blur keep it a background presence,
 * not a decoration competing with content (spec: reduce clutter, function
 * over decoration).
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-background">
      <div
        className="ambient-blob left-[-10%] top-[-15%] h-[55%] w-[55%] opacity-[0.10]"
        style={{ background: 'hsl(189 65% 45%)' }}
      />
      <div
        className="ambient-blob right-[-10%] top-[10%] h-[45%] w-[45%] opacity-[0.08]"
        style={{ background: 'hsl(165 55% 45%)' }}
      />
      <div
        className="ambient-blob bottom-[-15%] left-[15%] h-[40%] w-[40%] opacity-[0.07]"
        style={{ background: 'hsl(200 60% 50%)' }}
      />
    </div>
  );
}
