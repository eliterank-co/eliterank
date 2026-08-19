import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';

/**
 * Regression test for Sentry MOST-ELIGIBLE-APP-9S.
 *
 * `NotFoundError: The object can not be found here.` (DOMException 8) on
 * /login, componentStack `button > form > div > div > LoginPage`, from a
 * es-419 user on Mobile Safari 26.6. Same class as PR #671 but triggered by
 * iOS Safari's translator rather than Chrome's — both replace each bare text
 * node with a wrapper element, so a text node React still holds a reference to
 * is no longer a direct child of its parent.
 *
 * The "Continue" button is the specific trigger: its two branches are
 *   idle    -> [ text "Continue", <ArrowRight/> ]
 *   loading -> [ <span spinner/>, text "Checking..." ]
 * Index 0 flips from a text node to an element, so React must REMOVE the
 * translated text node — and that is the operation that throws.
 */

const rpc = vi.fn();
const nomineeRows = vi.fn(() => Promise.resolve({ data: [], error: null }));
const signIn = vi.fn();
const signUp = vi.fn();

function queryChain() {
  const chain = {
    select: () => chain,
    ilike: () => chain,
    neq: () => chain,
    is: () => chain,
    limit: () => nomineeRows(),
  };
  return chain;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => queryChain(),
    auth: { resetPasswordForEmail: vi.fn(), signInWithOtp: vi.fn() },
  },
  isSupabaseConfigured: () => true,
}));
vi.mock('../../hooks', () => ({
  useSupabaseAuth: () => ({ signIn: (...a) => signIn(...a), signUp: (...a) => signUp(...a) }),
}));

import LoginPage from './LoginPage';

// What a browser translator does: swap each bare text node for a wrapper
// element holding the translated string.
function translate(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let n = 0;
  for (const textNode of nodes) {
    if (!textNode.nodeValue.trim()) continue;
    const parent = textNode.parentNode;
    if (!parent || parent.tagName === 'FONT' || /SCRIPT|STYLE/.test(parent.tagName)) continue;
    const font = document.createElement('font');
    font.appendChild(document.createTextNode('[es] ' + textNode.nodeValue));
    parent.replaceChild(font, textNode);
    n++;
  }
  return n;
}

async function expectNoRemoveChildCrash(fn) {
  const original = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    try {
      return original.call(this, child);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(
        'FAILED removeChild\n  parent <' + this.nodeName + '>: ' +
        (this.outerHTML || '').slice(0, 200) + '\n  child: ' +
        (child.nodeType === 3 ? JSON.stringify(child.nodeValue) : child.nodeName)
      );
      throw e;
    }
  };
  let err = null;
  try {
    await act(async () => { await fn(); });
  } catch (e) {
    err = e;
  } finally {
    Node.prototype.removeChild = original;
  }
  expect(err, err && `${err.name}: ${err.message}`).toBeNull();
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('REAL LoginPage survives browser auto-translate', () => {
  it('survives tapping Continue on the email step', async () => {
    // Leave the RPC pending so the button sits on its loading branch.
    rpc.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<LoginPage onLogin={vi.fn()} />);
    await act(async () => {});

    const emailInput = container.querySelector('input[type="email"], input[name="email"]');
    expect(emailInput, 'email input must be present').toBeTruthy();
    fireEvent.change(emailInput, { target: { value: 'someone@example.com' } });

    const translated = translate(container);
    // eslint-disable-next-line no-console
    console.log('text nodes translated on the login page:', translated);
    expect(translated).toBeGreaterThan(0);

    const form = container.querySelector('form');
    await expectNoRemoveChildCrash(() => { fireEvent.submit(form); });
  });

  it('survives the inline error appearing after an invalid email', async () => {
    const { container } = render(<LoginPage onLogin={vi.fn()} />);
    await act(async () => {});

    const emailInput = container.querySelector('input[type="email"], input[name="email"]');
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });

    translate(container);

    const form = container.querySelector('form');
    await expectNoRemoveChildCrash(() => { fireEvent.submit(form); });
  });

  it('survives tapping Sign In on the password step', async () => {
    rpc.mockResolvedValue({ data: true, error: null });   // email is registered
    signIn.mockImplementation(() => new Promise(() => {})); // hold the loading branch

    const { container } = render(<LoginPage onLogin={vi.fn()} />);
    await act(async () => {});

    fireEvent.change(container.querySelector('input[type="email"], input[name="email"]'),
      { target: { value: 'someone@example.com' } });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });

    const pw = container.querySelector('input[type="password"]');
    expect(pw, 'password step must be reached').toBeTruthy();
    fireEvent.change(pw, { target: { value: 'hunter2hunter2' } });

    const translated = translate(container);
    expect(translated).toBeGreaterThan(0);

    await expectNoRemoveChildCrash(() => { fireEvent.submit(container.querySelector('form')); });
  });

  it('survives tapping Create Account on the signup step', async () => {
    rpc.mockResolvedValue({ data: false, error: null });    // brand new email
    nomineeRows.mockResolvedValue({ data: [], error: null }); // and no nomination
    signUp.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<LoginPage onLogin={vi.fn()} />);
    await act(async () => {});

    fireEvent.change(container.querySelector('input[type="email"], input[name="email"]'),
      { target: { value: 'brand-new@example.com' } });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });

    const inputs = [...container.querySelectorAll('input')];
    inputs.filter((i) => i.type === 'text').forEach((i, idx) =>
      fireEvent.change(i, { target: { value: idx === 0 ? 'Ada' : 'Lovelace' } }));
    inputs.filter((i) => i.type === 'password').forEach((i) =>
      fireEvent.change(i, { target: { value: 'hunter2hunter2' } }));

    const translated = translate(container);
    expect(translated).toBeGreaterThan(0);

    await expectNoRemoveChildCrash(() => { fireEvent.submit(container.querySelector('form')); });
  });

  it('survives the back button rendering beside its icon', async () => {
    const { container } = render(<LoginPage onLogin={vi.fn()} onBack={vi.fn()} />);
    await act(async () => {});

    translate(container);

    const back = [...container.querySelectorAll('button')]
      .find((b) => /Back to competitions/i.test(b.textContent));
    expect(back, 'back button must be present when onBack is supplied').toBeTruthy();
    await expectNoRemoveChildCrash(() => { back.click(); });
  });
});
