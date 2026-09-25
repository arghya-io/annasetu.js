// Minimal typing for jsQR (the package ships its own; this keeps the build
// independent of how a bundler resolves them).
declare module 'jsqr' {
  export interface QRCode {
    data: string;
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
  ): QRCode | null;
}
