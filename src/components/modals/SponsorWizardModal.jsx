import React, { useEffect, useRef, useState } from 'react';
import { Check, Camera, Loader, X, Plus, Trash2, Briefcase, Gift } from 'lucide-react';
import { Modal, Button } from '../ui';
import { colors, spacing, borderRadius, typography, transitions } from '../../styles/theme';
import { uploadPhoto } from '../../features/entry/utils/uploadPhoto';

const VISIBILITY_TIERS = [
  { key: 'platinum', label: 'Platinum', cap: 1, color: colors.tier.platinum },
  { key: 'gold', label: 'Gold', cap: 2, color: colors.tier.gold },
  { key: 'silver', label: 'Silver', cap: 3, color: colors.tier.silver },
];

const RECIPIENT_OPTIONS = [
  { key: 'winners', label: 'Winners only', hint: 'Becomes a winner prize package' },
  { key: 'top_x', label: 'Top X contestants', hint: "You'll specify how many" },
  { key: 'all', label: 'All contestants', hint: 'Every participant receives it' },
];

// Only offered when the competition crowns winners split by gender. Lets a host
// send a prize to just the men or just the women (e.g. the male winner gets the
// watch, the female winner does not). Defaults to 'all' — no restriction.
const GENDER_OPTIONS = [
  { key: 'all', label: 'Everyone', hint: 'Men and women both receive it' },
  { key: 'male', label: 'Men only', hint: 'Only male recipients receive it' },
  { key: 'female', label: 'Women only', hint: 'Only female recipients receive it' },
];

const emptyPrize = () => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  value: '',
  imageUrl: '',
});

const INITIAL_STATE = {
  name: '',
  logoUrl: '',
  websiteUrl: '',
  sponsorshipType: '',
  value: '',
  visibilityTier: '',
  providesContestantRewards: false,
  recipient: '',
  topXCount: '',
  recipientGender: 'all',
  prizes: [],
};

export default function SponsorWizardModal({
  isOpen,
  onClose,
  sponsor,
  tierAvailability = { platinum: 1, gold: 2, silver: 3 },
  genderSplit = false,
  onSave,
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(sponsor || INITIAL_STATE);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPrizeId, setUploadingPrizeId] = useState(null);
  const logoInputRef = useRef(null);
  const prizeInputRef = useRef(null);
  const isEditing = !!sponsor;

  // The wizard stays mounted while the dashboard is open, so the useState
  // initializers above only ever capture the first (empty) render. Without this
  // sync, clicking "Edit" shows a blank form even though the sponsor saved fine.
  // Re-seed the form from the sponsor each time the modal opens, and reset to
  // step 1. Depend only on `isOpen`: `sponsor` is rebuilt (sponsorToWizardForm)
  // on every parent render, so including it would clobber in-progress edits on
  // each keystroke.
  useEffect(() => {
    if (isOpen) {
      setForm(sponsor || INITIAL_STATE);
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const updateField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const updatePrize = (id, key, value) =>
    setForm((f) => ({
      ...f,
      prizes: f.prizes.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    }));

  const addPrize = () => setForm((f) => ({ ...f, prizes: [...f.prizes, emptyPrize()] }));

  const removePrize = (id) =>
    setForm((f) => ({ ...f, prizes: f.prizes.filter((p) => p.id !== id) }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadPhoto(file, 'sponsors');
      if (url) updateField('logoUrl', url);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handlePrizeImageUpload = async (e, prizeId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPrizeId(prizeId);
    try {
      const url = await uploadPhoto(file, 'prizes');
      if (url) updatePrize(prizeId, 'imageUrl', url);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingPrizeId(null);
    }
  };

  const isInKind = form.sponsorshipType === 'in_kind';
  const step1Valid = form.name.trim().length > 0;
  const step2Valid =
    form.sponsorshipType &&
    form.value !== '' &&
    (form.sponsorshipType !== 'paid' || !!form.visibilityTier);
  const mustProvideRewards = isInKind || form.providesContestantRewards;
  const step3Valid = mustProvideRewards
    ? form.recipient &&
      (form.recipient !== 'top_x' || parseInt(form.topXCount, 10) > 0) &&
      form.prizes.length > 0 &&
      form.prizes.every((p) => p.title.trim().length > 0)
    : true;

  const canAdvance = step === 1 ? step1Valid : step === 2 ? step2Valid : step3Valid;

  const handleSave = () => {
    onSave({
      ...form,
      value: parseFloat(form.value) || 0,
      topXCount: form.recipient === 'top_x' ? parseInt(form.topXCount, 10) || 0 : null,
      prizes: form.prizes.map((p) => ({
        ...p,
        value: parseFloat(p.value) || 0,
      })),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Sponsor' : 'Add a Sponsor'}
      maxWidth="520px"
      footer={
        <div style={{ display: 'flex', gap: spacing.md, width: '100%' }}>
          <Button
            variant="secondary"
            onClick={() => (step > 1 ? setStep((s) => s - 1) : onClose())}
            style={{ flex: 1 }}
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} style={{ flex: 1 }}>
              Continue
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={!canAdvance} style={{ flex: 1 }}>
              {isEditing ? 'Save Changes' : 'Add Sponsor'}
            </Button>
          )}
        </div>
      }
    >
      <Stepper step={step} />

      {step === 1 && (
        <Step1Identity
          form={form}
          updateField={updateField}
          uploadingLogo={uploadingLogo}
          logoInputRef={logoInputRef}
          handleLogoUpload={handleLogoUpload}
        />
      )}
      {step === 2 && (
        <Step2Deal form={form} updateField={updateField} tierAvailability={tierAvailability} />
      )}
      {step === 3 && (
        <Step3Rewards
          form={form}
          updateField={updateField}
          updatePrize={updatePrize}
          addPrize={addPrize}
          removePrize={removePrize}
          prizeInputRef={prizeInputRef}
          uploadingPrizeId={uploadingPrizeId}
          handlePrizeImageUpload={handlePrizeImageUpload}
          genderSplit={genderSplit}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Modal>
  );
}

// ---------- Step indicator (numbered circles + connector) ----------
function Stepper({ step }) {
  const labels = ['Identity', 'Deal', 'Rewards'];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xxl,
      }}
    >
      {labels.map((label, i) => {
        const n = i + 1;
        const isActive = n === step;
        const isDone = n < step;
        const isUpcoming = n > step;
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: borderRadius.full,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive || isDone ? colors.gold.primary : 'transparent',
                  border: `1px solid ${isUpcoming ? colors.border.primary : colors.gold.primary}`,
                  color: isActive || isDone ? colors.text.inverse : colors.text.tertiary,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  transition: transitions.colors,
                }}
              >
                {isDone ? <Check size={14} /> : n}
              </div>
              <span
                style={{
                  fontSize: typography.fontSize.sm,
                  fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.medium,
                  color: isActive ? colors.text.primary : colors.text.tertiary,
                  transition: transitions.colors,
                }}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                style={{
                  width: '24px',
                  height: '1px',
                  background: n < step ? colors.gold.primary : colors.border.primary,
                  margin: `0 ${spacing.xs}`,
                  transition: transitions.colors,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------- Step 1: Identity ----------
function Step1Identity({ form, updateField, uploadingLogo, logoInputRef, handleLogoUpload }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        onChange={handleLogoUpload}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.sm }}>
        <button
          type="button"
          onClick={() => !uploadingLogo && logoInputRef.current?.click()}
          style={{
            ...cleanButtonStyle,
            width: '96px',
            height: '96px',
            borderRadius: borderRadius.full,
            background: form.logoUrl
              ? `url(${form.logoUrl}) center/cover no-repeat ${colors.background.secondary}`
              : colors.background.secondary,
            border: `1px solid ${colors.border.primary}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: uploadingLogo ? 'wait' : 'pointer',
            position: 'relative',
          }}
        >
          {uploadingLogo ? (
            <Loader size={20} style={{ color: colors.gold.primary, animation: 'spin 1s linear infinite' }} />
          ) : form.logoUrl ? null : (
            <>
              <Camera size={20} style={{ color: colors.text.muted }} />
              <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: spacing.xs }}>
                Logo
              </span>
            </>
          )}
        </button>
        {form.logoUrl && (
          <button
            type="button"
            onClick={() => updateField('logoUrl', '')}
            style={{
              ...cleanButtonStyle,
              fontSize: typography.fontSize.xs,
              color: colors.text.muted,
              cursor: 'pointer',
              padding: spacing.xs,
            }}
          >
            Remove logo
          </button>
        )}
      </div>

      <Field label="Brand / Company Name *">
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="e.g., Luxe Hotels"
          style={inputStyle}
        />
      </Field>

      <Field label="Website URL">
        <input
          type="url"
          value={form.websiteUrl}
          onChange={(e) => updateField('websiteUrl', e.target.value)}
          placeholder="https://..."
          style={inputStyle}
        />
      </Field>

      <Field label="Or paste logo URL">
        <input
          type="url"
          value={form.logoUrl}
          onChange={(e) => updateField('logoUrl', e.target.value)}
          placeholder="https://..."
          style={inputStyle}
        />
      </Field>
    </div>
  );
}

// ---------- Step 2: Deal ----------
function Step2Deal({ form, updateField, tierAvailability }) {
  const isPaid = form.sponsorshipType === 'paid';
  const isInKind = form.sponsorshipType === 'in_kind';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <Field label="Sponsorship Type *">
        <div style={{ display: 'flex', gap: spacing.md }}>
          <ChoiceCard
            active={isInKind}
            onClick={() => {
              updateField('sponsorshipType', 'in_kind');
              updateField('visibilityTier', '');
            }}
            icon={Gift}
            title="In-kind"
            subtitle="Provides prizes"
          />
          <ChoiceCard
            active={isPaid}
            onClick={() => updateField('sponsorshipType', 'paid')}
            icon={Briefcase}
            title="Paid"
            subtitle="Cash + logo placement"
          />
        </div>
      </Field>

      {form.sponsorshipType && (
        <Field label={isPaid ? 'Cash amount ($) *' : 'Estimated value ($) *'}>
          <input
            type="text"
            inputMode="numeric"
            value={form.value}
            onChange={(e) => updateField('value', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={isPaid ? 'e.g., 25000' : 'e.g., 5000'}
            style={inputStyle}
          />
        </Field>
      )}

      {isPaid && (
        <SectionPanel>
          <div style={{ marginBottom: spacing.md }}>
            <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, fontWeight: typography.fontWeight.medium, marginBottom: spacing.xs }}>
              Visibility tier *
            </div>
            <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
              Paid sponsors appear in a "Sponsored by" strip on the competition page, ordered by tier.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {VISIBILITY_TIERS.map((tier) => {
              const remaining = tierAvailability[tier.key] ?? 0;
              const isCurrent = form.visibilityTier === tier.key;
              const disabled = remaining <= 0 && !isCurrent;
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => !disabled && updateField('visibilityTier', tier.key)}
                  disabled={disabled}
                  style={{
                    ...cleanButtonStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: spacing.md,
                    borderRadius: borderRadius.lg,
                    background: isCurrent ? colors.gold.muted : colors.background.tertiary,
                    border: `1px solid ${isCurrent ? colors.gold.primary : colors.border.primary}`,
                    color: disabled ? colors.text.muted : colors.text.primary,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    textAlign: 'left',
                    transition: transitions.all,
                  }}
                >
                  <div>
                    <div style={{ color: tier.color, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.md }}>
                      {tier.label}
                    </div>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '2px' }}>
                      Cap: {tier.cap} per competition
                    </div>
                  </div>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary }}>
                    {remaining} of {tier.cap} left
                  </div>
                </button>
              );
            })}
          </div>
        </SectionPanel>
      )}
    </div>
  );
}

// ---------- Step 3: Rewards ----------
function Step3Rewards({
  form,
  updateField,
  updatePrize,
  addPrize,
  removePrize,
  prizeInputRef,
  uploadingPrizeId,
  handlePrizeImageUpload,
  genderSplit,
}) {
  const isInKind = form.sponsorshipType === 'in_kind';
  const [activePrizeId, setActivePrizeId] = useState(null);

  React.useEffect(() => {
    if (isInKind && form.prizes.length === 0) {
      updateField('prizes', [emptyPrize()]);
      updateField('providesContestantRewards', true);
    }
  }, [isInKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerUpload = (prizeId) => {
    setActivePrizeId(prizeId);
    prizeInputRef.current?.click();
  };

  const showRewardsForm = isInKind || form.providesContestantRewards;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <input
        ref={prizeInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handlePrizeImageUpload(e, activePrizeId)}
        style={{ display: 'none' }}
      />

      {isInKind ? (
        <div
          style={{
            padding: spacing.md,
            background: colors.gold.muted,
            border: `1px solid ${colors.border.focus}`,
            borderRadius: borderRadius.lg,
            fontSize: typography.fontSize.sm,
            color: colors.text.primary,
            lineHeight: 1.5,
          }}
        >
          In-kind sponsors appear publicly through the prizes they contribute. Add at least one prize below.
        </div>
      ) : (
        <Field label="Providing anything to contestants?">
          <div style={{ display: 'flex', gap: spacing.md }}>
            <YesNoButton
              active={!form.providesContestantRewards}
              variant="no"
              onClick={() => {
                updateField('providesContestantRewards', false);
                updateField('recipient', '');
                updateField('topXCount', '');
                updateField('prizes', []);
              }}
            >
              No, logo only
            </YesNoButton>
            <YesNoButton
              active={form.providesContestantRewards}
              variant="yes"
              onClick={() => {
                updateField('providesContestantRewards', true);
                if (form.prizes.length === 0) updateField('prizes', [emptyPrize()]);
              }}
            >
              Yes, add prizes
            </YesNoButton>
          </div>
        </Field>
      )}

      {showRewardsForm && (
        <>
          <Field label="Who receives? *">
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {RECIPIENT_OPTIONS.map((opt) => {
                const active = form.recipient === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => updateField('recipient', opt.key)}
                    style={{
                      ...cleanButtonStyle,
                      padding: spacing.md,
                      borderRadius: borderRadius.lg,
                      background: active ? colors.gold.muted : colors.background.secondary,
                      border: `1px solid ${active ? colors.gold.primary : colors.border.primary}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: transitions.all,
                    }}
                  >
                    <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.md }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '2px' }}>
                      {opt.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>

          {form.recipient === 'top_x' && (
            <Field label="How many contestants? *">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.topXCount}
                onChange={(e) => updateField('topXCount', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g., 5"
                style={inputStyle}
              />
            </Field>
          )}

          {genderSplit && (
            <Field label="Restrict to a gender?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {GENDER_OPTIONS.map((opt) => {
                  const active = (form.recipientGender || 'all') === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => updateField('recipientGender', opt.key)}
                      style={{
                        ...cleanButtonStyle,
                        padding: spacing.md,
                        borderRadius: borderRadius.lg,
                        background: active ? colors.gold.muted : colors.background.secondary,
                        border: `1px solid ${active ? colors.gold.primary : colors.border.primary}`,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: transitions.all,
                      }}
                    >
                      <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.md }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '2px' }}>
                        {opt.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <label style={labelStyle}>Prize details *</label>
              <button
                type="button"
                onClick={addPrize}
                style={{
                  ...cleanButtonStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  fontSize: typography.fontSize.sm,
                  color: colors.gold.primary,
                  cursor: 'pointer',
                  padding: `${spacing.xs} ${spacing.sm}`,
                }}
              >
                <Plus size={14} /> Add another
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {form.prizes.map((prize, idx) => (
                <PrizeCard
                  key={prize.id}
                  prize={prize}
                  index={idx}
                  canRemove={form.prizes.length > 1}
                  onRemove={() => removePrize(prize.id)}
                  onChange={(key, val) => updatePrize(prize.id, key, val)}
                  onUploadClick={() => triggerUpload(prize.id)}
                  uploading={uploadingPrizeId === prize.id}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PrizeCard({ prize, index, canRemove, onRemove, onChange, onUploadClick, uploading }) {
  return (
    <SectionPanel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted, fontWeight: typography.fontWeight.medium }}>
          Prize {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              ...cleanButtonStyle,
              color: colors.text.muted,
              cursor: 'pointer',
              padding: spacing.xs,
              display: 'flex',
            }}
            aria-label="Remove prize"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-start', marginBottom: spacing.md }}>
        <button
          type="button"
          onClick={() => !uploading && onUploadClick()}
          style={{
            ...cleanButtonStyle,
            width: '72px',
            height: '72px',
            borderRadius: borderRadius.lg,
            background: prize.imageUrl
              ? `url(${prize.imageUrl}) center/cover`
              : colors.background.tertiary,
            border: `1px solid ${colors.border.primary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: uploading ? 'wait' : 'pointer',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {uploading ? (
            <Loader size={16} style={{ color: colors.gold.primary, animation: 'spin 1s linear infinite' }} />
          ) : prize.imageUrl ? (
            <span
              onClick={(e) => { e.stopPropagation(); onChange('imageUrl', ''); }}
              style={clearBtnStyle}
              role="button"
              aria-label="Remove image"
            >
              <X size={12} />
            </span>
          ) : (
            <Camera size={18} style={{ color: colors.text.muted }} />
          )}
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <Field label="What is it? *" compact>
            <input
              type="text"
              value={prize.title}
              onChange={(e) => onChange('title', e.target.value)}
              placeholder="e.g., Diamond Necklace"
              style={inputStyle}
            />
          </Field>
          <Field label="Value ($)" compact>
            <input
              type="text"
              inputMode="numeric"
              value={prize.value}
              onChange={(e) => onChange('value', e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="e.g., 500"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      <Field label="Description" compact>
        <textarea
          value={prize.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Optional details about the prize..."
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Field>
    </SectionPanel>
  );
}

// ---------- Reusable bits ----------
function Field({ label, compact, children }) {
  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: compact ? spacing.xs : spacing.xs }}>{label}</label>
      {children}
    </div>
  );
}

function SectionPanel({ children }) {
  return (
    <div
      style={{
        background: colors.background.secondary,
        border: `1px solid ${colors.border.primary}`,
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
      }}
    >
      {children}
    </div>
  );
}

function ChoiceCard({ active, onClick, icon: Icon, title, subtitle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...cleanButtonStyle,
        flex: 1,
        padding: spacing.lg,
        borderRadius: borderRadius.xl,
        background: active ? colors.gold.muted : colors.background.secondary,
        border: `1px solid ${active ? colors.gold.primary : colors.border.primary}`,
        color: colors.text.primary,
        cursor: 'pointer',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.sm,
        transition: transitions.all,
      }}
    >
      <Icon size={24} style={{ color: active ? colors.gold.primary : colors.text.secondary }} />
      <div style={{ fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.md }}>
        {title}
      </div>
      <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
        {subtitle}
      </div>
    </button>
  );
}

function YesNoButton({ active, variant, onClick, children }) {
  const isYes = variant === 'yes';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...cleanButtonStyle,
        flex: 1,
        padding: spacing.md,
        background: active
          ? (isYes ? colors.gold.primary : colors.background.tertiary)
          : colors.background.secondary,
        color: active && isYes ? colors.text.inverse : colors.text.primary,
        border: `1px solid ${active ? (isYes ? colors.gold.primary : colors.text.muted) : colors.border.primary}`,
        borderRadius: borderRadius.lg,
        cursor: 'pointer',
        fontWeight: typography.fontWeight.medium,
        fontSize: typography.fontSize.md,
        transition: transitions.all,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  width: '100%',
  padding: spacing.md,
  background: colors.background.secondary,
  border: `1px solid ${colors.border.primary}`,
  borderRadius: borderRadius.lg,
  color: colors.text.primary,
  fontSize: typography.fontSize.md,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.medium,
  color: colors.text.secondary,
  marginBottom: spacing.xs,
};

// Resets browser defaults so clicked buttons don't retain focus rings / tap highlights.
const cleanButtonStyle = {
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
  fontFamily: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
};

const clearBtnStyle = {
  position: 'absolute',
  top: '-6px',
  right: '-6px',
  width: '20px',
  height: '20px',
  background: colors.status.error,
  borderRadius: borderRadius.full,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#fff',
};
