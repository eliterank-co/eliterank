import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

/**
 * ExistingAccountLogin - "Welcome back" login panel for returning users.
 *
 * Shown when someone entering/claiming already has an account, so they can log
 * in up front — their profile then pre-fills the build-your-card steps and the
 * password step is skipped. Used by both entry points:
 * - Self-nomination (EntryFlow) — offered on the opening screen, email editable.
 * - Third-party claim (ClaimNominationPage) — auto-detected, email locked to
 *   the nominee's address.
 *
 * onLogin / onForgotPassword should resolve to { success, error }.
 */
export default function ExistingAccountLogin({
  email: initialEmail = '',
  lockEmail = false,
  title = 'Welcome back',
  subtitle = "Log in and we'll fill in your details.",
  onLogin,
  onForgotPassword,
  onCancel,
  cancelLabel = 'Continue as a new account',
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetStatus, setResetStatus] = useState('idle'); // idle | sending | sent
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Enter your email');
      return;
    }
    if (!password) {
      setError('Enter your password');
      return;
    }

    setSubmitting(true);
    const result = await onLogin(email.trim(), password);
    if (result?.success) {
      // Parent advances/unmounts this panel — keep the button disabled.
      return;
    }
    setError(result?.error || 'Incorrect email or password.');
    setSubmitting(false);
  };

  const handleForgot = async () => {
    if (!onForgotPassword || resetStatus === 'sending') return;
    setResetError('');
    setResetStatus('sending');
    const result = await onForgotPassword(email.trim());
    if (result?.success) {
      setResetStatus('sent');
    } else {
      setResetStatus('idle');
      setResetError(result?.error || 'Failed to send reset email.');
    }
  };

  return (
    <form className="entry-step entry-step-password" onSubmit={handleSubmit}>
      <h2 className="entry-step-title">{title}</h2>
      <p className="entry-step-subtitle">{subtitle}</p>

      <div className="entry-form-field">
        <label className="entry-label">Email</label>
        <div className="entry-input-icon">
          <Mail size={18} />
          <input
            type="email"
            className="entry-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={lockEmail}
            style={lockEmail ? { opacity: 0.6 } : undefined}
            placeholder="you@email.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Password</label>
        <div className="entry-input-icon entry-input-password">
          <Lock size={18} />
          <input
            type={showPassword ? 'text' : 'password'}
            className="entry-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
          />
          <button
            type="button"
            className="entry-password-toggle"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && <p className="entry-error">{error}</p>}

      <button type="submit" className="entry-btn-primary" disabled={submitting}>
        {submitting ? 'Logging in...' : 'Log In & Continue'}
      </button>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        {resetStatus === 'sent' ? (
          <p className="entry-step-subtitle" style={{ margin: 0 }}>
            Password reset email sent{email ? ` to ${email}` : ''}. Check your
            inbox, then come back and log in.
          </p>
        ) : (
          onForgotPassword && (
            <>
              <button
                type="button"
                onClick={handleForgot}
                disabled={resetStatus === 'sending'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {resetStatus === 'sending' ? 'Sending reset email...' : 'Forgot your password?'}
              </button>
              {resetError && <p className="entry-error">{resetError}</p>}
            </>
          )
        )}
      </div>

      {onCancel && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {cancelLabel}
          </button>
        </div>
      )}
    </form>
  );
}
