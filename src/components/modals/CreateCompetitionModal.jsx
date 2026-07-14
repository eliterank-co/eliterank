import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader, Sparkles, User, Building2, ArrowLeft, ArrowRight, CheckCircle, Info, CalendarClock, ShieldCheck } from 'lucide-react';
import { Modal, Button } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { supabase } from '../../lib/supabase';
import { slugify, generateShortCompetitionSlug, cityCode } from '../../utils/slugs';
import { COMPETITION_TEMPLATES, CUSTOM_TEMPLATE, findTemplate, US_STATES } from '../../lib/competitionTemplates';

// Age options for the eligibility selects (all competitions are 18+).
const AGE_OPTIONS = Array.from({ length: 80 - 18 + 1 }, (_, i) => 18 + i);
import { CALENDLY_URL } from '../../lib/scheduling';

const NEW_ORG = '__new__';

/**
 * CalendlyInline — embeds a Calendly scheduler inline, prefilled with the
 * visitor's name/email. Loads Calendly's widget script once and (re)initializes
 * the inline widget into our container.
 */
function CalendlyInline({ url, name, email }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!url) return undefined;
    const SRC = 'https://assets.calendly.com/assets/external/widget.js';
    const render = () => {
      if (window.Calendly && ref.current) {
        ref.current.innerHTML = '';
        window.Calendly.initInlineWidget({ url, parentElement: ref.current, prefill: { name: name || '', email: email || '' } });
      }
    };
    const existing = document.querySelector(`script[src="${SRC}"]`);
    if (window.Calendly) render();
    else if (existing) existing.addEventListener('load', render);
    else {
      const s = document.createElement('script');
      s.src = SRC; s.async = true; s.addEventListener('load', render);
      document.body.appendChild(s);
    }
    return () => { if (existing) existing.removeEventListener('load', render); };
  }, [url, name, email]);
  return <div ref={ref} style={{ minWidth: 300, height: 620 }} />;
}
// Config pages in order, per the onboarding flow.
const CONFIG_ORDER = ['sponsor', 'template', 'format', 'prizes', 'review'];
const STEP_LABELS = {
  sponsor: 'Organization setup',
  template: 'Category',
  format: 'Format',
  prizes: 'Prizes & extras',
  review: 'Review',
};
/**
 * CreateCompetitionModal — self-serve host create wizard.
 *
 * Flow: Ready? → (Learn more = lead capture) / Set up now → Individual vs
 * Organization → 5-page configure (Category template · Format · Eligibility ·
 * Prizes · Review) → creates a DRAFT (creator = host). Publishing stays
 * admin-approved; the agreement + Stripe are handled in the dashboard.
 */
export default function CreateCompetitionModal({ isOpen, onClose, userId, onCreated, initialStep = 'ready' }) {
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lookups, setLookups] = useState({ cities: [], categories: [], demographics: [], orgs: [] });

  const [form, setForm] = useState({
    // sponsor
    hostType: '', soloName: '', organizationId: '', newOrgName: '', orgType: 'company',
    orgLogoUrl: '', orgWebsite: '', orgInstagram: '',
    // template
    templateId: '', customCategory: '',
    // format
    name: '', numberOfWinners: 1, entryType: 'nominations', pricePerVote: 1.0, selectionCriteria: 'hybrid',
    plannedLaunchTimeframe: '',
    // eligibility
    cityId: '', territoryScope: 'city', territoryState: '', eligibilityRadius: 100, relationshipStatus: '',
    gender: 'all', ageMin: 21, ageMax: '',
    // prizes
    cashPrizeYes: false, cashPrizeAmount: '', sponsoredPrizesYes: false,
    charityYes: true, charityPercentage: 10,
    // misc
    season: new Date().getFullYear(),
  });
  // Visitor identity for the Calendly prefill on the "Learn more" flow.
  const [lead, setLead] = useState({ name: '', email: '' });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploadingLogo(true); setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const fileName = `org-logos/${userId || 'anon'}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      set('orgLogoUrl', data.publicUrl);
    } catch (err) {
      setError('Logo upload failed: ' + (err.message || 'try again'));
    } finally {
      setUploadingLogo(false);
    }
  };

  useEffect(() => {
    if (isOpen) { setStep(initialStep); setError(null); }
  }, [isOpen, initialStep]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cities, categories, demographics, orgs, profile] = await Promise.all([
          supabase.from('cities').select('id, name, state, slug').order('name'),
          supabase.from('categories').select('id, name, slug').eq('active', true).order('name'),
          supabase.from('demographics').select('id, label, slug').eq('active', true).order('id'),
          userId ? supabase.from('organizations').select('id, name, slug, org_type').eq('owner_id', userId).order('name') : Promise.resolve({ data: [] }),
          userId ? supabase.from('profiles').select('first_name, last_name, email').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;
        setLookups({ cities: cities.data || [], categories: categories.data || [], demographics: demographics.data || [], orgs: orgs.data || [] });
        const fullName = `${profile.data?.first_name || ''} ${profile.data?.last_name || ''}`.trim();
        setForm((f) => ({ ...f, soloName: f.soloName || fullName, organizationId: orgs.data?.[0]?.id || NEW_ORG }));
        setLead((l) => ({ ...l, name: l.name || fullName, email: l.email || profile.data?.email || '' }));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load options.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, userId]);

  const template = findTemplate(form.templateId);
  const orgCreatingNew = lookups.orgs.length === 0 || form.organizationId === NEW_ORG;

  // ── Validation per config step ──────────────────────────────────────────────
  const validateStep = (s) => {
    if (s === 'sponsor') {
      if (!form.hostType) return 'Choose individual or organization.';
      if (form.hostType === 'individual' && !form.soloName.trim()) return 'Enter your name — it’s shown as the host.';
      if (form.hostType === 'organization' && orgCreatingNew && !form.newOrgName.trim()) return 'Enter your legal entity name.';
      if (form.hostType === 'organization' && orgCreatingNew && !form.orgWebsite.trim() && !form.orgInstagram.trim()) return 'Add a website or Instagram for your organization.';
    }
    if (s === 'template') {
      if (!form.templateId) return 'Pick a category template.';
      if (form.templateId === CUSTOM_TEMPLATE.id && !form.customCategory.trim()) return 'Type your category.';
    }
    if (s === 'format') {
      if (!form.name.trim()) return 'Enter a competition name.';
      if (form.territoryScope === 'city' && !form.cityId) return 'Pick a city.';
      if (form.territoryScope === 'state' && !form.territoryState) return 'Pick a state.';
      if (!form.ageMin || Number(form.ageMin) < 18) return 'Minimum age must be 18 or older — all competitions are 18+.';
      if (form.ageMax && Number(form.ageMax) < Number(form.ageMin)) return 'Max age must be greater than the minimum.';
    }
    return null;
  };

  const goNext = () => {
    const idx = CONFIG_ORDER.indexOf(step);
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep(CONFIG_ORDER[idx + 1]);
  };
  const goBack = () => {
    const idx = CONFIG_ORDER.indexOf(step);
    if (idx <= 0) { setStep('ready'); return; }
    setError(null);
    setStep(CONFIG_ORDER[idx - 1]);
  };

  // ── Create competition ──────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setError(null); setBusy(true);
    try {
      const city = lookups.cities.find((c) => c.id === form.cityId);
      // Map flexible gender + age range to a demographic bucket when one matches
      // exactly; otherwise the eligibility_* fields are the source of truth.
      const genderMatch = form.gender === 'all' ? null : form.gender;
      const ageMin = form.ageMin === '' || form.ageMin == null ? null : Number(form.ageMin);
      const ageMax = form.ageMax === '' || form.ageMax == null ? null : Number(form.ageMax);
      const demo = lookups.demographics.find((d) =>
        (d.gender || null) === genderMatch && (d.age_min ?? null) === ageMin && (d.age_max ?? null) === ageMax
      ) || null;
      const genderSlug = { all: 'all-genders', male: 'men', female: 'women', 'LGBTQ+': 'lgbtq-plus' }[form.gender] || 'open';
      const demoSlug = demo?.slug || (ageMin ? `${genderSlug}-${ageMin}-${ageMax || 'plus'}` : 'open');

      // Resolve Sponsor-of-record org.
      let organizationId, orgName;
      if (form.hostType === 'individual') {
        const personal = lookups.orgs.find((o) => o.org_type === 'individual');
        if (personal) { organizationId = personal.id; orgName = personal.name; }
        else {
          const name = form.soloName.trim();
          const { data: org, error: e } = await supabase.rpc('create_host_organization', { p_name: name, p_slug: slugify(name), p_type: 'individual' });
          if (e) throw e; organizationId = org.id; orgName = org.name;
        }
      } else if (orgCreatingNew) {
        const name = form.newOrgName.trim();
        const { data: org, error: e } = await supabase.rpc('create_host_organization', {
          p_name: name, p_slug: slugify(name), p_type: form.orgType,
          p_logo_url: form.orgLogoUrl || null, p_website_url: form.orgWebsite || null, p_instagram: form.orgInstagram || null,
        });
        if (e) throw e; organizationId = org.id; orgName = org.name;
      } else {
        organizationId = form.organizationId; orgName = lookups.orgs.find((o) => o.id === organizationId)?.name;
      }

      // Map template → category lookup when one fits; always store the template label.
      const categoryTemplate = template?.id === CUSTOM_TEMPLATE.id ? form.customCategory.trim() : (template?.label || null);
      const categoryId = template?.categorySlug ? (lookups.categories.find((c) => c.slug === template.categorySlug)?.id || null) : null;

      const name = form.name.trim() || `${orgName || 'Competition'} ${city?.name || ''}`.trim();
      // Short, shareable slug: {name}-{placeCode}-{yy} (e.g. creator-of-the-year-chi-26).
      const placeCode = form.territoryScope === 'city'
        ? cityCode(city?.slug || city?.name || '')
        : form.territoryScope === 'state'
          ? (form.territoryState || '').toLowerCase()
          : 'us';
      const baseSlug = generateShortCompetitionSlug({ name, code: placeCode, season: Number(form.season) });
      // Ensure uniqueness within the org (the URL is /{org}/{slug} and lookups
      // are org-scoped, so we only disambiguate same-org collisions).
      let slug = baseSlug;
      for (let n = 2; n < 50; n++) {
        const { data: dup } = await supabase
          .from('competitions')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('slug', slug)
          .limit(1);
        if (!dup || dup.length === 0) break;
        slug = `${baseSlug}-${n}`;
      }

      const { data: comp, error: e2 } = await supabase.rpc('create_host_competition', {
        p_payload: {
          organization_id: organizationId,
          city_id: form.territoryScope === 'city' ? form.cityId : null,
          category_id: categoryId,
          demographic_id: demo?.id || null,
          category_template: categoryTemplate,
          territory_scope: form.territoryScope,
          season: Number(form.season),
          name, slug,
          number_of_winners: Number(form.numberOfWinners) || 5,
          entry_type: form.entryType,
          selection_criteria: form.selectionCriteria,
          eligibility_radius_miles: Number(form.eligibilityRadius) || 100,
        },
      });
      if (e2) throw e2;

      // Persist flexible eligibility + charity % on the new draft (host can
      // update their own competition via RLS). Name/details for charity come
      // later in the dashboard.
      const updates = {
        eligibility_gender: form.gender, eligibility_age_min: ageMin, eligibility_age_max: ageMax,
        territory_state: form.territoryScope === 'state' ? form.territoryState : null,
        planned_launch_timeframe: form.plannedLaunchTimeframe || null,
        cash_prize_amount: form.cashPrizeYes ? (Number(form.cashPrizeAmount) || 0) : null,
        has_sponsored_prizes: !!form.sponsoredPrizesYes,
      };
      if (form.charityYes) updates.charity_percentage = Number(form.charityPercentage) || null;
      await supabase.from('competitions').update(updates).eq('id', comp.id);

      onCreated?.(comp);
    } catch (err) {
      console.error('Failed to create competition:', err);
      setError(err.message || 'Could not create the competition. Please try again.');
    } finally { setBusy(false); }
  }, [form, lookups, template, orgCreatingNew, onCreated]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  // Field border/background + tile hover/active live in the scoped CSS below so
  // we get real :focus / :hover states; inline styles only carry layout.
  const labelStyle = { display: 'block', color: colors.text.secondary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginBottom: spacing.xs, letterSpacing: '0.01em' };
  const fieldStyle = { width: '100%', padding: `${spacing.md} ${spacing.md}`, borderRadius: borderRadius.lg, color: colors.text.primary, fontSize: typography.fontSize.md, marginBottom: spacing.lg, boxSizing: 'border-box' };
  // Control without its own bottom margin — used inside field() so spacing is
  // owned by the field group, not the control (consistent vertical rhythm).
  const controlStyle = { ...fieldStyle, marginBottom: 0 };
  const helpStyle = { color: colors.text.muted, fontSize: typography.fontSize.xs, margin: `${spacing.xs} 0 0`, lineHeight: 1.5 };
  // Render-function (not a component) so inputs keep focus across keystrokes.
  const field = (label, control, help) => (
    <div style={{ marginBottom: spacing.lg }}>
      {label && <label style={labelStyle}>{label}</label>}
      {control}
      {help && <p style={helpStyle}>{help}</p>}
    </div>
  );
  // Tile props (className + layout-only inline style) for selectable cards.
  const tile = (active, extra = {}) => ({
    className: `cc-tile${active ? ' is-active' : ''}`,
    style: {
      padding: spacing.lg, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: spacing.xs, textAlign: 'center', cursor: 'pointer',
      borderRadius: borderRadius.lg, color: colors.text.primary, ...extra,
    },
  });
  const errEl = error ? <p style={{ color: colors.status.error, fontSize: typography.fontSize.sm, marginTop: spacing.xs }}>{error}</p> : null;

  const wizardCss = `
    .cc-wizard input, .cc-wizard select, .cc-wizard textarea {
      background: ${colors.background.secondary};
      border: 1px solid ${colors.border.primary};
      transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .cc-wizard input::placeholder { color: ${colors.text.muted}; }
    .cc-wizard input:focus, .cc-wizard select:focus, .cc-wizard textarea:focus {
      outline: none;
      border-color: ${colors.gold.primary};
      box-shadow: 0 0 0 3px rgba(212,175,55,0.15);
      background: rgba(255,255,255,0.04);
    }
    .cc-wizard select {
      -webkit-appearance: none; -moz-appearance: none; appearance: none; cursor: pointer;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
      background-repeat: no-repeat; background-position: right 14px center; padding-right: 40px;
    }
    .cc-wizard .cc-tile {
      background: ${colors.background.secondary};
      border: 1px solid ${colors.border.primary};
      transition: transform .12s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease;
    }
    .cc-wizard .cc-tile:hover {
      border-color: rgba(212,175,55,0.55);
      background: rgba(212,175,55,0.04);
      transform: translateY(-1px);
    }
    .cc-wizard .cc-tile.is-active {
      border-color: ${colors.gold.primary};
      background: rgba(212,175,55,0.10);
      box-shadow: inset 0 0 0 1px ${colors.gold.primary}, 0 8px 24px rgba(212,175,55,0.08);
    }
    .cc-wizard .cc-tile-ic {
      width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(212,175,55,0.10);
    }
  `;

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footer = (() => {
    if (step === 'ready') return <Button variant="secondary" onClick={onClose} style={{ width: 'auto' }}>Cancel</Button>;
    if (step === 'learn') return (
      <Button variant="secondary" onClick={() => { setStep('ready'); setError(null); }} icon={ArrowLeft} style={{ width: 'auto' }}>Back</Button>
    );
    if (step === 'review') return (
      <>
        <Button variant="secondary" onClick={goBack} icon={ArrowLeft} disabled={busy} style={{ width: 'auto' }}>Back</Button>
        <Button onClick={handleCreate} disabled={busy || loading} icon={busy ? Loader : Sparkles}>{busy ? 'Creating…' : 'Create draft'}</Button>
      </>
    );
    // config steps
    return (
      <>
        <Button variant="secondary" onClick={goBack} icon={ArrowLeft} style={{ width: 'auto' }}>Back</Button>
        <Button onClick={goNext} icon={ArrowRight} disabled={loading}>Next</Button>
      </>
    );
  })();

  const stepNumber = CONFIG_ORDER.indexOf(step);
  const title = step === 'ready' || step === 'learn' ? 'Launch a competition'
    : `Step ${stepNumber + 1} of ${CONFIG_ORDER.length} · ${STEP_LABELS[step]}`;

  return (
    <Modal isOpen={isOpen} onClose={() => !busy && onClose?.()} title={title} maxWidth="600px" footer={footer} centered>
      <div className="cc-wizard">
      <style>{wizardCss}</style>
      {/* READY */}
      {step === 'ready' && (
        <div>
          <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.md, marginBottom: spacing.xl }}>
            Ready to set up your competition now?
          </p>
          <div style={{ display: 'flex', gap: spacing.lg }}>
            <div {...tile(false, { flex: 1, gap: spacing.sm })} onClick={() => { setError(null); setStep('sponsor'); }}>
              <span className="cc-tile-ic"><Sparkles size={22} color={colors.gold.primary} /></span>
              <div style={{ fontWeight: typography.fontWeight.semibold }}>Yes, set it up now</div>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Build your draft in a few steps.</div>
            </div>
            <div {...tile(false, { flex: 1, gap: spacing.sm })} onClick={() => { setError(null); setStep('learn'); }}>
              <span className="cc-tile-ic"><Info size={22} color={colors.gold.primary} /></span>
              <div style={{ fontWeight: typography.fontWeight.semibold }}>Learn more first</div>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Get the host info packet or schedule a call.</div>
            </div>
          </div>

          <div style={{
            marginTop: spacing.xl, padding: spacing.lg, borderRadius: borderRadius.xl,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.03) 100%)',
            border: '1px solid rgba(212,175,55,0.28)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
              <ShieldCheck size={18} style={{ color: colors.gold.primary, flexShrink: 0 }} />
              <p style={{ color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, margin: 0 }}>
                Your competition won’t go live until:
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {[
                'You approve the competition',
                'Your Stripe identity verification (KYC) is approved',
                'You’ve signed the Host Agreement',
              ].map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.sm, color: colors.text.secondary, fontSize: typography.fontSize.sm, lineHeight: 1.5 }}>
                  <CheckCircle size={15} style={{ color: colors.gold.primary, flexShrink: 0, marginTop: 2 }} />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LEARN — schedule a call via Calendly */}
      {step === 'learn' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <CalendarClock size={20} color={colors.gold.primary} />
            <div>
              <div style={{ fontWeight: typography.fontWeight.semibold }}>Schedule a call</div>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>Grab a time and we’ll walk you through hosting a competition.</div>
            </div>
          </div>
          <CalendlyInline url={CALENDLY_URL} name={lead.name} email={lead.email} />
          {errEl}
        </div>
      )}

      {/* loading guard for config steps */}
      {CONFIG_ORDER.includes(step) && loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: spacing.xxl, color: colors.text.secondary }}>
          <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* SPONSOR */}
      {step === 'sponsor' && !loading && (
        <div>
          <p style={{ color: colors.text.secondary, marginBottom: spacing.lg }}>Are you hosting as an individual or an organization?</p>
          <div style={{ display: 'flex', gap: spacing.lg, marginBottom: spacing.xl }}>
            <div {...tile(form.hostType === 'individual', { flex: 1, gap: spacing.sm })} onClick={() => set('hostType', 'individual')}>
              <span className="cc-tile-ic"><User size={22} color={colors.gold.primary} /></span>
              <div style={{ fontWeight: typography.fontWeight.semibold }}>Individual</div>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>You’re the host.</div>
            </div>
            <div {...tile(form.hostType === 'organization', { flex: 1, gap: spacing.sm })} onClick={() => set('hostType', 'organization')}>
              <span className="cc-tile-ic"><Building2 size={22} color={colors.gold.primary} /></span>
              <div style={{ fontWeight: typography.fontWeight.semibold }}>Organization</div>
              <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>A company or non-profit.</div>
            </div>
          </div>

          {form.hostType === 'individual' && (
            <>
              <label style={labelStyle}>Your name (shown as the host)</label>
              <input style={fieldStyle} value={form.soloName} onChange={(e) => set('soloName', e.target.value)} placeholder="Your full name" />
            </>
          )}
          {form.hostType === 'organization' && (
            <>
              {lookups.orgs.length > 0 && (
                <>
                  <label style={labelStyle}>Organization</label>
                  <select style={fieldStyle} value={form.organizationId} onChange={(e) => set('organizationId', e.target.value)}>
                    {lookups.orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
                    <option value={NEW_ORG}>+ Create a new organization</option>
                  </select>
                </>
              )}
              {orgCreatingNew && (
                <>
                  <label style={labelStyle}>Legal entity name</label>
                  <input style={{ ...fieldStyle, marginBottom: spacing.xs }} value={form.newOrgName} onChange={(e) => set('newOrgName', e.target.value)} placeholder="e.g. Creator Social LLC" />
                  <p style={{ ...helpStyle, marginBottom: spacing.lg }}>Your registered entity. You can set a public brand name (DBA) later in your dashboard.</p>
                  <label style={labelStyle}>Entity type</label>
                  <select style={fieldStyle} value={form.orgType} onChange={(e) => set('orgType', e.target.value)}>
                    <option value="company">Company</option>
                    <option value="non_profit">Non-profit</option>
                  </select>

                  <label style={labelStyle}>Logo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
                    {form.orgLogoUrl
                      ? <img src={form.orgLogoUrl} alt="Logo" style={{ width: 48, height: 48, borderRadius: borderRadius.md, objectFit: 'cover', border: `1px solid ${colors.border.primary}` }} />
                      : <div style={{ width: 48, height: 48, borderRadius: borderRadius.md, background: colors.background.secondary, border: `1px dashed ${colors.border.primary}` }} />}
                    <label style={{ cursor: 'pointer', color: colors.gold.primary, fontSize: typography.fontSize.sm }}>
                      {uploadingLogo ? 'Uploading…' : (form.orgLogoUrl ? 'Replace logo' : 'Upload logo')}
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingLogo}
                        onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
                    </label>
                  </div>

                  <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, marginBottom: spacing.sm }}>
                    Add at least one — a website or Instagram.
                  </p>
                  <label style={labelStyle}>Website</label>
                  <input style={fieldStyle} value={form.orgWebsite} onChange={(e) => set('orgWebsite', e.target.value)} placeholder="https://…" />
                  <label style={labelStyle}>Instagram</label>
                  <input style={fieldStyle} value={form.orgInstagram} onChange={(e) => set('orgInstagram', e.target.value)} placeholder="@yourbrand" />
                </>
              )}
            </>
          )}
          {errEl}
        </div>
      )}

      {/* TEMPLATE */}
      {step === 'template' && !loading && (
        <div>
          <p style={{ color: colors.text.secondary, marginBottom: spacing.lg }}>Pick a category template — it pre-fills sensible defaults you can tweak.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: spacing.md }}>
            {[...COMPETITION_TEMPLATES, CUSTOM_TEMPLATE].map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.id} {...tile(form.templateId === t.id, { gap: spacing.sm, minHeight: 104, justifyContent: 'center' })} onClick={() => set('templateId', t.id)}>
                  <span className="cc-tile-ic"><Icon size={22} color={colors.gold.primary} /></span>
                  <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>{t.label}</div>
                </div>
              );
            })}
          </div>
          {form.templateId === CUSTOM_TEMPLATE.id && (
            <div style={{ marginTop: spacing.lg }}>
              <label style={labelStyle}>Your category</label>
              <input style={fieldStyle} value={form.customCategory} onChange={(e) => set('customCategory', e.target.value)} placeholder="e.g. Chefs, Realtors…" />
            </div>
          )}
          {errEl}
        </div>
      )}

      {/* FORMAT */}
      {step === 'format' && !loading && (
        <div>
          {field('Competition name',
            <input style={controlStyle} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Most Eligible Austin" />,
            'This becomes the title winners earn — make it a social accolade they’ll be excited to promote (e.g. “Realtor of the Year”).')}

          {field('Number of winners',
            <input style={controlStyle} type="number" min="1" value={form.numberOfWinners} onChange={(e) => set('numberOfWinners', e.target.value)} />,
            'Contestants enter by nomination — they can submit themselves or be nominated by someone else.')}

          {field('How they win',
            <select style={controlStyle} value={form.selectionCriteria} onChange={(e) => set('selectionCriteria', e.target.value)}>
              <option value="hybrid">Votes + judges (hybrid)</option>
              <option value="judges">Judges only</option>
            </select>,
            'Winners are decided by a judging panel (judges control at least 60% of the final round). Public votes can influence — but never solely decide — the outcome. Entering is free; the competition is funded by paid voting.')}

          {/* Eligibility (folded into Format) */}
          {field('Territory',
            <select style={controlStyle} value={form.territoryScope} onChange={(e) => set('territoryScope', e.target.value)}>
              <option value="city">City-wide</option>
              <option value="state">State-wide</option>
              <option value="us">US-wide</option>
            </select>,
            form.territoryScope === 'us' ? 'Open to entrants across the United States.' : null)}

          {form.territoryScope === 'city' && field(null,
            <div style={{ display: 'flex', gap: spacing.md }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>City</label>
                <select style={controlStyle} value={form.cityId} onChange={(e) => set('cityId', e.target.value)}>
                  <option value="">Select a city…</option>
                  {lookups.cities.map((c) => (<option key={c.id} value={c.id}>{c.name}{c.state ? `, ${c.state}` : ''}</option>))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Radius (miles)</label>
                <input style={controlStyle} type="number" min="1" value={form.eligibilityRadius} onChange={(e) => set('eligibilityRadius', e.target.value)} />
              </div>
            </div>)}

          {form.territoryScope === 'state' && field('State',
            <select style={controlStyle} value={form.territoryState} onChange={(e) => set('territoryState', e.target.value)}>
              <option value="">Select a state…</option>
              {US_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>)}

          {field('Who can enter',
            <div style={{ display: 'flex', gap: spacing.md }}>
              <div style={{ flex: 1.2 }}>
                <label style={labelStyle}>Gender</label>
                <select style={controlStyle} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="all">All genders</option>
                  <option value="female">Women</option>
                  <option value="male">Men</option>
                  <option value="LGBTQ+">LGBTQ+</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Min age</label>
                <select style={controlStyle} value={form.ageMin} onChange={(e) => set('ageMin', e.target.value)}>
                  {AGE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Max age</label>
                <select style={controlStyle} value={form.ageMax} onChange={(e) => set('ageMax', e.target.value)}>
                  <option value="">No max</option>
                  {AGE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
            </div>,
            'All competitions are 18+.')}

          {template?.relationshipRelevant && field('Relationship status',
            <select style={controlStyle} value={form.relationshipStatus} onChange={(e) => set('relationshipStatus', e.target.value)}>
              <option value="">Any</option>
              <option value="single">Single</option>
              <option value="engaged">Engaged</option>
              <option value="married">Married</option>
            </select>)}
          {errEl}
        </div>
      )}

      {/* PRIZES */}
      {step === 'prizes' && !loading && (
        <div>
          <p style={{ color: colors.text.secondary, marginBottom: spacing.lg }}>
            You’ll add the specific prizes, sponsors and IRL events in your dashboard after creating — just the basics here.
          </p>

          <label style={labelStyle}>Is there a cash prize?</label>
          <div style={{ display: 'flex', gap: spacing.md, marginBottom: form.cashPrizeYes ? spacing.md : spacing.lg }}>
            <div {...tile(form.cashPrizeYes, { flex: 1, padding: spacing.md, fontWeight: typography.fontWeight.medium })} onClick={() => set('cashPrizeYes', true)}>Yes</div>
            <div {...tile(!form.cashPrizeYes, { flex: 1, padding: spacing.md, fontWeight: typography.fontWeight.medium })} onClick={() => { set('cashPrizeYes', false); set('cashPrizeAmount', ''); }}>No</div>
          </div>
          {form.cashPrizeYes && (
            <>
              <label style={labelStyle}>Total cash prize (USD)</label>
              <input style={fieldStyle} type="number" min="0" value={form.cashPrizeAmount} onChange={(e) => set('cashPrizeAmount', e.target.value)} placeholder="e.g. 1000" />
            </>
          )}

          <label style={labelStyle}>Are there sponsored prizes (goods or services)?</label>
          <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.lg }}>
            <div {...tile(form.sponsoredPrizesYes, { flex: 1, padding: spacing.md, fontWeight: typography.fontWeight.medium })} onClick={() => set('sponsoredPrizesYes', true)}>Yes</div>
            <div {...tile(!form.sponsoredPrizesYes, { flex: 1, padding: spacing.md, fontWeight: typography.fontWeight.medium })} onClick={() => set('sponsoredPrizesYes', false)}>No</div>
          </div>

          <label style={labelStyle}>Are you donating a portion of proceeds to charity?</label>
          <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.lg }}>
            <div {...tile(form.charityYes, { flex: 1, padding: spacing.md, fontWeight: typography.fontWeight.medium })} onClick={() => set('charityYes', true)}>Yes</div>
            <div {...tile(!form.charityYes, { flex: 1, padding: spacing.md, fontWeight: typography.fontWeight.medium })} onClick={() => set('charityYes', false)}>No</div>
          </div>
          {form.charityYes && (
            <>
              <label style={labelStyle}>Percentage to charity (%)</label>
              <input style={fieldStyle} type="number" min="1" max="100" value={form.charityPercentage} onChange={(e) => set('charityPercentage', e.target.value)} />
              <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>You’ll pick the specific charity later in your dashboard.</p>
            </>
          )}
          {errEl}
        </div>
      )}

      {/* REVIEW */}
      {step === 'review' && !loading && (
        <div>
          <p style={{ color: colors.text.secondary, marginBottom: spacing.lg }}>Does this look right? You can edit everything in your dashboard before publishing.</p>
          {[
            ['Host', form.hostType === 'individual' ? `${form.soloName} (individual)` : (orgCreatingNew ? `${form.newOrgName} (${form.orgType})` : lookups.orgs.find((o) => o.id === form.organizationId)?.name)],
            ['Template', template?.id === CUSTOM_TEMPLATE.id ? form.customCategory : template?.label],
            ['Winners', form.numberOfWinners],
            ['Entry', form.entryType === 'nominations' ? 'Nomination' : 'Application'],
            ['How they win', form.selectionCriteria === 'votes' ? 'Public votes' : form.selectionCriteria === 'judges' ? 'Judges only' : 'Votes + judges'],
            ['Territory', form.territoryScope === 'us'
              ? 'US-wide'
              : form.territoryScope === 'state'
              ? `State-wide · ${form.territoryState || '—'}`
              : `City-wide · ${lookups.cities.find((c) => c.id === form.cityId)?.name || '—'} (${form.eligibilityRadius} mi)`],
            ['Who can enter', `${({ all: 'All genders', female: 'Women', male: 'Men', 'LGBTQ+': 'LGBTQ+' }[form.gender] || '')}${form.ageMin ? `, ${form.ageMin}–${form.ageMax || '+'}` : ''}`],
            ['Cash prize', form.cashPrizeYes ? `$${Number(form.cashPrizeAmount) || 0}` : 'No'],
            ['Sponsored prizes', form.sponsoredPrizesYes ? 'Yes' : 'No'],
            ['Charity', form.charityYes ? `${form.charityPercentage}% of proceeds` : 'No'],
            ['Season', form.season],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: `${spacing.sm} 0`, borderBottom: `1px solid ${colors.border.secondary}`, fontSize: typography.fontSize.sm }}>
              <span style={{ color: colors.text.muted }}>{k}</span>
              <span style={{ color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>{v || '—'}</span>
            </div>
          ))}
          <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: spacing.lg }}>
            Next: accept the Host Agreement and connect Stripe in your dashboard. Publishing is approved by EliteRank.
          </p>
          {errEl}
        </div>
      )}
      </div>
    </Modal>
  );
}
