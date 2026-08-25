import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NomineeInfoStep from './NomineeInfoStep';

/**
 * `nominee_invite` bounced 24.4% in the 2026-08 audit — the worst of any email
 * this app sends. These assert the guard is actually wired into the step, not
 * merely that the helper works in isolation.
 */
function setup(email, onChange = vi.fn()) {
  const data = { name: 'Ada Lovelace', email, instagram: 'ada', photoPreview: '' };
  render(
    <NomineeInfoStep data={data} onChange={onChange} onNext={vi.fn()} error="" />,
  );
  return onChange;
}

describe('NomineeInfoStep email typo suggestion', () => {
  it('offers a correction for a typo domain', () => {
    setup('ada@gamil.com');
    expect(screen.getByText(/did you mean/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ada@gmail.com' }),
    ).toBeInTheDocument();
  });

  it('applies the correction through onChange when tapped', () => {
    const onChange = setup('ada@gamil.com');
    fireEvent.click(screen.getByRole('button', { name: 'ada@gmail.com' }));
    expect(onChange).toHaveBeenCalledWith({ email: 'ada@gmail.com' });
  });

  it('shows nothing for a legitimate address', () => {
    setup('ada@gmail.com');
    expect(screen.queryByText(/did you mean/i)).not.toBeInTheDocument();
  });

  it('shows nothing for a legitimate regional domain', () => {
    setup('ada@yahoo.ca');
    expect(screen.queryByText(/did you mean/i)).not.toBeInTheDocument();
  });

  /**
   * The suggestion is advisory. This flow is live production: if the map ever
   * gained a false positive, a hard block would turn it into a lost nomination.
   */
  it('does NOT disable Continue while a suggestion is showing', () => {
    setup('ada@gamil.com');
    const cta = screen.getByRole('button', { name: /continue|next/i });
    expect(cta).not.toBeDisabled();
  });
});
