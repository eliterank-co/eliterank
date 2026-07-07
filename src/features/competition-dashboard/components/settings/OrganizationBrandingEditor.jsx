import React, { useState, useEffect, useRef } from 'react';
import { Image, Link, Upload, X, Check, Pencil, ExternalLink, FileText, Instagram, Facebook, Music2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { colors, spacing, borderRadius, typography } from '../../../../styles/theme';
import { Button, Panel } from '../../../../components/ui';
import { useToast } from '../../../../contexts/ToastContext';

/**
 * Organization branding editor for host dashboard
 * Upload header logo (wide logo with name) and set website URL
 *
 * @param {string} organizationId - Organization UUID
 * @param {string} currentHeaderLogoUrl - Current header_logo_url
 * @param {string} currentWebsiteUrl - Current website_url
 * @param {string} fallbackLegalEntityName - Org name, used to seed the legal
 *   entity name when the host hasn't set one yet (it's the value the Official
 *   Rules already fall back to).
 * @param {function} onSave - Callback when save completes
 */
export function OrganizationBrandingEditor({ organizationId, currentHeaderLogoUrl, fallbackLogoUrl, currentWebsiteUrl, currentLegalEntityName, fallbackLegalEntityName, currentInstagram, currentTiktok, currentFacebook, onSave }) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [headerLogoUrl, setHeaderLogoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [legalEntityName, setLegalEntityName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [facebook, setFacebook] = useState('');
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // No dedicated header logo yet? Fall back to the org logo uploaded during
  // onboarding (stored as logo_url) so the host sees what we already have on
  // file instead of an empty uploader. Saving promotes it to the header logo.
  const seededHeaderLogoUrl = currentHeaderLogoUrl || fallbackLogoUrl || '';
  const usingFallbackLogo = !currentHeaderLogoUrl && !!fallbackLogoUrl;

  // No legal entity name on file yet? Seed the field with the org name (the same
  // value the Official Rules already fall back to) so the host sees "Creator
  // Social LLC" instead of an empty box, and a single Save promotes it to a
  // saved legal_entity_name.
  const seededLegalEntityName = currentLegalEntityName || fallbackLegalEntityName || '';
  const usingFallbackLegalName = !currentLegalEntityName && !!fallbackLegalEntityName;

  useEffect(() => {
    setHeaderLogoUrl(seededHeaderLogoUrl);
    setWebsiteUrl(currentWebsiteUrl || '');
    setLegalEntityName(seededLegalEntityName);
    setInstagram(currentInstagram || '');
    setTiktok(currentTiktok || '');
    setFacebook(currentFacebook || '');
  }, [seededHeaderLogoUrl, currentWebsiteUrl, seededLegalEntityName, currentInstagram, currentTiktok, currentFacebook]);

  const hasChanges = () => {
    return headerLogoUrl !== (currentHeaderLogoUrl || '') ||
           websiteUrl !== (currentWebsiteUrl || '') ||
           legalEntityName !== (currentLegalEntityName || '') ||
           instagram !== (currentInstagram || '') ||
           tiktok !== (currentTiktok || '') ||
           facebook !== (currentFacebook || '');
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `org-logos/header-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { cacheControl: '31536000', upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      setHeaderLogoUrl(urlData.publicUrl);
      toast.success('Logo uploaded');
    } catch (err) {
      console.error('Logo upload error:', err);
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setHeaderLogoUrl('');
  };

  // Discard in-progress edits (revert to what's saved / seeded) and leave edit mode.
  const handleCancel = () => {
    setHeaderLogoUrl(seededHeaderLogoUrl);
    setWebsiteUrl(currentWebsiteUrl || '');
    setLegalEntityName(seededLegalEntityName);
    setInstagram(currentInstagram || '');
    setTiktok(currentTiktok || '');
    setFacebook(currentFacebook || '');
    setEditing(false);
  };

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          header_logo_url: headerLogoUrl || null,
          website_url: websiteUrl.trim() || null,
          legal_entity_name: legalEntityName.trim() || null,
          instagram: instagram.trim() || null,
          tiktok: tiktok.trim() || null,
          facebook: facebook.trim() || null,
        })
        .eq('id', organizationId);

      if (error) throw error;
      toast.success('Branding updated — it’s live on your competition page');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
      onSave?.();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  const styles = {
    content: {
      padding: spacing.xl,
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.lg,
    },
    description: {
      color: colors.text.secondary,
      fontSize: typography.fontSize.sm,
      margin: 0,
    },
    fieldGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
    },
    label: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: colors.text.primary,
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
    },
    hint: {
      fontSize: typography.fontSize.xs,
      color: colors.text.secondary,
    },
    uploadZone: {
      border: `2px dashed ${colors.border.primary}`,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: spacing.md,
      cursor: 'pointer',
      transition: 'border-color 0.2s',
      background: colors.background.secondary,
    },
    previewContainer: {
      position: 'relative',
      background: colors.background.secondary,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: `1px solid ${colors.border.primary}`,
    },
    previewImage: {
      maxWidth: '280px',
      maxHeight: '120px',
      objectFit: 'contain',
    },
    removeButton: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: colors.status.errorMuted,
      border: `1px solid ${colors.status.errorMuted}`,
      color: colors.status.error,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      width: '100%',
      padding: `${spacing.sm} ${spacing.md}`,
      background: colors.background.secondary,
      border: `1px solid ${colors.border.primary}`,
      borderRadius: borderRadius.md,
      color: colors.text.primary,
      fontSize: typography.fontSize.base,
      outline: 'none',
      boxSizing: 'border-box',
    },
    socialRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
    },
    actions: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    editBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      background: 'transparent',
      border: 'none',
      color: colors.gold.primary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
    },
    readValue: {
      margin: 0,
      color: colors.text.secondary,
      fontSize: typography.fontSize.sm,
    },
    readLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: spacing.xs,
      color: colors.gold.primary,
      fontSize: typography.fontSize.base,
      textDecoration: 'none',
      wordBreak: 'break-all',
    },
  };

  return (
    <Panel
      title="Organization Branding"
      icon={Image}
      action={
        !editing ? (
          <button onClick={() => setEditing(true)} style={styles.editBtn}>
            <Pencil size={14} />
            Edit
          </button>
        ) : null
      }
    >
      <div style={styles.content}>
        <p style={styles.description}>
          Your header logo (with organization name included) and website link.
          This logo appears on the competition page with "Presented by" above it.
        </p>

        {/* Header Logo */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            <Image size={14} />
            Header Logo
          </label>

          {editing ? (
            <>
              <p style={styles.hint}>
                Wide logo with your organization name. Transparent background recommended (PNG).
              </p>
              {usingFallbackLogo && (
                <p style={{ ...styles.hint, color: colors.gold.primary }}>
                  Showing the logo from your onboarding. Upload a wide header version, or Save to keep this one.
                </p>
              )}

              {headerLogoUrl ? (
                <div style={styles.previewContainer}>
                  <img src={headerLogoUrl} alt="Header logo" style={styles.previewImage} />
                  <button style={styles.removeButton} onClick={handleRemoveLogo} title="Remove logo">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  style={styles.uploadZone}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                >
                  <Upload size={24} style={{ color: colors.text.muted }} />
                  <span style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                    {uploading ? 'Uploading...' : 'Click to upload header logo'}
                  </span>
                  <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>
                    PNG, JPG, WebP · Max 2MB
                  </span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />
            </>
          ) : headerLogoUrl ? (
            <div style={styles.previewContainer}>
              <img src={headerLogoUrl} alt="Header logo" style={styles.previewImage} />
            </div>
          ) : (
            <p style={styles.readValue}>No logo yet</p>
          )}
        </div>

        {/* Website URL */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            <Link size={14} />
            Website URL
          </label>
          {editing ? (
            <>
              <p style={styles.hint}>
                Clicking your logo on the competition page will open this link.
              </p>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                style={styles.input}
              />
            </>
          ) : websiteUrl ? (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={styles.readLink}>
              {websiteUrl}
              <ExternalLink size={13} />
            </a>
          ) : (
            <p style={styles.readValue}>Not set</p>
          )}
        </div>

        {/* Legal Entity Name */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            <FileText size={14} />
            Legal Entity Name
          </label>
          {editing ? (
            <>
              <p style={styles.hint}>
                Your registered legal entity (e.g. "Acme Events LLC"). Shown as the
                organizer on your competition's Official Rules. Leave blank to use
                your organization name.
              </p>
              {usingFallbackLegalName && (
                <p style={{ ...styles.hint, color: colors.gold.primary }}>
                  Pre-filled from your organization name. Save to confirm it, or edit if your registered entity differs.
                </p>
              )}
              <input
                type="text"
                value={legalEntityName}
                onChange={(e) => setLegalEntityName(e.target.value)}
                placeholder="e.g. Acme Events LLC"
                style={styles.input}
              />
            </>
          ) : currentLegalEntityName ? (
            <p style={styles.readValue}>{currentLegalEntityName}</p>
          ) : fallbackLegalEntityName ? (
            <p style={styles.readValue}>
              {fallbackLegalEntityName}
              <span style={{ color: colors.text.muted }}> · from your organization name</span>
            </p>
          ) : (
            <p style={styles.readValue}>Not set — your organization name is used</p>
          )}
        </div>

        {/* Social Links — shown beneath sponsors on your public competition page */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            <Instagram size={14} />
            Social Links
          </label>
          <p style={styles.hint}>
            Your handle or full link. These appear beneath your sponsors on the
            competition page. Leave any blank to hide it.
          </p>
          {[
            { key: 'instagram', label: 'Instagram', Icon: Instagram, value: instagram, set: setInstagram, placeholder: '@yourhandle' },
            { key: 'tiktok', label: 'TikTok', Icon: Music2, value: tiktok, set: setTiktok, placeholder: '@yourhandle' },
            { key: 'facebook', label: 'Facebook', Icon: Facebook, value: facebook, set: setFacebook, placeholder: 'yourpage or full URL' },
          ].map(({ key, label, Icon, value, set, placeholder }) => (
            <div key={key} style={styles.socialRow}>
              <Icon size={16} style={{ color: colors.text.muted, flexShrink: 0 }} />
              {editing ? (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={`${label} — ${placeholder}`}
                  aria-label={label}
                  style={styles.input}
                />
              ) : (
                <span style={styles.readValue}>{value || `${label}: Not set`}</span>
              )}
            </div>
          ))}
        </div>

        {/* Save / Cancel */}
        {editing && (
          <div style={styles.actions}>
            <Button variant="secondary" icon={X} onClick={handleCancel} disabled={saving || uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges() || saving}
              icon={saved ? Check : undefined}
              variant={saved ? 'success' : 'primary'}
            >
              {saved ? 'Saved' : saving ? 'Saving...' : 'Save Branding'}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default OrganizationBrandingEditor;
