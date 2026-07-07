import React from 'react';
import { Pencil } from 'lucide-react';
import { AboutSectionEditor, OrganizationBrandingEditor, AutoRulesPreview } from '../settings';
import { colors, spacing, borderRadius, typography } from '../../../../styles/theme';

/**
 * ContentTab - Public-facing content: organization branding and the About section.
 * (Announcements moved to the Engagement tab.)
 *
 * This is the *editable* half of the Site tab — what the host can change now.
 * The read-only visual preview lives below in PreviewTab. The header here makes
 * that distinction explicit so the "Preview" banner above doesn't read as if the
 * whole page is look-but-don't-touch.
 */
export default function ContentTab({
  competition,
  onRefresh,
  organizationId,
  organizationName,
  organizationHeaderLogoUrl,
  organizationLogoUrl,
  organizationWebsiteUrl,
  organizationLegalEntityName,
  organizationInstagram,
  organizationTiktok,
  organizationFacebook,
}) {
  return (
    <div>
      {/* Editable-section header: sets expectations vs. the preview below. */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: `${spacing.md} ${spacing.lg}`,
        marginBottom: spacing.lg,
        background: colors.background.secondary,
        border: `1px solid ${colors.border.lighter}`,
        borderRadius: borderRadius.lg,
      }}>
        <Pencil size={16} style={{ color: colors.gold.primary, flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{
            margin: 0,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
          }}>
            Edit your public page
          </p>
          <p style={{
            margin: `${spacing.xs} 0 0`,
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            lineHeight: 1.5,
          }}>
            These settings are editable now and save right away — they’ll appear on your page once it’s live.
          </p>
        </div>
      </div>

      {/* Organization Branding */}
      <OrganizationBrandingEditor
        organizationId={organizationId}
        currentHeaderLogoUrl={organizationHeaderLogoUrl}
        fallbackLogoUrl={organizationLogoUrl}
        currentWebsiteUrl={organizationWebsiteUrl}
        currentLegalEntityName={organizationLegalEntityName}
        fallbackLegalEntityName={organizationName}
        currentInstagram={organizationInstagram}
        currentTiktok={organizationTiktok}
        currentFacebook={organizationFacebook}
        onSave={onRefresh}
      />

      {/* About Section */}
      <AboutSectionEditor competition={competition} organization={null} onSave={onRefresh} />

      {/* Rules — auto-generated from the competition setup, read-only. */}
      <AutoRulesPreview competition={competition} />
    </div>
  );
}
