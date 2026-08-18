import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// jsdom in this repo's vitest config has no origin, so window.localStorage is
// undefined (this is why the existing CompetitionCardVoting tests fail on main).
// Shim it so the component under test can run.
if (!globalThis.window?.localStorage) {
  const store = new Map();
  Object.defineProperty(globalThis.window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  });
}


vi.mock('../../../lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: () => false }));
vi.mock('../../../hooks', () => ({
  useSupabaseAuth: () => ({ user: null, isAuthenticated: false }),
  useLeaderboard: () => ({ contestants: [] }),
  useFingerprint: () => ({ fingerprint: 'fp-test', loading: false, error: null }),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
const submitAnonymousVoteMock = vi.fn();
vi.mock('../../../lib/votes', () => ({
  hasUsedFreeVoteToday: vi.fn().mockResolvedValue(false),
  submitFreeVote: vi.fn(),
  submitAnonymousVote: (...a) => submitAnonymousVoteMock(...a),
  createVotePaymentIntent: vi.fn(),
}));
vi.mock('../../../lib/doubleVoteDay', () => ({
  isDoubleVoteDayForCompetition: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../../lib/stripe', () => ({ getStripe: vi.fn(), isStripeConfigured: () => false }));
vi.mock('../../../components/ui', () => ({
  VoteShareCard: () => null,
  Modal: ({ children, isOpen }) => (isOpen ? <div>{children}</div> : null),
}));
vi.mock('../../public-site/components/VoteModal', () => ({ default: () => null }));

const { default: CompetitionCardVoting } = await import('./CompetitionCardVoting');

// Chrome auto-translate: replaces each bare text node with a <font> wrapper,
// and keeps doing it to newly rendered nodes via its own MutationObserver.
function startChromeTranslate(root) {
  const wrap = (n) => {
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    const ns = []; while (w.nextNode()) ns.push(w.currentNode);
    for (const tn of ns) {
      if (!tn.nodeValue.trim()) continue;
      const p = tn.parentNode;
      if (!p || p.tagName === 'FONT' || /SCRIPT|STYLE/.test(p.tagName)) continue;
      const f = document.createElement('font');
      f.appendChild(document.createTextNode('[es] ' + tn.nodeValue));
      try { p.replaceChild(f, tn); } catch { /* node already moved */ }
    }
  };
  const mo = new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType === 1) wrap(n);
      else if (n.nodeType === 3 && n.parentNode && n.parentNode.tagName !== 'FONT') wrap(n.parentNode);
    }
  });
  mo.observe(root, { childList: true, subtree: true });
  wrap(root);
  return mo;
}

function countBareText(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (w.nextNode()) {
    const tn = w.currentNode;
    if (tn.nodeValue.trim() && tn.parentNode.tagName !== 'FONT') n++;
  }
  return n;
}

const baseProps = {
  contestant: { id: 'contestant-1', name: 'Katie Smith' },
  competition: { id: 'comp-1', price_per_vote: 1, use_price_bundler: true },
  currentRound: { id: 'round-1', isActive: true },
};

beforeEach(() => { window.localStorage.clear(); submitAnonymousVoteMock.mockReset(); });

describe('ANONYMOUS FREE VOTE survives Chrome auto-translate', () => {
  it('walks the real anonymous free-vote journey without crashing', async () => {
    submitAnonymousVoteMock.mockResolvedValue({ success: true, votesAdded: 1 });
    const { container } = render(<CompetitionCardVoting {...baseProps} />);
    const cta = await screen.findByRole('button', { name: /Use your 1 free daily vote/i });

    const mo = startChromeTranslate(container);
    const step = async (label, fn) => {
      let err = null;
      try { await act(async () => { await fn(); }); } catch (e) { err = e; }
      // eslint-disable-next-line no-console
      console.log(`${err ? '💥' : '✅'} ${label}` + (err ? ` -> ${err.name}: ${err.message}` : '') +
        `   [fonts=${container.querySelectorAll('font').length} bareText=${countBareText(container)}]`);
      return err;
    };

    const e1 = await step('STEP 1  click "Use your 1 free daily vote" (opens form)', () => cta.click());
    if (e1) { mo.disconnect(); throw e1; }

    await step('STEP 2  fill the form', () => {
      fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Kelly' } });
      fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Clark' } });
      fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'k@e.com' } });
    });

    const e3 = await step('STEP 3  click "Submit free vote" (casts the vote)', () =>
      screen.getByRole('button', { name: /Submit free vote/i }).click());

    mo.disconnect();
    // This surface is SAFE: the anonymous free-vote journey has no bare text
    // node that React must remove, so translation cannot break it. Guard it.
    const bad = e1 || e3;
    expect(bad, bad && `${bad.name}: ${bad.message}`).toBeFalsy();
  });
});
