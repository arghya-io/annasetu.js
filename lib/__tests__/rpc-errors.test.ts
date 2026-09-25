import { describe, it, expect } from 'vitest';
import { rpcErrorMessage } from '../rpc-errors';

describe('rpcErrorMessage', () => {
  it('returns the human text after a known code', () => {
    expect(rpcErrorMessage('CAPACITY_FULL: the centre has 5 quintal left on that date', 'x')).toBe(
      'the centre has 5 quintal left on that date',
    );
  });

  it('returns the default text for a bare known code', () => {
    expect(rpcErrorMessage('TOKEN_ALREADY_USED', 'x')).toBe('This token has already been used.');
  });

  it('never leaks unknown / internal database text', () => {
    expect(rpcErrorMessage('duplicate key value violates unique constraint "users_pkey"', 'fallback')).toBe('fallback');
    expect(rpcErrorMessage('UNKNOWN_CODE: secret detail', 'fallback')).toBe('fallback');
    expect(rpcErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
