import React, { useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import { Button, Badge, Panel } from '../../../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../../../styles/theme';
import { formatInIanaTimezone, resolveIanaLocalDateTime } from '../../../../../lib/ianaDateTime';

// Today's calendar date in the given IANA timezone, as 'YYYY-MM-DD'.
// Matches the server-side today_for_competition() function so the
// "Active today" badge reflects the same day the trigger does.
function todayInTimezone(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

const parseDateLocal = (dateStr) => {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
};

// Same treatment as the Timezone select and the calendar-day date input
// below. Without an explicit background/border the native controls render
// bare on the dark card and read as disabled; colorScheme: 'dark' is what
// turns the native calendar/clock glyphs light.
const fieldStyle = {
  width: '100%',
  marginTop: spacing.xs,
  padding: `${spacing.sm} ${spacing.md}`,
  background: colors.background.secondary,
  border: `1px solid ${colors.border.primary}`,
  borderRadius: borderRadius.md,
  color: colors.text.primary,
  fontSize: typography.fontSize.base,
  colorScheme: 'dark',
  boxSizing: 'border-box',
};

const fieldLabelStyle = {
  display: 'block',
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.medium,
  color: colors.text.primary,
};

/**
 * DoubleVoteDaysSection — Engagement tab. Pick calendar dates (in the
 * competition's timezone) when every vote counts twice.
 */
export default function DoubleVoteDaysSection({
  doubleDays = [],
  voteBoosts = [],
  isMobile,
  focusId,
  focusNonce,
  style,
  competitionTimezone,
  timezoneGroups,
  onAddDoubleDay,
  onDeleteDoubleDay,
  onAddVoteBoost,
  onCancelVoteBoost,
  onUpdateTimezone,
}) {
  const [newDoubleDayDate, setNewDoubleDayDate] = useState('');
  const [doubleDayError, setDoubleDayError] = useState('');
  const [doubleDaySaving, setDoubleDaySaving] = useState(false);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneError, setTimezoneError] = useState('');
  const [boostStart, setBoostStart] = useState('');
  const [boostEnd, setBoostEnd] = useState('');
  const [boostMultiplier, setBoostMultiplier] = useState(2);
  const [boostLabel, setBoostLabel] = useState('');
  const [boostError, setBoostError] = useState('');
  const [boostSaving, setBoostSaving] = useState(false);

  const handleAddDoubleDay = async () => {
    setDoubleDayError('');
    if (!newDoubleDayDate) {
      setDoubleDayError('Pick a date first.');
      return;
    }
    if (!onAddDoubleDay) return;
    setDoubleDaySaving(true);
    const result = await onAddDoubleDay(newDoubleDayDate);
    setDoubleDaySaving(false);
    if (result?.success) {
      setNewDoubleDayDate('');
    } else {
      setDoubleDayError(result?.error || 'Could not add date.');
    }
  };

  const handleTimezoneChange = async (e) => {
    const next = e.target.value;
    if (!next || next === competitionTimezone || !onUpdateTimezone) return;
    setTimezoneError('');
    setTimezoneSaving(true);
    const result = await onUpdateTimezone(next);
    setTimezoneSaving(false);
    if (!result?.success) {
      setTimezoneError(result?.error || 'Could not update timezone.');
    }
  };

  const handleAddVoteBoost = async () => {
    setBoostError('');
    if (!boostStart || !boostEnd || !onAddVoteBoost) {
      setBoostError('Choose a start and end time.');
      return;
    }
    try {
      const startsAt = resolveIanaLocalDateTime(boostStart, competitionTimezone).instantIso;
      const endsAt = resolveIanaLocalDateTime(boostEnd, competitionTimezone).instantIso;
      const durationMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
      if (durationMs <= 0) {
        setBoostError('The end must be after the start.');
        return;
      }
      if (durationMs > 4 * 60 * 60 * 1000) {
        setBoostError('A Vote Boost may run for at most four elapsed hours.');
        return;
      }
      setBoostSaving(true);
      const result = await onAddVoteBoost({
        startsAt,
        endsAt,
        timezone: competitionTimezone,
        multiplier: boostMultiplier,
        label: boostLabel,
      });
      if (result?.success) {
        setBoostStart('');
        setBoostEnd('');
        setBoostLabel('');
      } else {
        setBoostError(result?.error || 'Could not schedule Vote Boost.');
      }
    } catch (err) {
      const message = err?.code === 'nonexistent_local_time'
        ? 'That local time does not exist because of daylight saving time.'
        : 'The date, time, or competition timezone is invalid.';
      setBoostError(message);
    } finally {
      setBoostSaving(false);
    }
  };

  return (
    <Panel
      key={`section-doubleVoteDays-${focusId === 'doubleVoteDays' ? focusNonce : 'x'}`}
      id="setup-section-doubleVoteDays"
      title={`Vote Boosts (${voteBoosts.length}) · Double Vote Days (${doubleDays.length})`}
      icon={Zap}
      collapsible
      defaultCollapsed={focusId !== 'doubleVoteDays'}
      style={style}
    >
      <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
        <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, marginBottom: spacing.lg }}>
          Schedule a 2× or 3× Vote Boost for at most four elapsed hours, or keep using a
          calendar-day 2× promotion. Boosts change vote credit only, never price.
        </p>

        <div style={{ marginBottom: spacing.lg }}>
          <label style={{
            display: 'block',
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: colors.text.primary,
            marginBottom: spacing.xs,
          }}>
            Timezone
          </label>
          <select
            value={competitionTimezone}
            onChange={handleTimezoneChange}
            disabled={timezoneSaving || !onUpdateTimezone}
            style={{
              width: '100%',
              padding: `${spacing.sm} ${spacing.md}`,
              background: colors.background.secondary,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: borderRadius.md,
              color: colors.text.primary,
              fontSize: typography.fontSize.base,
            }}
          >
            {timezoneGroups.map(([groupName, zones]) => (
              <optgroup key={groupName} label={groupName}>
                {zones.map((zone) => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.secondary,
            marginTop: spacing.xs,
          }}>
            Dates below are interpreted in this timezone.
          </p>
          {timezoneError && (
            <p style={{
              color: colors.status.error,
              fontSize: typography.fontSize.sm,
              marginTop: spacing.xs,
            }}>
              {timezoneError}
            </p>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: spacing.sm,
          padding: spacing.md,
          marginBottom: spacing.lg,
          background: colors.background.secondary,
          border: `1px solid ${colors.border.secondary}`,
          borderRadius: borderRadius.md,
        }}>
          <label style={fieldLabelStyle}>
            Starts in {competitionTimezone}
            <input
              type="datetime-local"
              value={boostStart}
              onChange={(event) => setBoostStart(event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            Ends in {competitionTimezone}
            <input
              type="datetime-local"
              value={boostEnd}
              onChange={(event) => setBoostEnd(event.target.value)}
              style={fieldStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            Vote credit
            <select
              value={boostMultiplier}
              onChange={(event) => setBoostMultiplier(Number(event.target.value))}
              style={fieldStyle}
            >
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </label>
          <label style={fieldLabelStyle}>
            Label (optional)
            <input
              value={boostLabel}
              maxLength={60}
              onChange={(event) => setBoostLabel(event.target.value)}
              style={fieldStyle}
            />
          </label>
          <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <Button
              size="sm"
              icon={Plus}
              onClick={handleAddVoteBoost}
              disabled={boostSaving || !boostStart || !boostEnd || !onAddVoteBoost}
            >
              {boostSaving ? 'Scheduling…' : `Schedule ${boostMultiplier}× Boost`}
            </Button>
            <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, marginTop: spacing.xs }}>
              DST gaps are rejected. A repeated fall-back time resolves to its later occurrence.
            </p>
            {boostError && (
              <p style={{ color: colors.status.error, fontSize: typography.fontSize.sm, marginTop: spacing.xs }}>
                {boostError}
              </p>
            )}
          </div>
        </div>

        {voteBoosts.length > 0 && (
          <div style={{ display: 'grid', gap: spacing.sm, marginBottom: spacing.xl }}>
            {voteBoosts.map((boost) => (
              <div key={boost.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                background: colors.background.secondary,
                border: `1px solid ${colors.border.secondary}`,
                borderRadius: borderRadius.md,
                opacity: boost.cancelledAt ? 0.55 : 1,
              }}>
                <Zap size={18} style={{ color: colors.gold.primary, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: typography.fontWeight.medium }}>
                    {boost.multiplier}× {boost.label || 'Vote Boost'}
                  </p>
                  <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs }}>
                    {formatInIanaTimezone(boost.startsAt, boost.timezone)} –{' '}
                    {formatInIanaTimezone(boost.endsAt, boost.timezone)}
                  </p>
                </div>
                {boost.cancelledAt ? (
                  <Badge variant="secondary" size="sm">Cancelled</Badge>
                ) : (
                  <button
                    onClick={() => onCancelVoteBoost?.(boost.id)}
                    aria-label={`Cancel ${boost.multiplier}x Vote Boost`}
                    style={{
                      padding: spacing.sm,
                      background: 'transparent',
                      border: `1px solid ${colors.status.error}`,
                      borderRadius: borderRadius.md,
                      color: colors.status.error,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: spacing.sm,
          alignItems: isMobile ? 'stretch' : 'center',
          marginBottom: spacing.lg,
        }}>
          <input
            type="date"
            value={newDoubleDayDate}
            onChange={(e) => {
              setNewDoubleDayDate(e.target.value);
              if (doubleDayError) setDoubleDayError('');
            }}
            min={todayInTimezone(competitionTimezone)}
            style={{
              flex: 1,
              padding: `${spacing.sm} ${spacing.md}`,
              background: colors.background.secondary,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: borderRadius.md,
              color: colors.text.primary,
              fontSize: typography.fontSize.base,
              colorScheme: 'dark',
            }}
          />
          <Button
            size="sm"
            icon={Plus}
            onClick={handleAddDoubleDay}
            disabled={doubleDaySaving || !newDoubleDayDate}
          >
            {doubleDaySaving ? 'Adding…' : 'Add Date'}
          </Button>
        </div>

        {doubleDayError && (
          <p style={{
            color: colors.status.error,
            fontSize: typography.fontSize.sm,
            marginBottom: spacing.md,
          }}>
            {doubleDayError}
          </p>
        )}

        {doubleDays.length === 0 ? (
          <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.text.secondary }}>
            <Zap size={48} style={{ marginBottom: spacing.md, opacity: 0.5, color: colors.gold.primary }} />
            <p>No double vote days scheduled</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: spacing.sm }}>
            {doubleDays.map((day) => {
              const dateObj = parseDateLocal(day.date);
              // Compare against today in the competition's timezone, matching
              // the server-side today_for_competition() function.
              const todayStr = todayInTimezone(competitionTimezone);
              const isToday = day.date === todayStr;
              const isPast = day.date < todayStr;
              return (
                <div key={day.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.md,
                  padding: spacing.md,
                  background: colors.background.secondary,
                  borderRadius: borderRadius.md,
                  border: isToday ? `1px solid ${colors.gold.primary}` : `1px solid ${colors.border.secondary}`,
                  opacity: isPast ? 0.55 : 1,
                }}>
                  <Zap size={18} style={{ color: colors.gold.primary, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: typography.fontWeight.medium }}>
                      {dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {isToday && <Badge variant="gold" size="sm">Active today</Badge>}
                  {isPast && !isToday && <Badge variant="secondary" size="sm">Past</Badge>}
                  <button
                    onClick={() => onDeleteDoubleDay(day.id)}
                    style={{
                      padding: spacing.sm,
                      background: 'transparent',
                      border: `1px solid rgba(239,68,68,0.3)`,
                      borderRadius: borderRadius.md,
                      color: '#ef4444',
                      cursor: 'pointer',
                      minWidth: '36px',
                      minHeight: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
