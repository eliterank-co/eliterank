import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock Stripe's React bindings so the checkout form renders without a real
// Stripe context. confirmPayment is hoisted so the mock factory can close over
// it, and defaults to a successful PaymentIntent.
const { confirmPayment } = vi.hoisted(() => ({
  confirmPayment: vi.fn(() => Promise.resolve({ paymentIntent: { status: 'succeeded' } })),
}));
vi.mock('@stripe/react-stripe-js', () => ({
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
  PaymentElement: () => null,
  Elements: ({ children }) => children,
}));

import { PaymentCheckoutForm } from './VoteModal';

const renderForm = (props = {}) =>
  render(
    <PaymentCheckoutForm
      onSuccess={vi.fn()}
      onCancel={vi.fn()}
      amount={10}
      currency="CAD"
      contestantName="Tess Katula"
      {...props}
    />,
  );

const payButton = () => screen.getByRole('button', { name: /Pay/i });

beforeEach(() => {
  confirmPayment.mockClear();
  cleanup();
});

describe('checkout disclosure', () => {
  it('shows the non-refundable + no-guarantee acknowledgment, naming the contestant', () => {
    const { container } = renderForm();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(container.textContent).toMatch(/final and non-refundable/i);
    expect(container.textContent).toMatch(/does not guarantee/i);
    expect(container.textContent).toMatch(/Tess Katula will win, place, or advance/i);
  });

  it('disables the Pay button until the box is checked', () => {
    renderForm();
    expect(payButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(payButton()).not.toBeDisabled();
  });

  it('blocks payment submission until acknowledged', () => {
    renderForm();
    fireEvent.submit(payButton().closest('form'));
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(screen.getByText(/confirm you understand/i)).toBeInTheDocument();
  });

  it('allows payment once acknowledged, and calls onSuccess', async () => {
    const onSuccess = vi.fn();
    renderForm({ onSuccess });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(payButton().closest('form'));
    await waitFor(() => expect(confirmPayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('requires acknowledgment on every purchase — a fresh checkout starts unchecked and blocked', () => {
    // First checkout: acknowledge.
    renderForm();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(payButton()).not.toBeDisabled();
    cleanup();
    // A brand-new checkout instance (no stored flag / no tracking) must start
    // over: unchecked box, disabled Pay button.
    renderForm();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(payButton()).toBeDisabled();
  });

  it('does not read or write any browser storage (no vote-purchase tracking)', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    renderForm();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(getSpy).not.toHaveBeenCalledWith('eliterank-vote-purchase-ack-v1');
    expect(setSpy).not.toHaveBeenCalledWith('eliterank-vote-purchase-ack-v1', expect.anything());
    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
