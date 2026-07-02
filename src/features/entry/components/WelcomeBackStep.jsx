import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Mail } from 'lucide-react';

/**
 * WelcomeBackStep — greet for returning nominees on the third-party claim flow.
 *
 * Shown at the very start of the flow when the nominee's invite email already
 * owns an EliteRank account (detected via the token-scoped
 * `nominee_invite_has_account` RPC). Logging in pre-fills their card from their
 * existing profile and skips the "create password" step, instead of forcing a
 * second account. "Continue as a new account" falls back to the normal flow.
 */
export default function WelcomeBackStep({
  nominee,
  competition,
  email,
  onLogin,
  onContinueAsNew,
  onForgotPassword,
  submitting,
  error,
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const firstName = nominee?.name?.split(' ')[0] || '';
  const competitionName =
    competition?.name ||
    (competition?.city?.name ? `Most Eligible ${competition.city.name}` : 'this competition');

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');
    if (!password) {
      setValidationError('Enter your password to log in');
      return;
    }
    onLogin(password);
  };

  return (
    <form className="entry-step entry-step-password" onSubmit={handleSubmit}>
      <h2 className="entry-step-title">Welcome back{firstName ? `, ${firstName}` : ''}!</h2>
      <p className="entry-step-subtitle">
        You&rsquo;ve been nominated for <strong>{competitionName}</strong>. Log in and
        we&rsquo;ll set up your entry with your details.
      </p>

      {email && (
        <div className="entry-form-field">
          <label className="entry-label">Email</label>
          <div className="entry-input-icon">
            <Mail size={18} />
            <input type="email" className="entry-input" value={email} disabled style={{ opacity: 0.6 }} />
          </div>
        </div>
      )}

      <div className="entry-form-field">
        <label className="entry-label">Password</label>
        <div className="entry-input-icon entry-input-password">
          <Lock size={18} />
          <input
            type={showPassword ? 'text' : 'password'}
            className="entry-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your EliteRank password"
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

      {(validationError || error) && <p className="entry-error">{validationError || error}</p>}

      <button type="submit" className="entry-btn-primary" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log In & Continue'}
      </button>

      {onForgotPassword && (
        <button
          type="button"
          className="entry-link-btn"
          onClick={() => onForgotPassword(email)}
          disabled={submitting}
        >
          Forgot your password?
        </button>
      )}

      <button
        type="button"
        className="entry-btn-primary entry-btn-outline"
        onClick={onContinueAsNew}
        disabled={submitting}
        style={{ marginTop: 8 }}
      >
        Continue as a new account
      </button>
    </form>
  );
}
