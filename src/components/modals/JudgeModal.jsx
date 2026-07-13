import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Check, X, Loader, Camera, Instagram } from 'lucide-react';
import { Modal, Button, Input, Textarea, Avatar, Badge } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { supabase } from '../../lib/supabase';
import { uploadPhoto } from '../../features/entry/utils/uploadPhoto';

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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [filteredProfiles, setFilteredProfiles] = useState([]);
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

  // Debounced server-side search, scoped to the organization's audience — the
  // people who subscribed to any of its competitions — rather than the entire
  // platform userbase (which leaked every user's name + email to any host).
  // RLS on competition_subscribers additionally restricts reads to a
  // competition's host/co-host, so this only ever returns the host's own
  // contacts. Anyone not on that list can still be added via the manual fields
  // below. Empty query = browse the audience; typing filters on the server.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const trimmed = searchQuery.trim();
    const safe = trimmed.replace(/[(),%]/g, '');

    const run = async () => {
      // No org/competition context to scope by — don't fall back to the whole
      // userbase; rely on manual entry instead.
      if (!organizationId && !competitionId) {
        setFilteredProfiles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let q = supabase
          .from('competition_subscribers')
          .select('profiles!inner(id, email, first_name, last_name, avatar_url, bio, instagram), competitions!inner(organization_id)')
          .limit(100);
        // Prefer org-wide scope so a judge who subscribed to a sibling
        // competition is still findable; fall back to the single competition
        // when the competition has no organization attached.
        if (organizationId) {
          q = q.eq('competitions.organization_id', organizationId);
        } else {
          q = q.eq('competition_id', competitionId);
        }
        if (safe) {
          const pattern = `%${safe}%`;
          q = q.or(`email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`, { referencedTable: 'profiles' });
        }
        const { data, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        // A person may subscribe to several of the org's competitions — dedupe
        // to one row per profile, then sort by name for a stable browse list.
        const seen = new Set();
        const unique = [];
        for (const row of data || []) {
          const p = row?.profiles;
          if (!p || seen.has(p.id)) continue;
          seen.add(p.id);
          unique.push(p);
        }
        unique.sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
        setFilteredProfiles(unique);
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

  const handleSelectProfile = (profile) => {
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email;
    setSelectedProfile(profile);
    setForm({
      name,
      title: '',
      bio: profile.bio || '',
      userId: profile.id,
      avatarUrl: profile.avatar_url || '',
      instagram: profile.instagram || '',
      email: profile.email || '',
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

  const getProfileName = (profile) => {
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    return name || profile.email || 'Unknown';
  };

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
          <Avatar name={getProfileName(selectedProfile)} avatarUrl={selectedProfile.avatar_url} size={44} />
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

          {/* Profiles List */}
          <div style={{
            maxHeight: '200px',
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
            ) : filteredProfiles.length === 0 ? (
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
              filteredProfiles.slice(0, 10).map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile)}
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
                  <Avatar name={getProfileName(profile)} avatarUrl={profile.avatar_url} size={36} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>
                      {getProfileName(profile)}
                    </p>
                    <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs }}>
                      {profile.email}
                    </p>
                  </div>
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
