import React, { useState, useEffect } from 'react';
import { Trophy, DollarSign, Lock, Check } from 'lucide-react';
import { FieldLockIndicator, LockIcon } from './FieldLockIndicator';
import { isFieldEditable } from '../../../../utils/fieldEditability';
import { supabase } from '../../../../lib/supabase';
import { colors, spacing, borderRadius, typography } from '../../../../styles/theme';
import { Button, Panel, Badge } from '../../../../components/ui';
import { useToast } from '../../../../contexts/ToastContext';

/**
 * Host prize-minimum setting.
 *
 * Stores the host's guaranteed minimum contribution (competitions.prize_pool_minimum).
 * This is an internal commitment figure only — no public cash "prize pool" is
 * derived from or displayed off it (prizes shown to the public are the sponsor
 * prize package). It is intentionally not tied to vote revenue.
 *
 * @param {object} competition - Competition object
 * @param {function} onSave - Callback when save completes
 */
export function PrizePoolSettings({ competition, onSave }) {
  const toast = useToast();
  const status = competition?.status || 'draft';

  // Form state
  const [minimum, setMinimum] = useState(1000);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initialize
  useEffect(() => {
    if (competition?.prize_pool_minimum) {
      setMinimum(competition.prize_pool_minimum);
    }
  }, [competition]);

  // Validate minimum
  const minError = minimum < 1000 ? 'Minimum is $1,000' : null;

  // Check for changes
  const hasChanges = () => minimum !== (competition?.prize_pool_minimum || 1000);

  // Save changes
  const saveChanges = async () => {
    if (!competition?.id || minError) return;

    setSaving(true);

    try {
      const { error: updateError } = await supabase
        .from('competitions')
        .update({
          prize_pool_minimum: minimum,
          updated_at: new Date().toISOString(),
        })
        .eq('id', competition.id);

      if (updateError) throw updateError;

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Prize minimum saved');

      if (onSave) onSave();
    } catch (err) {
      console.error('Error saving prize minimum:', err);
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isLocked = isFieldEditable('prize_pool_minimum', status) === false;

  // Styles
  const descStyle = {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    margin: `0 0 ${spacing.lg}`,
    lineHeight: typography.lineHeight.relaxed,
  };

  const formGroupStyle = {
    marginBottom: spacing.lg,
  };

  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
    color: colors.text.secondary,
  };

  const inputContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  };

  const prefixStyle = {
    padding: `${spacing.sm} ${spacing.md}`,
    background: colors.background.tertiary,
    borderRight: `1px solid ${colors.border.primary}`,
    color: colors.text.muted,
    display: 'flex',
    alignItems: 'center',
  };

  const inputStyle = {
    flex: 1,
    padding: `${spacing.sm} ${spacing.md}`,
    border: 'none',
    background: 'transparent',
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    outline: 'none',
  };

  const errorStyle = {
    fontSize: typography.fontSize.xs,
    color: colors.status.error,
    marginTop: spacing.xs,
  };

  const hintStyle = {
    fontSize: typography.fontSize.xs,
    color: colors.text.muted,
    marginTop: spacing.xs,
  };

  const lockedValueStyle = {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  };

  const actionsStyle = {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border.primary}`,
    marginTop: spacing.lg,
  };

  // Locked: compact read-only summary
  if (isLocked) {
    return (
      <Panel
        title="Prize Minimum"
        icon={Trophy}
        action={
          <Badge variant="secondary" size="sm">
            <Lock size={12} style={{ marginRight: spacing.xs }} />
            Locked
          </Badge>
        }
      >
        <div style={{ padding: spacing.xl }}>
          <p style={labelStyle}>Host Minimum Contribution</p>
          <span style={lockedValueStyle}>${Number(minimum).toLocaleString()}</span>
        </div>
      </Panel>
    );
  }

  // Editable: minimum input
  return (
    <Panel title="Prize Minimum" icon={Trophy}>
      <div style={{ padding: spacing.xl }}>
        <p style={descStyle}>
          Set your guaranteed minimum prize contribution. This is your internal commitment to
          contestants and cannot be changed once voting begins.
        </p>

        <FieldLockIndicator fieldName="prize_pool_minimum" status={status}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              Host Minimum Contribution
              <LockIcon fieldName="prize_pool_minimum" status={status} />
            </label>
            <div style={inputContainerStyle}>
              <span style={prefixStyle}>
                <DollarSign size={16} />
              </span>
              <input
                type="number"
                min={1000}
                step={100}
                value={minimum}
                onChange={(e) => setMinimum(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
            {minError && <span style={errorStyle}>{minError}</span>}
            <span style={hintStyle}>Minimum $1,000 required</span>
          </div>
        </FieldLockIndicator>

        <div style={actionsStyle}>
          <Button
            onClick={saveChanges}
            disabled={!hasChanges() || saving || minError}
            icon={saved ? Check : null}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export default PrizePoolSettings;
