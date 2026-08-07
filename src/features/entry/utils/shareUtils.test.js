import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { shareProfileLink } from './shareUtils';

// Helpers to install/remove navigator.share and navigator.clipboard, which
// jsdom does not provide by default.
function setShare(fn) {
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true, writable: true });
}
function clearShare() {
  delete navigator.share;
}
function setClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
}

const URL_UNDER_TEST = 'https://eliterank.co/profile/abc';

afterEach(() => {
  clearShare();
  delete navigator.clipboard;
  vi.restoreAllMocks();
});

describe('shareProfileLink', () => {
  it('returns "shared" and passes title+url when the native sheet completes', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    const clip = vi.fn().mockResolvedValue(undefined);
    setClipboard(clip);

    const outcome = await shareProfileLink(URL_UNDER_TEST, { title: 'Vote for me!' });

    expect(outcome).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Vote for me!', url: URL_UNDER_TEST });
    expect(clip).not.toHaveBeenCalled(); // no clipboard fallback on success
  });

  it('treats a dismissed native sheet (AbortError) as "shared" — THE reported bug', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    setShare(share);
    const clip = vi.fn().mockResolvedValue(undefined);
    setClipboard(clip);

    const outcome = await shareProfileLink(URL_UNDER_TEST);

    // Previously this silently awarded nothing; now the user still earns credit.
    expect(outcome).toBe('shared');
    expect(clip).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when native share throws a non-abort error', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('not allowed', 'NotAllowedError')));
    const clip = vi.fn().mockResolvedValue(undefined);
    setClipboard(clip);

    const outcome = await shareProfileLink(URL_UNDER_TEST);

    expect(outcome).toBe('copied');
    expect(clip).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('copies to clipboard when the Web Share API is unavailable (desktop)', async () => {
    clearShare();
    const clip = vi.fn().mockResolvedValue(undefined);
    setClipboard(clip);

    const outcome = await shareProfileLink(URL_UNDER_TEST);

    expect(outcome).toBe('copied');
    expect(clip).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it('returns "failed" only when neither share nor clipboard is usable', async () => {
    clearShare();
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));

    const outcome = await shareProfileLink(URL_UNDER_TEST);

    expect(outcome).toBe('failed');
  });
});
