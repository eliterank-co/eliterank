import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Check, X, Loader, Camera, Instagram } from 'lucide-react';
import { Modal, Button, Input, Textarea, Avatar, Badge } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { supabase } from '../../lib/supabase';
import { uploadPhoto } from '../../features/entry/utils/uploadPhoto';

// Human label + relative priority for each source a contact can come from.
// When the same person shows up in more than one source, the lowest-rank
// label wins (a contestant reads as "Contestant" even if they also subscribed).
const SOURCE_META = {
  contestant: { label: 'Contestant', rank: 0 },
  nominee: { label: 'Nominee', rank: 1 },
  judge: { label: 'Judge', rank: 2 },
  subscriber: { label: 'Subscriber', rank: 3 },
};

// Identity key for de-duping a person across sources. Email is the strongest
// signal (profiles.email is unique; the entity tables store it directly), then
// a linked profile id, then a name fallback for off-platform people.
const contactKey = (c) => {
  if (c.email) return `e:${c.email.trim().toLowerCase()}`;
  if (c.userId) return `u:${c.userId}`;
  return `n:${(c.name || '').trim().toLowerCase()}`;
};

// Collapse the four source lists into one contact per person, filling blank
// fields from whichever source has them and keeping the highest-priority label.
const mergeContacts = (list) => {
  const byKey = new Map();
  for (const c of list) {
    const key = contactKey(c);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c, key });
      continue;
    }
    existing.userId = existing.userId || c.userId || null;
    existing.email = existing.email || c.email;
    existing.avatarUrl = existing.avatarUrl || c.avatarUrl;
    existing.instagram = existing.instagram || c.instagram;
    existing.bio = existing.bio || c.bio;
    if ((SOURCE_META[c.source]?.rank ?? 9) < (SOURCE_META[existing.source]?.rank ?? 9)) {
      existing.source = c.source;
    }
  }
  return [...byKey.values()];
};

export default function JudgeModal({
  isOpen,
  onClose,
  judge,
  onSave,
  // Scope the people-picker to this org's audience instead of the whole
  // platform. `competitionId` is the fallback when a competition isn't yet
  // attached to an organization.
  organizationId,
  competitionId,
}) {
  const isEditing = !!judge;

  // Form state
  const [form, setForm] = useState({ name: '', title: '', bio: '', userId: null, avatarUrl: '', instagram: '', email: '' });

  // Search state. `contacts` holds the normalized, deduped people list.
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showSearch, setShowSearch] = useState(true);

  // Photo upload state
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (judge) {
        setForm({
          name: judge.name || '',
          title: judge.title || '',
          bio: judge.bio || '',
          userId: judge.userId || null,
          avatarUrl: judge.avatarUrl || '',
          instagram: judge.instagram || '',
          email: judge.email || '',
        });
        setShowSearch(false);
        setSelectedProfile(null);
      } else {
        setForm({ name: '', title: '', bio: '', userId: null, avatarUrl: '', instagram: '', email: '' });
        setShowSearch(true);
        setSelectedProfile(null);
      }
      setSearchQuery('');
    }
  }, [isOpen, judge]);

  // Debounced search over the organization's *contacts* — the people already
  // tied to any of its competitions: contestants, nominees, invited judges, and
  // notify-list subscribers — rather than the entire platform userbase (which
  // leaked every user's name + email to any host). RLS keeps each source scoped
  // to what the host may read. Anyone not already a contact can still be added
  // via the manual fields below. Empty query = browse; typing filters server-side.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const trimmed = searchQuery.trim();
    const safe = trimmed.replace(/[(),%]/g, '');

    const run = async () => {
      // No org/competition context to scope by — don't fall back to the whole
      // userbase; rely on manual entry instead.
      if (!organizationId && !competitionId) {
        setContacts([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Resolve the org's competitions (or just the current one when the
        // competition isn't attached to an org yet).
        let competitionIds = [competitionId].filter(Boolean);
        if (organizationId) {
          const { data: comps, error: compErr } = await supabase
            .from('competitions')
            .select('id')
            .eq('organization_id', organizationId);
          if (compErr) throw compErr;
          competitionIds = (comps || []).map((c) => c.id);
        }
        if (cancelled) return;
        if (!competitionIds.length) {
          setContacts([]);
          return;
        }

        const pattern = safe ? `%${safe}%` : null;
        const CAP = 200;
        // Entity tables (contestants/nominees/judges) carry name + email
        // directly; subscribers carry only a user_id, so they embed profiles.
        const entitySelect = 'user_id, name, email, avatar_url, instagram, bio';
        const buildEntity = (table) => {
          let q = supabase.from(table).select(entitySelect).in('competition_id', competitionIds).limit(CAP);
          if (pattern) q = q.or(`name.ilike.${pattern},email.ilike.${pattern}`);
          return q;
        };
        let subQ = supabase
          .from('competition_subscribers')
          .select('profiles!inner(id, email, first_name, last_name, avatar_url, bio, instagram)')
          .in('competition_id', competitionIds)
          .limit(CAP);
        if (pattern) {
          subQ = subQ.or(`email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`, { referencedTable: 'profiles' });
        }

        const [subs, cons, noms, jdgs] = await Promise.all([
          subQ,
          buildEntity('contestants'),
          buildEntity('nominees'),
          buildEntity('judges'),
        ]);
        if (cancelled) return;
        const firstErr = subs.error || cons.error || noms.error || jdgs.error;
        if (firstErr) throw firstErr;

        const raw = [];
        for (const row of subs.data || []) {
          const p = row?.profiles;
          if (!p) continue;
          raw.push({
            userId: p.id,
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Unknown',
            email: p.email || '',
            avatarUrl: p.avatar_url || '',
            instagram: p.instagram || '',
            bio: p.bio || '',
            source: 'subscriber',
          });
        }
        const pushEntity = (rows, source) => {
          for (const r of rows || []) {
            raw.push({
              userId: r.user_id || null,
              name: r.name || r.email || 'Unknown',
              email: r.email || '',
              avatarUrl: r.avatar_url || '',
              instagram: r.instagram || '',
              bio: r.bio || '',
              source,
            });
          }
        };
        pushEntity(cons.data, 'contestant');
        pushEntity(noms.data, 'nominee');
        pushEntity(jdgs.data, 'judge');

        const merged = mergeContacts(raw);
        merged.sort((a, b) => a.name.localeCompare(b.name));
        setContacts(merged);
      } catch (err) {
        if (!cancelled) console.error('Error fetching organization contacts:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const handle = setTimeout(run, trimmed ? 200 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [isOpen, searchQuery, organizationId, competitionId]);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectProfile = (contact) => {
    setSelectedProfile(contact);
    setForm({
      name: contact.name || '',
      title: '',
      bio: contact.bio || '',
      userId: contact.userId || null,
      avatarUrl: contact.avatarUrl || '',
      instagram: contact.instagram || '',
      email: contact.email || '',
    });
    setShowSearch(false);
  };

  const handleClearSelection = () => {
    setSelectedProfile(null);
    setForm({ name: '', title: '', bio: '', userId: null, avatarUrl: '', instagram: '', email: '' });
    setShowSearch(true);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const url = await uploadPhoto(file, 'judges');
      updateField('avatarUrl', url);
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    onSave({
      name: form.name,
      title: form.title,
      bio: form.bio,
      userId: form.userId,
      avatarUrl: form.avatarUrl,
      instagram: form.instagram,
      email: form.email,
    });
  };

  const getProfileName = (contact) => contact?.name || contact?.email || 'Unknown';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Judge' : 'Add Judge'}
      maxWidth="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} style={{ width: 'auto' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            icon={Check}
            disabled={!form.name || !form.title}
          >
            {isEditing ? 'Save Changes' : 'Add Judge'}
          </Button>
        </>
      }
    >
      {/* Selected Profile or Manual Entry Toggle */}
      {selectedProfile && !isEditing && (
        <div style={{
          marginBottom: spacing.lg,
          padding: spacing.lg,
          background: 'rgba(212,175,55,0.1)',
          border: `1px solid ${colors.gold.primary}`,
          borderRadius: borderRadius.lg,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
        }}>
          <Avatar name={getProfileName(selectedProfile)} avatarUrl={selectedProfile.avatarUrl} size={44} />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: typography.fontWeight.medium, color: colors.gold.primary }}>
              {getProfileName(selectedProfile)}
            </p>
            <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
              {selectedProfile.email}
            </p>
          </div>
          <button
            onClick={handleClearSelection}
            style={{
              padding: spacing.sm,
              background: 'transparent',
              border: 'none',
              color: colors.text.secondary,
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Search Section */}
      {showSearch && !isEditing && (
        <>
          <div style={{
            position: 'relative',
            marginBottom: spacing.md,
          }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: spacing.md,
                top: '50%',
                transform: 'translateY(-50%)',
                color: colors.text.muted,
              }}
            />
            <input
              type="text"
              placeholder="Search your contacts by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: `${spacing.md} ${spacing.md} ${spacing.md} ${spacing.xxxl}`,
                background: colors.background.secondary,
                border: `1px solid ${colors.border.light}`,
                borderRadius: borderRadius.lg,
                color: '#fff',
                fontSize: typography.fontSize.md,
              }}
            />
          </div>

          {/* Contacts List */}
          <div style={{
            maxHeight: '280px',
            overflowY: 'auto',
            border: `1px solid ${colors.border.light}`,
            borderRadius: borderRadius.lg,
            marginBottom: spacing.lg,
          }}>
            {loading ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: spacing.xl,
                color: colors.text.secondary,
              }}>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite', marginRight: spacing.sm }} />
                Loading...
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : contacts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: spacing.xl,
                color: colors.text.secondary,
              }}>
                <User size={24} style={{ marginBottom: spacing.sm, opacity: 0.5 }} />
                <p style={{ fontSize: typography.fontSize.sm }}>No contacts found</p>
                <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: spacing.xs }}>
                  Enter their details manually below to add them.
                </p>
              </div>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.key}
                  onClick={() => handleSelectProfile(contact)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.md,
                    cursor: 'pointer',
                    borderBottom: `1px solid ${colors.border.lighter}`,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Avatar name={getProfileName(contact)} avatarUrl={contact.avatarUrl} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>
                      {getProfileName(contact)}
                    </p>
                    <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {contact.email}
                    </p>
                  </div>
                  {SOURCE_META[contact.source] && (
                    <span style={{
                      flexShrink: 0,
                      fontSize: typography.fontSize.xs,
                      padding: `2px ${spacing.sm}`,
                      borderRadius: borderRadius.sm,
                      background: 'rgba(212,175,55,0.12)',
                      color: colors.gold.primary,
                      whiteSpace: 'nowrap',
                    }}>
                      {SOURCE_META[contact.source].label}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{
            textAlign: 'center',
            marginBottom: spacing.lg,
            color: colors.text.muted,
            fontSize: typography.fontSize.sm,
          }}>
            — or enter details manually —
          </div>
        </>
      )}

      {/* Photo Upload */}
      <div style={{ marginBottom: spacing.lg }}>
        <label style={{
          display: 'block',
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          color: colors.text.secondary,
          marginBottom: spacing.sm,
        }}>
          Photo
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: `2px dashed ${form.avatarUrl ? 'rgba(212,175,55,0.4)' : colors.border.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: form.avatarUrl ? 'transparent' : 'rgba(255,255,255,0.03)',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="Judge" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Camera size={20} style={{ color: colors.text.muted }} />
            )}
            {uploading && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Loader size={18} style={{ color: colors.gold.primary, animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${colors.border.primary}`,
                borderRadius: borderRadius.md,
                color: colors.text.secondary,
                fontSize: typography.fontSize.sm,
                cursor: 'pointer',
              }}
            >
              {uploading ? 'Uploading...' : form.avatarUrl ? 'Change Photo' : 'Upload Photo'}
            </button>
            {form.avatarUrl && (
              <button
                onClick={() => updateField('avatarUrl', '')}
                style={{
                  marginLeft: spacing.sm,
                  padding: `${spacing.xs} ${spacing.sm}`,
                  background: 'transparent',
                  border: 'none',
                  color: colors.text.muted,
                  fontSize: typography.fontSize.xs,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Form Fields */}
      <Input
        label="Full Name"
        value={form.name}
        onChange={(e) => updateField('name', e.target.value)}
        placeholder="e.g., Victoria Blackwell"
      />
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => updateField('email', e.target.value)}
        placeholder="judge@example.com"
      />
      <p style={{
        marginTop: -spacing.sm,
        marginBottom: spacing.lg,
        fontSize: typography.fontSize.xs,
        color: colors.text.muted,
      }}>
        Used to send the judge an invite so they can log in and score contestants.
      </p>
      <Input
        label="Title / Role"
        value={form.title}
        onChange={(e) => updateField('title', e.target.value)}
        placeholder="e.g., Fashion Editor, Vogue"
      />
      <Input
        label="Instagram"
        value={form.instagram}
        onChange={(e) => updateField('instagram', e.target.value)}
        placeholder="@username"
      />
      <Textarea
        label="Bio (Optional)"
        value={form.bio}
        onChange={(e) => updateField('bio', e.target.value)}
        placeholder="Brief description of the judge..."
        rows={3}
      />
    </Modal>
  );
}
