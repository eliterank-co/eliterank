import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { EliteRankCrown } from '../../components/ui';
import { colors, gradients, shadows, borderRadius, spacing, typography } from '../../styles/theme';
import { supabase } from '../../lib/supabase';

/**
 * ResetPasswordPage - Password reset flow
 * 
 * Handles the password reset when user clicks the email link.
 * Supabase passes recovery token in URL hash.
 */
export default function ResetPasswordPage({ onComplete, onBack }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // A recovery link that still carries an UNSPENT token: the email points here
  // with `?token_hash=...&type=recovery` instead of at Supabase's GET
  // /auth/v1/verify. Exchanging it is deferred to an explicit click below,
  // because mail-security scanners (Microsoft EOP and friends) pre-fetch links
  // to scan them and would otherwise spend the single-use token before the
  // recipient ever taps it.
  const [pendingToken, setPendingToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    return tokenHash ? { tokenHash, type: params.get('type') || 'recovery' } : null;
  });

  // On mount, check if we have a valid recovery session
  useEffect(() => {
    // Holding an unspent token, so there is nothing to wait for — the session
    // gets created on confirm, not on load.
    if (pendingToken) {
      setCheckingSession(false);
      return undefined;
    }

    let cancelled = false;
    let subscription = null;
    let timeoutId = null;

    const checkSession = async () => {
      try {
        // Listen for auth state changes FIRST so we don't miss events
        // that fire while we're checking the initial session
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (cancelled) return;
          if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
            setSessionReady(true);
            setCheckingSession(false);
            if (timeoutId) clearTimeout(timeoutId);
          }
        });
        subscription = data.subscription;

        // Now check if a session already exists (e.g. token was already processed)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (cancelled) return;

        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Invalid or expired reset link. Please request a new one.');
          setCheckingSession(false);
          return;
        }

        if (session) {
          setSessionReady(true);
          setCheckingSession(false);
          return;
        }

        // No session yet - Supabase may still be exchanging the PKCE code
        // or processing the hash tokens. Wait up to 5 seconds, retrying periodically.
        let retryCount = 0;
        const maxRetries = 4;

        const retryCheck = async () => {
          if (cancelled) return;
          retryCount++;

          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (cancelled) return;

          if (retrySession) {
            setSessionReady(true);
            setCheckingSession(false);
          } else if (retryCount < maxRetries) {
            timeoutId = setTimeout(retryCheck, 1500);
          } else {
            setError('Invalid or expired reset link. Please request a new one.');
            setCheckingSession(false);
          }
        };

        timeoutId = setTimeout(retryCheck, 1000);
      } catch (err) {
        if (cancelled) return;
        console.error('Check session error:', err);
        setError('Something went wrong. Please try again.');
        setCheckingSession(false);
      }
    };

    checkSession();

    return () => {
      cancelled = true;
      if (subscription) subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Spend the one-time recovery token. Only ever called from a click.
  const handleConfirmReset = async () => {
    setConfirming(true);
    setError('');

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: pendingToken.tokenHash,
        type: pendingToken.type,
      });

      if (verifyError) {
        setError('Invalid or expired reset link. Please request a new one.');
        setPendingToken(null);
        return;
      }

      setPendingToken(null);
      setSessionReady(true);
    } catch (err) {
      console.error('Verify recovery token error:', err);
      setError('Invalid or expired reset link. Please request a new one.');
      setPendingToken(null);
    } finally {
      setConfirming(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      
      // Auto-redirect after success
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, 2000);
    } catch (err) {
      console.error('Password update error:', err);
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Styles (matching LoginPage)
  const containerStyle = {
    minHeight: '100vh',
    background: gradients.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    fontFamily: typography.fontFamily,
  };

  const cardStyle = {
    background: colors.background.card,
    border: `1px solid ${colors.border.gold}`,
    borderRadius: borderRadius.xxl,
    padding: spacing.xxxl,
    width: '100%',
    maxWidth: '440px',
    boxShadow: shadows.goldLarge,
  };

  const logoStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  };

  const titleStyle = {
    fontSize: typography.fontSize.hero,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.sm,
  };

  const subtitleStyle = {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
  };

  const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  };

  const inputGroupStyle = {
    position: 'relative',
  };

  const labelStyle = {
    display: 'block',
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  };

  const inputWrapperStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  };

  const inputIconStyle = {
    position: 'absolute',
    left: spacing.md,
    color: colors.text.muted,
    pointerEvents: 'none',
  };

  const inputStyle = {
    width: '100%',
    padding: `${spacing.md} ${spacing.lg}`,
    paddingLeft: '44px',
    background: colors.background.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.lg,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    outline: 'none',
    transition: 'all 0.2s ease',
  };

  const buttonStyle = {
    width: '100%',
    padding: spacing.lg,
    background: gradients.gold,
    border: 'none',
    borderRadius: borderRadius.lg,
    color: '#0a0a0f',
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    cursor: isLoading ? 'wait' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    boxShadow: shadows.gold,
    transition: 'all 0.2s ease',
    opacity: isLoading ? 0.7 : 1,
    marginTop: spacing.md,
  };

  const alertStyle = (type) => ({
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    background: type === 'error' ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
    border: `1px solid ${type === 'error' ? colors.status.error : colors.status.success}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: type === 'error' ? colors.status.error : colors.status.success,
    fontSize: typography.fontSize.sm,
  });

  const footerStyle = {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
  };

  const handleInputFocus = (e) => {
    e.target.style.borderColor = colors.gold.primary;
    e.target.style.boxShadow = `0 0 0 3px rgba(212,175,55,0.1)`;
  };

  const handleInputBlur = (e) => {
    e.target.style.borderColor = colors.border.light;
    e.target.style.boxShadow = 'none';
  };

  // Loading state
  if (checkingSession) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>
            <EliteRankCrown size={56} />
            <h1 style={{ ...titleStyle, marginTop: '8px' }}>
              <span style={{ color: '#ffffff' }}>Elite</span>
              <span style={{
                background: 'linear-gradient(90deg, #d4af37, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Rank</span>
            </h1>
            <p style={subtitleStyle}>Verifying reset link...</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: spacing.xl }}>
            <span style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(212,175,55,0.3)',
              borderTopColor: colors.gold.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>
            <EliteRankCrown size={56} />
            <h1 style={{ ...titleStyle, marginTop: '8px' }}>
              <span style={{ color: '#ffffff' }}>Elite</span>
              <span style={{
                background: 'linear-gradient(90deg, #d4af37, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Rank</span>
            </h1>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: 'rgba(74, 222, 128, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <CheckCircle size={32} style={{ color: colors.status.success }} />
            </div>
            <h3 style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              marginBottom: spacing.md,
            }}>
              Password Updated!
            </h3>
            <p style={{
              fontSize: typography.fontSize.md,
              color: colors.text.secondary,
              marginBottom: spacing.lg,
            }}>
              Your password has been reset successfully. Redirecting you now...
            </p>
          </div>

          <p style={footerStyle}>© 2025 EliteRank. All rights reserved.</p>
        </div>
      </div>
    );
  }

  // Confirm state — holding an unspent token, waiting on a human click.
  if (pendingToken) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={logoStyle}>
            <EliteRankCrown size={56} />
            <h1 style={{ ...titleStyle, marginTop: '8px' }}>
              <span style={{ color: '#ffffff' }}>Elite</span>
              <span style={{
                background: 'linear-gradient(90deg, #d4af37, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Rank</span>
            </h1>
            <p style={subtitleStyle}>Reset your password</p>
          </div>

          <p style={{
            fontSize: typography.fontSize.md,
            color: colors.text.secondary,
            textAlign: 'center',
            marginBottom: spacing.lg,
          }}>
            <span>Tap the button below to continue setting a new password.</span>
          </p>

          <button
            type="button"
            onClick={handleConfirmReset}
            disabled={confirming}
            style={buttonStyle}
          >
            {confirming ? (
              <>
                <span style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(0,0,0,0.3)',
                  borderTopColor: '#0a0a0f',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>Set My Password</span>
              </>
            )}
          </button>

          <p style={footerStyle}>© 2025 EliteRank. All rights reserved.</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error state (invalid/expired link)
  if (error && !sessionReady) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                background: 'none',
                border: 'none',
                color: colors.text.secondary,
                fontSize: typography.fontSize.sm,
                cursor: 'pointer',
                marginBottom: spacing.lg,
                padding: 0,
              }}
            >
              <ArrowLeft size={16} />
              Back to login
            </button>
          )}

          <div style={logoStyle}>
            <EliteRankCrown size={56} />
            <h1 style={{ ...titleStyle, marginTop: '8px' }}>
              <span style={{ color: '#ffffff' }}>Elite</span>
              <span style={{
                background: 'linear-gradient(90deg, #d4af37, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Rank</span>
            </h1>
          </div>

          <div style={alertStyle('error')}>
            <AlertCircle size={16} />
            {error}
          </div>

          <button
            onClick={onBack}
            style={{
              ...buttonStyle,
              background: 'transparent',
              border: `1px solid ${colors.border.light}`,
              color: colors.text.secondary,
              boxShadow: 'none',
            }}
          >
            Request New Reset Link
          </button>

          <p style={footerStyle}>© 2025 EliteRank. All rights reserved.</p>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div style={containerStyle}>
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.1) 0%, transparent 50%)', pointerEvents: 'none' }} />

      <div style={cardStyle}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              background: 'none',
              border: 'none',
              color: colors.text.secondary,
              fontSize: typography.fontSize.sm,
              cursor: 'pointer',
              marginBottom: spacing.lg,
              padding: 0,
            }}
          >
            <ArrowLeft size={16} />
            Back to login
          </button>
        )}

        <div style={logoStyle}>
          <EliteRankCrown size={56} />
          <h1 style={{ ...titleStyle, marginTop: '8px' }}>
            <span style={{ color: '#ffffff' }}>Elite</span>
            <span style={{
              background: 'linear-gradient(90deg, #d4af37, #c9a227)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Rank</span>
          </h1>
          <p style={subtitleStyle}>Set your new password</p>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          {error && (
            <div style={alertStyle('error')}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div style={inputGroupStyle}>
            <label style={labelStyle}>New Password</label>
            <div style={inputWrapperStyle}>
              <Lock size={18} style={inputIconStyle} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                style={{ ...inputStyle, paddingRight: '44px' }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: spacing.md,
                  background: 'none',
                  border: 'none',
                  color: colors.text.muted,
                  cursor: 'pointer',
                  padding: spacing.xs,
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>Confirm New Password</label>
            <div style={inputWrapperStyle}>
              <Lock size={18} style={inputIconStyle} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button type="submit" disabled={isLoading} style={buttonStyle}>
            {isLoading ? (
              <>
                <span style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(0,0,0,0.3)',
                  borderTopColor: '#0a0a0f',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Updating password...
              </>
            ) : (
              'Update Password'
            )}
          </button>
        </form>

        <p style={footerStyle}>© 2025 EliteRank. All rights reserved.</p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
