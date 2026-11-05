import { describe, expect, it } from 'vitest';
import { authModalHref, safeReturnUrl, wantsAuthModal } from './auth-return';

const origin = 'https://feedback.community';

describe('safeReturnUrl', () => {
  it.each([
    ['/tracks', '/tracks'],
    ['/tracks/abc?comment=1#top', '/tracks/abc?comment=1#top'],
    ['https://feedback.community/projects', '/projects'],
  ])('keeps %s on this site', (value, expected) => {
    expect(safeReturnUrl(value, origin)).toBe(expected);
  });

  it.each([
    'https://evil.example/tracks',
    '//evil.example/tracks',
    '\\\\evil.example/tracks',
    'https://feedback.community.evil.example/',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://[not-a-host',
  ])('refuses %s', (value) => {
    expect(safeReturnUrl(value, origin)).toBeUndefined();
  });

  it('has nothing to say without a value', () => {
    expect(safeReturnUrl(undefined, origin)).toBeUndefined();
    expect(safeReturnUrl('', origin)).toBeUndefined();
  });
});

describe('authModalHref', () => {
  it('asks home for the modal', () => {
    expect(authModalHref('sign-up', undefined)).toBe('/?auth=sign-up');
  });

  it('carries the return URL, encoded', () => {
    expect(authModalHref('sign-in', 'https://feedback.community/tracks?a=1')).toBe(
      '/?auth=sign-in&redirect_url=https%3A%2F%2Ffeedback.community%2Ftracks%3Fa%3D1',
    );
  });

  it('ignores a repeated param, which arrives as a list', () => {
    expect(authModalHref('sign-in', ['/a', '/b'])).toBe('/?auth=sign-in');
  });
});

describe('wantsAuthModal', () => {
  it('takes the bare path', () => {
    expect(wantsAuthModal(undefined, {})).toBe(true);
    expect(wantsAuthModal(undefined, { redirect_url: '/tracks' })).toBe(true);
  });

  it("leaves Clerk's own steps on the real page", () => {
    expect(wantsAuthModal(['sso-callback'], {})).toBe(false);
    expect(wantsAuthModal(undefined, { __clerk_ticket: 'abc' })).toBe(false);
  });
});
