import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '../redirect';

describe('safeRedirectPath', () => {
  it('allows same-origin absolute paths', () => {
    expect(safeRedirectPath('/farmer/dashboard')).toBe('/farmer/dashboard');
    expect(safeRedirectPath('/gov-admin/farmer-verification?status=pending')).toBe('/gov-admin/farmer-verification?status=pending');
  });

  it('falls back for external URLs', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('http://evil.example/x')).toBe('/');
  });

  it('falls back for protocol-relative and backslash tricks', () => {
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('/\\evil.example')).toBe('/');
    expect(safeRedirectPath('/foo\\bar')).toBe('/');
  });

  it('falls back for control characters and missing values', () => {
    expect(safeRedirectPath('/foo\nbar')).toBe('/');
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath(undefined, '/x')).toBe('/x');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
  });
});
