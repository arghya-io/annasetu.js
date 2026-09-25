import 'server-only';
import { randomInt } from 'node:crypto';

// 8 characters from a 32-symbol alphabet without ambiguous glyphs (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Initial password for admin-provisioned accounts (spec §10). Generated
 * here from Node's CSPRNG so the plaintext never has to travel through a
 * database RPC callable by ordinary clients. It is handed straight to
 * supabase.auth.admin, returned once for the printable sheet, and never
 * stored. The account is flagged must_change_password, and the DB refuses
 * every RPC and RLS-protected read until the user sets their own password.
 */
export function generateInitialPassword(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET.charAt(randomInt(ALPHABET.length));
  }
  return out;
}
