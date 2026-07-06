import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Mail } from 'lucide-react';

/**
 * CreatePasswordStep - Account creation for nominees without a password
 *
 * Shown for:
 * - Not-logged-in self-nominees (create account)
 * - Magic-link third-party nominees (set password)
 * - Third-party nominees with no account (create account)
 *
 * Password is required — skipping is not allowed because users who skip
 * cannot log back in.
 */
export default function CreatePasswordStep({
  email,
  onSubmit,
  isSubmitting,
  error,
  isSettingPassword, // true = existing user setting password, false = new signup
  onForgotPassword, // async (email) => { success, error } — sends reset email
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [resetStatus, setResetStatus] = useState('idle'); // idle | sending | sent
  const [resetError, setResetError] = useState('');

  // The account-collision error thrown by createAccount when a logged-out user
  // already has an account but entered the wrong/forgotten password.
  const accountExists = /already exists|existing password|reset it/i.test(error || '');

  // Offer a reset path whenever a password already exists behind this email:
  // an existing user setting a password, or the collision error above.
  const showForgot = !!onForgotPassword && (isSettingPassword || accountExists);

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (!password || password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    onSubmit(password);
  };

  const handleForgotPassword = async () => {
    if (!onForgotPassword || resetStatus === 'sending') return;
    setResetError('');
    setResetStatus('sending');
    const result = await onForgotPassword(email);
    if (result?.success) {
      setResetStatus('sent');
    } else {
      setResetStatus('idle');
      setResetError(result?.error || 'Failed to send reset email.');
    }
  };

  return (
    <form className="entry-step entry-step-password" onSubmit={handleSubmit}>
      <h2 className="entry-step-title">
        {isSettingPassword ? 'Set your password' : 'Create your account'}
      </h2>
      <p className="entry-step-subtitle">
        {isSettingPassword
          ? 'So you can log back in anytime'
          : 'Save your entry and track your progress'}
      </p>

      {/* Show email (read-only) */}
      {email && (
        <div className="entry-form-field">
          <label className="entry-label">Email</label>
          <div className="entry-input-icon">
            <Mail size={18} />
            <input
              type="email"
              className="entry-input"
              value={email}
              disabled
              style={{ opacity: 0.6 }}
            />
          </div>
        </div>
      )}

      <div className="entry-form-field">
        <label className="entry-label">Password *</label>
        <div className="entry-input-icon entry-input-password">
          <Lock size={18} />
          <input
            type={showPassword ? 'text' : 'password'}
            className="entry-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
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

      <div className="entry-form-field">
        <label className="entry-label">Confirm Password *</label>
        <div className="entry-input-icon">
          <Lock size={18} />
          <input
            type={showPassword ? 'text' : 'password'}
            className="entry-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            autoComplete="new-password"
          />
        </div>
      </div>

      {(validationError || error) && (
        <p className="entry-error">{validationError || error}</p>
      )}

      <button
        type="submit"
        className="entry-btn-primary"
        disabled={isSubmitting}
      >
        {isSubmitting
          ? (isSettingPassword ? 'Setting password...' : 'Creating account...')
          : (isSettingPassword ? 'Set Password & Continue' : 'Create Account & Continue')}
      </button>

      {showForgot && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          {resetStatus === 'sent' ? (
            <p className="entry-step-subtitle" style={{ margin: 0 }}>
              Password reset email sent to {email}. Check your inbox, then come
              back and continue.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleForgotPassword}
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
                {resetStatus === 'sending'
                  ? 'Sending reset email...'
                  : 'Already have an account? Reset your password'}
              </button>
              {resetError && <p className="entry-error">{resetError}</p>}
            </>
          )}
        </div>
      )}
    </form>
  );
}
