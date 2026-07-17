import React, { useRef } from 'react';
import { Instagram, Camera, X, Mail } from 'lucide-react';
import { isValidEmail } from '../../../utils/validators/email';

/**
 * Nomination: nominee info (name, email, instagram, optional photo).
 *
 * When `splitByGender` is true the competition divides winners male/female,
 * so the nominator must record the nominee's gender.
 */
export default function NomineeInfoStep({
  data,
  onChange,
  onNext,
  error,
  splitByGender = false,
}) {
  const inputRef = useRef(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('Photo must be under 20MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    onChange({ photoFile: file, photoPreview: previewUrl });
  };

  // Email is required and must be a real address. The nominees table enforces
  // a contact method (CHECK email IS NOT NULL OR phone IS NOT NULL) and this
  // flow doesn't collect a phone, so a nominee with no email can't be saved.
  // Previously the field only checked non-empty, so nominators who didn't know
  // the address typed filler ("idk", "n/a") to advance — that junk got stored
  // and then bounced on invite. Validating the format blocks that; people who
  // genuinely don't have the email use the "send them the link" button below.
  const emailEntered = data.email?.trim();
  const emailValid = isValidEmail(data.email);

  const isValid =
    data.name.trim() &&
    emailValid &&
    data.instagram?.trim() &&
    (!splitByGender || data.gender === 'male' || data.gender === 'female');

  return (
    <div className="entry-step entry-step-nominee">
      <h2 className="entry-step-title">Who are you nominating?</h2>
      <p className="entry-step-subtitle">Tell us about them</p>

      {/* Optional photo */}
      <div className="entry-nominee-photo-row">
        {data.photoPreview ? (
          <div className="entry-nominee-photo-thumb">
            <img src={data.photoPreview} alt="Nominee" />
            <button
              className="entry-photo-remove-sm"
              onClick={() => onChange({ photoFile: null, photoPreview: '' })}
              type="button"
              aria-label="Remove photo"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            className="entry-nominee-photo-add"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Camera size={20} />
          </button>
        )}
        <span className="entry-nominee-photo-label">
          {data.photoPreview ? 'Photo added' : 'Add their photo (optional)'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoChange}
          className="entry-photo-input"
        />
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Their Name *</label>
        <input
          type="text"
          className="entry-input"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Full name"
        />
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Their Email *</label>
        <div className="entry-input-icon">
          <Mail size={18} />
          <input
            type="email"
            className="entry-input"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="email@example.com"
          />
        </div>
        {emailEntered && !emailValid && (
          <p className="entry-error">Enter a valid email address (e.g. name@example.com).</p>
        )}
      </div>

      <div className="entry-form-field">
        <label className="entry-label">Instagram Handle *</label>
        <div className="entry-input-icon">
          <Instagram size={18} />
          <input
            type="text"
            className="entry-input"
            value={data.instagram}
            onChange={(e) =>
              onChange({ instagram: e.target.value.replace('@', '') })
            }
            placeholder="username"
          />
        </div>
      </div>

      {splitByGender && (
        <div className="entry-form-field">
          <label className="entry-label">Their Gender *</label>
          <div className="entry-gender-options">
            <label className={`entry-gender-option ${data.gender === 'male' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="nominee-gender"
                value="male"
                checked={data.gender === 'male'}
                onChange={() => onChange({ gender: 'male' })}
              />
              <span>Male</span>
            </label>
            <label className={`entry-gender-option ${data.gender === 'female' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="nominee-gender"
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
        className="entry-btn-primary"
        disabled={!isValid}
        onClick={onNext}
      >
        Continue
      </button>

      <button
        type="button"
        className="entry-link-btn"
        onClick={() => {
          const url = `${window.location.origin}${window.location.pathname}`;
          const msg = `Nominations are open for Most Eligible Bachelorettes! Enter at this link: ${url}`;
          if (navigator.share) {
            navigator.share({ text: msg }).catch(() => {});
          } else {
            window.location.href = `sms:&body=${encodeURIComponent(msg)}`;
          }
        }}
      >
        Don't know their email? Send them the link instead
      </button>
    </div>
  );
}
