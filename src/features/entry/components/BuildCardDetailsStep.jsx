import React, { useEffect } from 'react';
import { Mail, Instagram, MapPin, Calendar } from 'lucide-react';

// Derive whole-year age from a YYYY-MM-DD birthdate string.
function ageFromBirthdate(birthdate) {
  if (!birthdate) return null;
  const dob = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

/**
 * BuildCardDetailsStep - Unified details for ALL nominees
 * Collects: firstName, lastName, birthdate (→ age), location, email, instagram
 * Pre-fills from profile (logged-in) or nominee record (third-party)
 */
export default function BuildCardDetailsStep({
  data,
  onChange,
  onNext,
  error,
  isSubmitting,
  splitByGender = false,
  emailLocked = false,
}) {
  const handleChange = (field) => (e) => {
    onChange({ [field]: e.target.value });
  };

  // Birthdate is the single source of truth; age is always derived from it so
  // everything downstream (card display, eligibility, DB) keeps working off
  // `age` — and a prefilled DOB can never desync from a stale age field.
  const derivedAge = ageFromBirthdate(data.birthdate);

  const handleBirthdate = (e) => {
    onChange({ birthdate: e.target.value });
  };

  // Keep the stored `age` in sync with the birthdate, including prefilled DOBs
  // that never passed through the change handler.
  useEffect(() => {
    const a = derivedAge != null ? String(derivedAge) : '';
    if ((data.age || '') !== a) onChange({ age: a });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.birthdate]);

  const todayStr = new Date().toISOString().split('T')[0];

  const hasEmail = data.email?.trim() && data.email.includes('@');

  const isValid =
    data.firstName?.trim() &&
    data.lastName?.trim() &&
    hasEmail &&
    data.birthdate &&
    derivedAge != null &&
    derivedAge >= 18 &&
    data.location?.trim() &&
    data.instagram?.trim() &&
    (!splitByGender || data.gender === 'male' || data.gender === 'female');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isValid) onNext();
  };

  return (
    <form className="entry-step entry-step-details" onSubmit={handleSubmit}>
      <h2 className="entry-step-title">Your details</h2>
      <p className="entry-step-subtitle">Tell us about yourself</p>

      <div className="entry-form-row">
        <div className="entry-form-field">
          <label className="entry-label">First Name *</label>
          <input
            type="text"
            className="entry-input"
            value={data.firstName || ''}
            onChange={handleChange('firstName')}
            placeholder="First name"
            autoComplete="given-name"
          />
        </div>
        <div className="entry-form-field">
          <label className="entry-label">Last Name *</label>
          <input
            type="text"
            className="entry-input"
            value={data.lastName || ''}
            onChange={handleChange('lastName')}
            placeholder="Last name"
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Date of Birth *</label>
        <div className="entry-input-icon">
          <Calendar size={18} />
          <input
            type="date"
            className="entry-input"
            value={data.birthdate || ''}
            onChange={handleBirthdate}
            max={todayStr}
            autoComplete="bday"
          />
        </div>
        {data.birthdate && derivedAge != null && derivedAge < 18 && (
          <p className="entry-hint">You must be at least 18 to enter.</p>
        )}
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Location *</label>
        <div className="entry-input-icon">
          <MapPin size={18} />
          <input
            type="text"
            className="entry-input"
            value={data.location || ''}
            onChange={handleChange('location')}
            placeholder="e.g., Austin, TX"
            autoComplete="address-level2"
          />
        </div>
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Email *</label>
        <div className="entry-input-icon">
          <Mail size={18} />
          <input
            type="email"
            className="entry-input"
            value={data.email || ''}
            onChange={handleChange('email')}
            placeholder="your@email.com"
            autoComplete="email"
            readOnly={emailLocked}
            disabled={emailLocked}
            style={emailLocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          />
        </div>
        {emailLocked && (
          <p className="entry-hint">Your entry is tied to your account email.</p>
        )}
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Instagram *</label>
        <div className="entry-input-icon">
          <Instagram size={18} />
          <input
            type="text"
            className="entry-input"
            value={data.instagram || ''}
            onChange={(e) =>
              onChange({ instagram: e.target.value.replace('@', '') })
            }
            placeholder="username"
          />
        </div>
      </div>

      {splitByGender && (
        <div className="entry-form-field">
          <label className="entry-label">Gender *</label>
          <div className="entry-gender-options">
            <label className={`entry-gender-option ${data.gender === 'male' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="self-gender"
                value="male"
                checked={data.gender === 'male'}
                onChange={() => onChange({ gender: 'male' })}
              />
              <span>Male</span>
            </label>
            <label className={`entry-gender-option ${data.gender === 'female' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="self-gender"
                value="female"
                checked={data.gender === 'female'}
                onChange={() => onChange({ gender: 'female' })}
              />
              <span>Female</span>
            </label>
          </div>
          <p className="entry-hint">Legally and medically recognized.</p>
        </div>
      )}

      {error && <p className="entry-error">{error}</p>}

      <button
        type="submit"
        className="entry-btn-primary"
        disabled={!isValid || isSubmitting}
      >
        {isSubmitting ? 'Saving...' : 'Continue'}
      </button>
    </form>
  );
}
