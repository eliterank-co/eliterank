import React, { useState } from 'react';
import { ClipboardList, Pencil, Loader, Check, X, Building2, ArrowRight } from 'lucide-react';
import { Panel, Button } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { supabase } from '../../../lib/supabase';
import { isFieldEditable } from '../../../utils/fieldEditability';
import { COMPETITION_TEMPLATES, CUSTOM_TEMPLATE, US_STATES } from '../../../lib/competitionTemplates';

/**
 * CompetitionSummaryCard — recap of what the host set during onboarding, shown
 * on the dashboard Overview. While the competition is still a draft these core
 * fields are editable inline; once it's submitted for approval they lock and the
 * card shows a read-only recap. The lock follows `isFieldEditable('category', …)`.
 */
const GENDER = { all: 'All genders', female: 'Women', male: 'Men', 'LGBTQ+': 'LGBTQ+' };
const ENTRY = { nominations: 'Nomination', applications: 'Application', host_upload: 'Host uploads roster' };
const WIN = { votes: 'Public votes', hybrid: 'Votes + judges', judges: 'Judges only' };

const labelStyle = { display: 'block', color: colors.text.secondary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, marginBottom: spacing.xs };
const fieldStyle = { width: '100%', padding: spacing.md, background: colors.background.secondary, border: `1px solid ${colors.border.primary}`, borderRadius: borderRadius.md, color: colors.text.primary, fontSize: typography.fontSize.sm };
const helpStyle = { color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: spacing.xs, lineHeight: 1.4 };

// Small uppercase divider used to group the edit form into scannable sections.
function SectionLabel({ children }) {
  return (
    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, margin: `${spacing.lg} 0 ${spacing.sm}` }}>
      {children}
    </p>
  );
}

// Whole-dollar money, with thousands separators (e.g. $1,500).
const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

// Keep ages at or above the 18+ floor; empty stays empty for the optional max.
function clampAge(value, floor) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (Number.isNaN(n)) return '';
  return n < floor ? floor : n;
}

function templateIdFor(label) {
  if (!label) return '';
  const match = COMPETITION_TEMPLATES.find((t) => t.label === label);
  return match ? match.id : CUSTOM_TEMPLATE.id;
}

export default function CompetitionSummaryCard({ competition, onNavigateToTab, onRefresh }) {
  const c = competition;
  const editable = isFieldEditable('category', c?.status);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lookups, setLookups] = useState({ cities: [], categories: [], loaded: false });
  const [form, setForm] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  if (!competition) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploadingLogo(true); setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const fileName = `org-logos/${c.organizationId || c.id}-${Date.now()}.${ext}`;
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

  const startEdit = async () => {
    const tplId = templateIdFor(c.categoryTemplate);
    setForm({
      name: c.name || '',
      orgName: c.organizationName || '',
      orgLogoUrl: c.organizationLogoUrl || '',
      orgWebsite: c.organizationWebsiteUrl || '',
      orgInstagram: c.organizationInstagram || '',
      templateId: tplId,
      customCategory: tplId === CUSTOM_TEMPLATE.id ? (c.categoryTemplate || '') : '',
      territoryScope: c.territoryScope || 'city',
      territoryState: c.territoryState || '',
      cityId: c.cityId || '',
      eligibilityRadius: c.eligibilityRadiusMiles || 100,
      gender: c.eligibilityGender || 'all',
      ageMin: c.eligibilityAgeMin ?? 21,
      ageMax: c.eligibilityAgeMax ?? '',
      entryType: c.entryType || 'nominations',
      selectionCriteria: c.selectionCriteria || 'votes',
      numberOfWinners: c.numberOfWinners ?? 5,
      charityYes: !!c.charityPercentage,
      charityPercentage: c.charityPercentage || 10,
      plannedLaunchTimeframe: c.plannedLaunchTimeframe || '',
      cashPrizeYes: c.cashPrizeAmount != null,
      cashPrizeAmount: c.cashPrizeAmount ?? '',
      sponsoredPrizesYes: !!c.hasSponsoredPrizes,
    });
    setError(null);
    setEditing(true);
    if (!lookups.loaded) {
      const [cities, categories] = await Promise.all([
        supabase.from('cities').select('id, name, state').order('name'),
        supabase.from('categories').select('id, slug').eq('active', true),
      ]);
      setLookups({ cities: cities.data || [], categories: categories.data || [], loaded: true });
    }
  };

  const cancelEdit = () => { setEditing(false); setError(null); };

  const save = async () => {
    // Validate
    const ageMin = form.ageMin === '' || form.ageMin == null ? null : Number(form.ageMin);
    const ageMax = form.ageMax === '' || form.ageMax == null ? null : Number(form.ageMax);
    if (!form.name.trim()) { setError('Enter a competition name.'); return; }
    if (!form.orgName.trim()) { setError('Enter the name of the presenting entity.'); return; }
    if (!form.orgWebsite.trim() && !form.orgInstagram.trim()) { setError('Add a website or Instagram for the presenting entity.'); return; }
    if (!ageMin || ageMin < 18) { setError('Minimum age must be 18 or older — all competitions are 18+.'); return; }
    if (ageMax && ageMax < ageMin) { setError('Max age must be greater than the minimum.'); return; }
    if (form.templateId === CUSTOM_TEMPLATE.id && !form.customCategory.trim()) { setError('Type your category.'); return; }
    if (!form.templateId) { setError('Pick a category.'); return; }
    if (form.territoryScope === 'city' && !form.cityId) { setError('Pick a city.'); return; }
    if (form.territoryScope === 'state' && !form.territoryState) { setError('Pick a state.'); return; }

    setSaving(true); setError(null);
    try {
      const tpl = form.templateId === CUSTOM_TEMPLATE.id
        ? CUSTOM_TEMPLATE
        : COMPETITION_TEMPLATES.find((t) => t.id === form.templateId);
      const categoryTemplate = tpl?.id === CUSTOM_TEMPLATE.id ? form.customCategory.trim() : (tpl?.label || null);
      const categoryId = tpl?.categorySlug
        ? (lookups.categories.find((cat) => cat.slug === tpl.categorySlug)?.id || null)
        : null;

      const updates = {
        name: form.name.trim(),
        category_template: categoryTemplate,
        category_id: categoryId,
        territory_scope: form.territoryScope,
        territory_state: form.territoryScope === 'state' ? form.territoryState : null,
        city_id: form.territoryScope === 'city' ? form.cityId : null,
        eligibility_radius_miles: form.territoryScope === 'city' ? (Number(form.eligibilityRadius) || 100) : null,
        eligibility_gender: form.gender,
        eligibility_age_min: ageMin,
        eligibility_age_max: ageMax,
        entry_type: form.entryType,
        selection_criteria: form.selectionCriteria,
        number_of_winners: Number(form.numberOfWinners) || 1,
        charity_percentage: form.charityYes ? (Number(form.charityPercentage) || null) : null,
        planned_launch_timeframe: form.plannedLaunchTimeframe || null,
        cash_prize_amount: form.cashPrizeYes ? (Number(form.cashPrizeAmount) || 0) : null,
        has_sponsored_prizes: !!form.sponsoredPrizesYes,
      };

      const { error: e } = await supabase.from('competitions').update(updates).eq('id', c.id);
      if (e) throw e;

      // Sponsor-of-record (organization) — name, logo, website, Instagram.
      if (c.organizationId) {
        const orgUpdates = {
          name: form.orgName.trim(),
          logo_url: form.orgLogoUrl || null,
          website_url: form.orgWebsite.trim() || null,
          instagram: form.orgInstagram.trim() || null,
        };
        const { error: orgErr } = await supabase.from('organizations').update(orgUpdates).eq('id', c.organizationId);
        if (orgErr) throw orgErr;
      }

      setEditing(false);
      onRefresh?.();
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Read-only recap ─────────────────────────────────────────────────────────
  if (!editing) {
    const territory = c.territoryScope === 'us'
      ? 'US-wide'
      : c.territoryScope === 'state'
      ? `State-wide · ${c.territoryState || '—'}`
      : `City-wide${c.city ? ` · ${c.city}` : ''}${c.eligibilityRadiusMiles ? ` (${c.eligibilityRadiusMiles} mi)` : ''}`;

    const whoCanEnter = `${GENDER[c.eligibilityGender] || 'All genders'}${
      c.eligibilityAgeMin ? `, ${c.eligibilityAgeMin}–${c.eligibilityAgeMax || '+'}` : ''
    }`;

    const rows = [
      ['Name', c.name],
      ['Presented by', c.organizationName],
      ['Category', c.categoryTemplate || c.categoryName],
      ['Territory', territory],
      ['Who can enter', whoCanEnter],
      ['Entry', ENTRY[c.entryType] || c.entryType],
      ['How they win', WIN[c.selectionCriteria] || c.selectionCriteria],
      ['Winners', c.numberOfWinners],
      ['Cash prize', c.cashPrizeAmount != null ? money(c.cashPrizeAmount) : 'None'],
      ['Sponsored prizes', c.hasSponsoredPrizes ? 'Yes' : 'No'],
      ['Charity', c.charityPercentage ? `${c.charityPercentage}% of proceeds` : 'None'],
    ];

    return (
      <Panel
        title="Your competition"
        icon={ClipboardList}
        style={{ marginBottom: 0 }}
        locked={!editable}
        action={
          editable ? (
            <Button size="sm" variant="secondary" icon={Pencil} onClick={startEdit} style={{ width: 'auto' }}>Edit</Button>
          ) : null
        }
      >
        <div style={{ padding: spacing.xl, paddingTop: spacing.md }}>
          <p style={{ ...helpStyle, marginTop: 0, marginBottom: spacing.lg }}>
            {editable
              ? 'A recap of what you set up. You can edit any of it while your competition is still a draft.'
              : 'A recap of what you set up. These details are locked now that you’ve submitted for approval.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.md} ${spacing.xl}` }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>{k}</span>
                <span style={{ color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>{v || '—'}</span>
              </div>
            ))}
          </div>
          {!editable && (
            <p style={{
              marginTop: spacing.lg, padding: spacing.sm, borderRadius: borderRadius.md,
              background: colors.background.secondary, color: colors.text.muted, fontSize: typography.fontSize.xs,
            }}>
              These were locked when you submitted for approval and can't be changed.
            </p>
          )}
        </div>
      </Panel>
    );
  }

  // ── Inline edit form ────────────────────────────────────────────────────────
  return (
    <Panel
      title="Your competition"
      icon={ClipboardList}
      style={{ marginBottom: 0 }}
      action={
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Button size="sm" variant="secondary" icon={X} onClick={cancelEdit} disabled={saving} style={{ width: 'auto' }}>Cancel</Button>
          <Button size="sm" icon={saving ? Loader : Check} onClick={save} disabled={saving} style={{ width: 'auto' }}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      }
    >
      <div style={{ padding: spacing.xl, paddingTop: spacing.md }}>
        {/* Competition name */}
        <div style={{ marginBottom: spacing.lg }}>
          <label style={labelStyle}>Competition name</label>
          <input style={fieldStyle} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Most Eligible Austin" />
          <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: spacing.xs, lineHeight: 1.4 }}>
            This becomes the title winners earn — make it a social accolade they’ll be excited to promote (e.g. “Realtor of the Year”).
          </p>
        </div>

        {/* Host (organization) */}
        <div style={{ marginBottom: spacing.lg, padding: spacing.lg, background: colors.background.secondary, border: `1px solid ${colors.border.primary}`, borderRadius: borderRadius.md }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
            <Building2 size={14} style={{ color: colors.gold.primary }} />
            <span style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 }}>Presented by</span>
          </div>
          <p style={{ ...helpStyle, marginTop: 0, marginBottom: spacing.md }}>
            The business or person officially running this competition and receiving payouts. Shown publicly as “Presented by”.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
            {form.orgLogoUrl
              ? <img src={form.orgLogoUrl} alt="Logo" style={{ width: 48, height: 48, borderRadius: borderRadius.md, objectFit: 'cover', border: `1px solid ${colors.border.primary}` }} />
              : <div style={{ width: 48, height: 48, borderRadius: borderRadius.md, background: colors.background.primary, border: `1px dashed ${colors.border.primary}` }} />}
            <label style={{ cursor: 'pointer', color: colors.gold.primary, fontSize: typography.fontSize.sm }}>
              {uploadingLogo ? 'Uploading…' : (form.orgLogoUrl ? 'Replace logo' : 'Upload logo')}
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingLogo} onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.md }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={fieldStyle} value={form.orgName} onChange={(e) => set('orgName', e.target.value)} placeholder="Sponsor name" />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input style={fieldStyle} value={form.orgWebsite} onChange={(e) => set('orgWebsite', e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label style={labelStyle}>Instagram</label>
              <input style={fieldStyle} value={form.orgInstagram} onChange={(e) => set('orgInstagram', e.target.value)} placeholder="@handle" />
            </div>
          </div>
          <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: spacing.sm }}>Add at least one — a website or Instagram.</p>
        </div>

        {/* Category & format */}
        <SectionLabel>Category &amp; format</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          <div>
            <label style={labelStyle}>Category</label>
            <select style={fieldStyle} value={form.templateId} onChange={(e) => set('templateId', e.target.value)}>
              {COMPETITION_TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
              <option value={CUSTOM_TEMPLATE.id}>{CUSTOM_TEMPLATE.label}</option>
            </select>
            {form.templateId === CUSTOM_TEMPLATE.id && (
              <input style={{ ...fieldStyle, marginTop: spacing.sm }} value={form.customCategory} onChange={(e) => set('customCategory', e.target.value)} placeholder="Your category" />
            )}
          </div>

          <div>
            <label style={labelStyle}>Number of winners</label>
            <input style={fieldStyle} type="number" min="1" value={form.numberOfWinners} onChange={(e) => set('numberOfWinners', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>How they win</label>
            <select style={fieldStyle} value={form.selectionCriteria} onChange={(e) => set('selectionCriteria', e.target.value)}>
              <option value="votes">Public votes</option>
              <option value="hybrid">Votes + judges</option>
              <option value="judges">Judges only</option>
            </select>
            <p style={helpStyle}>How winners are decided — public voting, a judging panel, or both.</p>
          </div>
        </div>

        {/* Who can enter */}
        <SectionLabel>Who can enter</SectionLabel>
        <label style={labelStyle}>Gender &amp; age</label>
        <div style={{ display: 'flex', gap: spacing.md }}>
          <select style={{ ...fieldStyle, flex: 1.2 }} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="all">All genders</option>
            <option value="female">Women</option>
            <option value="male">Men</option>
            <option value="LGBTQ+">LGBTQ+</option>
          </select>
          <input style={{ ...fieldStyle, flex: 1 }} type="number" min="18" placeholder="Min age" value={form.ageMin} onChange={(e) => set('ageMin', e.target.value)} onBlur={(e) => set('ageMin', clampAge(e.target.value, 18))} />
          <input style={{ ...fieldStyle, flex: 1 }} type="number" min="18" placeholder="Max (blank = none)" value={form.ageMax} onChange={(e) => set('ageMax', e.target.value)} onBlur={(e) => set('ageMax', e.target.value === '' ? '' : clampAge(e.target.value, 18))} />
        </div>
        <p style={helpStyle}>All competitions are 18+ — minimum age can’t be lower than 18.</p>

        <label style={{ ...labelStyle, marginTop: spacing.md }}>Where they’re based</label>
        <div style={{ display: 'flex', gap: spacing.md }}>
          <select style={{ ...fieldStyle, flex: 1 }} value={form.territoryScope} onChange={(e) => set('territoryScope', e.target.value)}>
            <option value="city">City-wide</option>
            <option value="state">State-wide</option>
            <option value="us">US-wide</option>
          </select>
          {form.territoryScope === 'city' && (
            <>
              <select style={{ ...fieldStyle, flex: 1.5 }} value={form.cityId} onChange={(e) => set('cityId', e.target.value)}>
                <option value="">Select a city…</option>
                {lookups.cities.map((city) => (<option key={city.id} value={city.id}>{city.name}{city.state ? `, ${city.state}` : ''}</option>))}
              </select>
              <input style={{ ...fieldStyle, flex: 0.8 }} type="number" min="1" value={form.eligibilityRadius} onChange={(e) => set('eligibilityRadius', e.target.value)} placeholder="Radius (mi)" />
            </>
          )}
          {form.territoryScope === 'state' && (
            <select style={{ ...fieldStyle, flex: 1 }} value={form.territoryState} onChange={(e) => set('territoryState', e.target.value)}>
              <option value="">Select a state…</option>
              {US_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          )}
        </div>
        {form.territoryScope === 'city' && (
          <p style={helpStyle}>Radius is how far around the city (in miles) a contestant can be based.</p>
        )}

        {/* Prizes & charity */}
        <SectionLabel>Prizes &amp; charity</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          <div>
            <label style={labelStyle}>Cash prize?</label>
            <div style={{ display: 'flex', gap: spacing.md }}>
              <select style={{ ...fieldStyle, flex: 1 }} value={form.cashPrizeYes ? 'yes' : 'no'} onChange={(e) => { const yes = e.target.value === 'yes'; set('cashPrizeYes', yes); if (!yes) set('cashPrizeAmount', ''); }}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
              {form.cashPrizeYes && (
                <input style={{ ...fieldStyle, flex: 1 }} type="number" min="0" value={form.cashPrizeAmount} onChange={(e) => set('cashPrizeAmount', e.target.value)} placeholder="USD" />
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Sponsored prizes (goods/services)?</label>
            <select style={fieldStyle} value={form.sponsoredPrizesYes ? 'yes' : 'no'} onChange={(e) => set('sponsoredPrizesYes', e.target.value === 'yes')}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Donating a portion of proceeds to charity?</label>
            <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-start' }}>
              <select style={{ ...fieldStyle, flex: 1 }} value={form.charityYes ? 'yes' : 'no'} onChange={(e) => set('charityYes', e.target.value === 'yes')}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
              {form.charityYes && (
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, marginBottom: spacing.xs }}>Percentage of proceeds</label>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...fieldStyle, paddingRight: 28 }} type="number" min="1" max="100" value={form.charityPercentage} onChange={(e) => set('charityPercentage', e.target.value)} placeholder="e.g. 10" />
                    <span style={{ position: 'absolute', right: spacing.sm, top: '50%', transform: 'translateY(-50%)', color: colors.text.muted, fontSize: typography.fontSize.sm, pointerEvents: 'none' }}>%</span>
                  </div>
                </div>
              )}
            </div>
            {form.charityYes && (
              <p style={helpStyle}>
                {Number(form.charityPercentage) || 0}% of competition proceeds will be donated to charity. You’ll pick the specific charity later.
              </p>
            )}
          </div>
        </div>

        {error && <p style={{ color: colors.status.error, fontSize: typography.fontSize.sm, marginTop: spacing.lg }}>{error}</p>}
      </div>
    </Panel>
  );
}
