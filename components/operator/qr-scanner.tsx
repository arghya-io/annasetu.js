'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Camera QR scanner (jsQR over getUserMedia frames). Works in any browser that
 * allows camera access over HTTPS. Calls onScan once per distinct code (a code
 * is ignored for `cooldownMs` after being read so a held-up QR isn't submitted
 * repeatedly).
 */
export function QrScanner({
  onScan,
  active,
  cooldownMs = 3000,
}: {
  onScan: (text: string) => void;
  active: boolean;
  cooldownMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    async function start() {
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import('jsqr'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
        ]);
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();

        const tick = () => {
          const canvas = canvasRef.current;
          if (!canvas || !video || cancelled) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
              if (code && code.data) {
                const now = Date.now();
                const last = lastRef.current;
                if (!last || last.text !== code.data || now - last.at > cooldownMs) {
                  lastRef.current = { text: code.data, at: now };
                  onScanRef.current(code.data);
                }
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setCameraError('Camera access was denied or is unavailable. Allow camera access, or paste the code below.');
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, cooldownMs]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      {cameraError ? (
        <p className="p-6 text-sm text-white">{cameraError}</p>
      ) : (
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
