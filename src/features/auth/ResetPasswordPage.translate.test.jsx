import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';

/**
 * Companion to LoginPage.translate.test.jsx — the reset page is the other half
 * of the flow a locked-out contestant walks through, and carries the same
 * bare-text-beside-an-element shape that PR #671 fixed in the vote modal.
 */

const verifyOtp = vi.fn();
const getSession = vi.fn();
const updateUser = vi.fn();
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...a) => verifyOtp(...a),
      getSession: (...a) => getSession(...a),
      updateUser: (...a) => updateUser(...a),
      onAuthStateChange: (...a) => onAuthStateChange(...a),
    },
  },
  isSupabaseConfigured: () => true,
}));

import ResetPasswordPage from './ResetPasswordPage';

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

function setUrl(search) {
  window.history.replaceState({}, '', '/reset-password' + search);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
});

describe('REAL ResetPasswordPage survives browser auto-translate', () => {
  it('survives submitting the new password', async () => {
    setUrl('');
    updateUser.mockImplementation(() => new Promise(() => {})); // hold the loading branch

    const { container } = render(<ResetPasswordPage />);
    await act(async () => {});

    const pws = [...container.querySelectorAll('input[type="password"]')];
    expect(pws.length, 'password form must be showing').toBeGreaterThan(0);
    pws.forEach((i) => fireEvent.change(i, { target: { value: 'hunter2hunter2' } }));

    const translated = translate(container);
    // eslint-disable-next-line no-console
    console.log('text nodes translated on the reset page:', translated);
    expect(translated).toBeGreaterThan(0);

    await expectNoRemoveChildCrash(() => { fireEvent.submit(container.querySelector('form')); });
  });

  it('survives the mismatched-password error appearing', async () => {
    setUrl('');

    const { container } = render(<ResetPasswordPage />);
    await act(async () => {});

    const pws = [...container.querySelectorAll('input[type="password"]')];
    fireEvent.change(pws[0], { target: { value: 'hunter2hunter2' } });
    fireEvent.change(pws[1], { target: { value: 'something-else' } });

    translate(container);

    await expectNoRemoveChildCrash(() => { fireEvent.submit(container.querySelector('form')); });
  });

  it('survives confirming an unspent recovery token', async () => {
    setUrl('?token_hash=abc123&type=recovery');

    const { container } = render(<ResetPasswordPage />);
    await act(async () => {});

    const translated = translate(container);
    expect(translated).toBeGreaterThan(0);

    const confirm = [...container.querySelectorAll('button')]
      .find((b) => /set my password/i.test(b.textContent));
    expect(confirm, 'confirm CTA must be present').toBeTruthy();

    await expectNoRemoveChildCrash(() => { confirm.click(); });
  });

  it('survives a spent token falling through to the expired-link screen', async () => {
    setUrl('?token_hash=spent&type=recovery');
    verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Email link is invalid or has expired' } });

    const { container } = render(<ResetPasswordPage />);
    await act(async () => {});

    translate(container);

    const confirm = [...container.querySelectorAll('button')]
      .find((b) => /set my password/i.test(b.textContent));

    await expectNoRemoveChildCrash(() => { confirm.click(); });
  });
});
