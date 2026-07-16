import React from 'react';
import { Mail, EyeOff, Bell, CheckCircle2 } from 'lucide-react';

/**
 * Nomination: Nominator's info (name, email, anonymous toggle)
 *
 * When the nominator is logged in we already know who they are, so we skip the
 * name + email inputs entirely and show a read-only identity confirmation. Only
 * the anonymous / notify choices remain, since those are still theirs to make.
 */
export default function NominatorInfoStep({
  data,
  onChange,
  onSubmit,
  isSubmitting,
  error,
  isLoggedIn = false,
}) {
  const isValid = isLoggedIn
    ? data.email.trim() && data.email.includes('@')
    : data.name.trim() && data.email.trim() && data.email.includes('@');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isValid) onSubmit();
  };

  return (
    <form className="entry-step entry-step-nominator" onSubmit={handleSubmit}>
      <h2 className="entry-step-title">About you</h2>
      <p className="entry-step-subtitle">
        {isLoggedIn
          ? "You're signed in, so we've got your details covered"
          : "We'll send you an email to confirm your nomination has been recorded"}
      </p>

      {isLoggedIn ? (
        <div className="entry-identity-card">
          <CheckCircle2 size={20} className="entry-identity-check" />
          <div className="entry-identity-info">
            {data.name && <span className="entry-identity-name">{data.name}</span>}
            <span className="entry-identity-email">{data.email}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="entry-form-field">
            <label className="entry-label">Your Name *</label>
            <input
              type="text"
              className="entry-input"
              value={data.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Your full name"
              autoComplete="name"
            />
          </div>

          <div className="entry-form-field">
            <label className="entry-label">Your Email *</label>
            <div className="entry-input-icon">
              <Mail size={18} />
              <input
                type="email"
                className="entry-input"
                value={data.email}
                onChange={(e) => onChange({ email: e.target.value })}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
          </div>
        </>
      )}

      {/* Anonymous toggle */}
      <button
        type="button"
        className={`entry-anonymous-toggle ${data.anonymous ? 'active' : ''}`}
        onClick={() => onChange({ anonymous: !data.anonymous })}
      >
        <EyeOff size={18} />
        <span>Keep my identity anonymous</span>
        <span className={`entry-toggle-switch ${data.anonymous ? 'on' : ''}`} />
      </button>

      {/* Email opt-in toggle */}
      <button
        type="button"
        className={`entry-anonymous-toggle ${data.emailOptIn ? 'active' : ''}`}
        onClick={() => onChange({ emailOptIn: !data.emailOptIn })}
      >
        <Bell size={18} />
        <span>Get updates on the competition & nominee performance</span>
        <span className={`entry-toggle-switch ${data.emailOptIn ? 'on' : ''}`} />
      </button>

      {error && <p className="entry-error">{error}</p>}

      <button
        type="submit"
        className="entry-btn-primary"
        disabled={!isValid || isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Nomination'}
      </button>
    </form>
  );
}
