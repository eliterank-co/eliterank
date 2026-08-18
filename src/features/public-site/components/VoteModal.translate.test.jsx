import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

vi.mock('@stripe/react-stripe-js', () => ({
  useStripe: () => ({ confirmPayment: vi.fn() }),
  useElements: () => ({}),
  PaymentElement: () => null,
  Elements: ({ children }) => children,
}));
vi.mock('../../../lib/stripe', () => ({
  getStripe: () => Promise.resolve({}),
  isStripeConfigured: () => true,
}));
vi.mock('../../../lib/votes', () => ({
  hasUsedFreeVoteToday: vi.fn(() => Promise.resolve(false)),
  submitFreeVote: vi.fn(() => Promise.resolve({ success: true })),
  getTodaysVote: vi.fn(() => Promise.resolve(null)),
  getTimeUntilReset: () => '23h 10m',
  createVotePaymentIntent: vi.fn(),
  recordPaidVote: vi.fn(),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }) => children,
}));
vi.mock('../../../contexts/PublicCompetitionContext', () => ({
  useIsPreview: () => false,
}));

import VoteModal from './VoteModal';

// Exactly what Chrome's translator does: swap each bare text node for a
// <font> wrapper holding the translated string.
function chromeTranslate(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ns = []; while (w.nextNode()) ns.push(w.currentNode);
  let n = 0;
  for (const tn of ns) {
    if (!tn.nodeValue.trim()) continue;
    const p = tn.parentNode;
    if (!p || p.tagName === 'FONT' || /SCRIPT|STYLE/.test(p.tagName)) continue;
    const f = document.createElement('font');
    f.appendChild(document.createTextNode('[es] ' + tn.nodeValue));
    p.replaceChild(f, tn); n++;
  }
  return n;
}

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  contestant: { id: 'c1', name: 'Andrew', avatar_url: null },
  voteCount: 0,
  onVoteCountChange: vi.fn(),
  competitionId: 'comp1',
  user: null,
  onLogin: vi.fn(),
  onVoteSuccess: vi.fn(),
  currentRound: { id: 'r1', isActive: true },
  votePrice: 1.0,
};

beforeEach(async () => {
  cleanup();
  const votes = await import('../../../lib/votes');
  votes.hasUsedFreeVoteToday.mockReset().mockResolvedValue(false);
  votes.getTodaysVote.mockReset().mockResolvedValue(null);
  votes.submitFreeVote.mockReset().mockResolvedValue({ success: true, votesAdded: 1 });
});

describe('REAL VoteModal survives Chrome auto-translate', () => {
  it('survives the voter signing in (isAuthenticated false -> true)', async () => {
    const { container, rerender } = render(<VoteModal {...baseProps} isAuthenticated={false} />);
    await act(async () => {});

    const translated = chromeTranslate(container);
    // eslint-disable-next-line no-console
    console.log('text nodes translated inside the real modal:', translated);
    expect(translated).toBeGreaterThan(0);

    let err = null;
    try {
      await act(async () => { rerender(<VoteModal {...baseProps} isAuthenticated={true} user={{ id: 'u1' }} />); });
    } catch (e) { err = e; }

    // eslint-disable-next-line no-console
    console.log('RESULT sign-in transition:', err ? `${err.name}: ${err.message}` : 'no error');
    expect(err, err && `${err.name}: ${err.message}`).toBeNull();
  });

  it('survives modal open: checkingVoteStatus resolving while translated', async () => {
    const votes = await import('../../../lib/votes');
    let release;
    votes.hasUsedFreeVoteToday.mockImplementation(() => new Promise(r => { release = () => r(false); }));

    const { container } = render(
      <VoteModal {...baseProps} isAuthenticated={true} user={{ id: 'u1' }} />);
    // modal is sitting on the "Checking..." branch
    // eslint-disable-next-line no-console
    console.log('button while checking:', container.querySelector('button[disabled]')?.textContent);
    chromeTranslate(container);

    let err = null;
    try { await act(async () => { release(); await Promise.resolve(); }); } catch (e) { err = e; }
    // eslint-disable-next-line no-console
    console.log('RESULT modal-open status check:', err ? `${err.name}: ${err.message}` : 'no error');
    expect(err, err && `${err.name}: ${err.message}`).toBeNull();
  });

  it('survives the free-vote CTA click while translated', async () => {
    const { container } = render(
      <VoteModal {...baseProps} isAuthenticated={true} user={{ id: 'u1' }} />);
    await act(async () => {});

    const all = [...container.querySelectorAll('button')];
    // eslint-disable-next-line no-console
    console.log('buttons:', JSON.stringify(all.map(b => b.textContent.trim().slice(0, 34))));
    const free = all.find(b => /Free Daily Vote/i.test(b.textContent));
    expect(free, 'free-vote CTA must be present and enabled').toBeTruthy();
    expect(free.disabled).toBe(false);

    const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const ns = []; while (w.nextNode()) ns.push(w.currentNode);
    let n = 0;
    for (const tn of ns) {
      if (!tn.nodeValue.trim()) continue;
      const p = tn.parentNode;
      if (!p || p.tagName === 'FONT' || /SCRIPT|STYLE/.test(p.tagName)) continue;
      const f = document.createElement('font');
      f.appendChild(document.createTextNode('[es] ' + tn.nodeValue));
      p.replaceChild(f, tn); n++;
    }
    // eslint-disable-next-line no-console
    console.log('translated nodes before click:', n);

    const origRemove = Node.prototype.removeChild;
    Node.prototype.removeChild = function (child) {
      try { return origRemove.call(this, child); }
      catch (e) {
        // eslint-disable-next-line no-console
        console.log('FAILED removeChild\n  parent <' + this.nodeName + '>: ' +
          (this.outerHTML || '').slice(0, 220) + '\n  child: ' +
          (child.nodeType === 3 ? JSON.stringify(child.nodeValue) : child.nodeName));
        throw e;
      }
    };
    let err = null;
    try { await act(async () => { free.click(); }); } catch (e) { err = e; }
    Node.prototype.removeChild = origRemove;
    // eslint-disable-next-line no-console
    console.log('RESULT free-vote click:', err ? `${err.name}: ${err.message}` : 'NO ERROR');
    expect(err, err && `${err.name}: ${err.message}`).toBeNull();
  });
});
