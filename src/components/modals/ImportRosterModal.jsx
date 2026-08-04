import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check, Loader, ImagePlus, CheckCircle, AlertTriangle, XCircle, X,
} from 'lucide-react';
import { Modal, Button } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { uploadPhoto } from '../../features/entry/utils/uploadPhoto';

/**
 * ImportRosterModal
 *
 * Adds a host's roster to a competition one person at a time via a structured
 * form — individual fields plus a photo, so there's no CSV parsing to get
 * wrong. Each submit creates a real account (or links an existing one), adds
 * the person directly as an active contestant, and emails them: new sign-ups
 * get a "claim your account & start campaigning" link, existing accounts get a
 * "get your profile campaign ready" nudge. The heavy lifting is done
 * server-side by the bulk-import-contestants edge function via `onImport`
 * (called with a single-element array).
 *
 * After each add the form clears so the host can keep going; a running tally
 * and a per-add confirmation keep them oriented.
 */

const isEmailish = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

// The host only supplies what they have on their roster (name, email, photo,
// social handle). Contestants fill in their own age, city, phone, and bio when
// they claim their profile.
const EMPTY_FORM = {
  name: '',
  email: '',
  instagram: '',
  gender: '',
  avatarUrl: '',
};

export default function ImportRosterModal({
  isOpen,
  onClose,
  onImport,
  splitByGender = false,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [banner, setBanner] = useState(null); // { kind: 'success'|'skip'|'error', text }
  const photoInputRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setUploading(false);
      setSubmitting(false);
      setAddedCount(0);
      setBanner(null);
    }
  }, [isOpen]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handlePhoto = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, 'nominations');
      setForm((f) => ({ ...f, avatarUrl: url }));
    } catch (err) {
      console.error('Photo upload failed:', err);
      setBanner({ kind: 'error', text: err?.message || 'Photo upload failed. Try a different image.' });
    } finally {
      setUploading(false);
    }
  }, []);

  const genderValid = !splitByGender || form.gender === 'male' || form.gender === 'female';
  const canSubmit =
    !submitting && !uploading &&
    form.name.trim().length > 0 &&
    isEmailish(form.email) &&
    genderValid;

  const handleSubmit = async () => {
    if (!canSubmit || !onImport) return;
    setSubmitting(true);
    setBanner(null);
    const name = form.name.trim();
    try {
      const row = {
        name,
        email: form.email.trim(),
        instagram: form.instagram.trim() || null,
        gender: splitByGender ? form.gender : (form.gender || null),
        avatar_url: form.avatarUrl || null,
      };
      const res = await onImport([row]);

      const created = res?.created || [];
      const skipped = res?.skipped || [];
      const errors = res?.errors || [];

      if (created.length > 0) {
        setAddedCount((c) => c + 1);
        // Someone who already had an account keeps their existing login, so no
        // claim email is sent — say so instead of implying we emailed them.
        const entry = created[0];
        const shownName = entry?.name || name;
        setBanner({
          kind: 'success',
          text: entry?.existingAccount
            ? `Added to your lineup as "${shownName}" — this email already has an account, so their own profile details were kept. We emailed them a nudge to get their profile campaign ready.`
            : `${name} added — they've been emailed a link to claim their account and start campaigning.`,
        });
        setForm(EMPTY_FORM);
        // Return focus to the top of the form for the next person.
        setTimeout(() => nameInputRef.current?.focus(), 0);
      } else if (errors.length > 0) {
        setBanner({ kind: 'error', text: errors[0].error || 'Could not add this contestant.' });
      } else if (skipped.length > 0) {
        setBanner({ kind: 'skip', text: `${name} was skipped — ${skipped[0].reason || 'already in this competition'}.` });
      } else if (res?.success === false) {
        setBanner({ kind: 'error', text: res.error || 'Could not add this contestant.' });
      } else {
        setBanner({ kind: 'error', text: 'Could not add this contestant.' });
      }
    } catch (err) {
      console.error('Add contestant failed:', err);
      setBanner({ kind: 'error', text: err?.message || 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Contestant"
      maxWidth="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {addedCount > 0 ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} icon={submitting ? Loader : Check}>
            {submitting ? 'Adding...' : 'Add Contestant'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, margin: 0, lineHeight: 1.6 }}>
          Add someone from your roster. They're added straight to your contestant
          lineup with an account — new sign-ups are emailed a link to claim their
          account and start campaigning; people who already have an account get a
          nudge to make their profile campaign ready.
        </p>

        {addedCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.xs,
            fontSize: typography.fontSize.xs, color: colors.text.muted,
          }}>
            <CheckCircle size={13} style={{ color: colors.status.success, flexShrink: 0 }} />
            {addedCount} added this session — the form clears after each so you can keep going.
          </div>
        )}

        {/* Photo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            title="Add photo"
            style={{
              width: 72, height: 72, borderRadius: borderRadius.full,
              border: `1px solid ${colors.border.primary}`,
              background: form.avatarUrl ? `url(${form.avatarUrl}) center/cover` : colors.background.secondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: colors.text.muted, padding: 0, flexShrink: 0,
            }}
          >
            {uploading
              ? <Loader size={20} style={{ animation: 'spin 1s linear infinite', color: colors.gold.primary }} />
              : !form.avatarUrl && <ImagePlus size={22} />}
          </button>
          <div>
            <p style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.text.primary, margin: 0 }}>
              Profile photo
            </p>
            <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, margin: `2px 0 0` }}>
              {form.avatarUrl ? 'Tap the photo to replace it.' : 'Optional. JPG, PNG, or WebP.'}
            </p>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => { handlePhoto(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {/* Fields — only what the host has on their roster. Contestants add
            their own age, city, phone, and bio when they claim their profile. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
          <Field label="Full name" required value={form.name} onChange={(v) => update('name', v)} placeholder="Jane Doe" inputRef={nameInputRef} span={2} />
          <Field label="Email" required type="text" inputMode="email" autoComplete="off" value={form.email} onChange={(v) => update('email', v)} placeholder="jane@example.com" span={2} />
          <Field label="Instagram" value={form.instagram} onChange={(v) => update('instagram', v)} placeholder="@janedoe" span={2} />

          {splitByGender && (
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              <span style={fieldLabelStyle}>
                Gender <span style={{ color: colors.status.error }}>*</span>
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs }}>
                {[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }].map((opt) => {
                  const active = form.gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update('gender', opt.value)}
                      style={{
                        padding: `${spacing.sm} ${spacing.md}`,
                        background: active ? 'rgba(212,175,55,0.22)' : colors.background.secondary,
                        border: `1px solid ${active ? colors.gold.primary : colors.border.primary}`,
                        borderRadius: borderRadius.lg,
                        color: active ? colors.gold.primary : colors.text.secondary,
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.medium,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: colors.text.muted, fontSize: typography.fontSize.xs, margin: 0 }}>
          <CheckCircle size={13} style={{ color: colors.gold.primary, flexShrink: 0 }} />
          Contestants will be able to update their profile independently after they claim their profile.
        </p>

        {banner && <Banner banner={banner} onDismiss={() => setBanner(null)} />}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Modal>
  );
}

const fieldLabelStyle = {
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.medium,
  color: colors.text.secondary,
};

function Field({ label, value, onChange, placeholder, type = 'text', required = false, invalid = false, inputRef, span = 1, inputMode, autoComplete }) {
  return (
    <label style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <span style={fieldLabelStyle}>
        {label}{required && <span style={{ color: colors.status.error }}> *</span>}
      </span>
      <input
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: spacing.md,
          background: colors.background.secondary,
          border: `1px solid ${invalid ? colors.status.error : colors.border.light}`,
          borderRadius: borderRadius.lg,
          color: colors.text.primary,
          fontSize: typography.fontSize.md,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

function Banner({ banner, onDismiss }) {
  const config = {
    success: { color: colors.status.success, bg: colors.status.successMuted, Icon: CheckCircle },
    skip: { color: colors.status.warning, bg: colors.status.warningMuted, Icon: AlertTriangle },
    error: { color: colors.status.error, bg: colors.status.errorMuted, Icon: XCircle },
  }[banner.kind] || {};
  const { color, bg, Icon } = config;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
      padding: spacing.md,
      background: bg,
      border: `1px solid ${color}`,
      borderRadius: borderRadius.lg,
    }}>
      {Icon && <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />}
      <span style={{ flex: 1, minWidth: 0, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
        {banner.text}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.muted, padding: 0, flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
