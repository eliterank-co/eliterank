import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { Check, Trophy, Calendar, MapPin } from 'lucide-react';
import { formatDate } from '../../../utils/formatters';

/**
 * Competition timeline — the three high-level phases (Entry | Voting | Finale)
 * plus any host-uploaded events, interleaved chronologically so fans see the
 * full schedule in order.
 */
export function Timeline() {
  const { competition, votingRounds, nominationPeriods, events } = usePublicCompetition();

  // --- Build 3 high-level phases ---

  // 1. Entry period — earliest nom start → latest nom end
  let entryStart = null;
  let entryEnd = null;

  if (nominationPeriods?.length > 0) {
    const starts = nominationPeriods.map(np => np.start_date).filter(Boolean);
    const ends = nominationPeriods.map(np => np.end_date).filter(Boolean);
    if (starts.length) entryStart = starts.sort()[0];
    if (ends.length) entryEnd = ends.sort().pop();
  } else {
    entryStart = competition?.nomination_start;
    entryEnd = competition?.nomination_end;
  }

  // 2. Voting period — earliest round start → latest round end
  let votingStart = null;
  let votingEnd = null;
  const rounds = votingRounds || [];
  if (rounds.length > 0) {
    const starts = rounds.map(r => r.start_date).filter(Boolean);
    const ends = rounds.map(r => r.end_date).filter(Boolean);
    if (starts.length) votingStart = starts.sort()[0];
    if (ends.length) votingEnd = ends.sort().pop();
  }

  // 3. Finale
  const finaleDate = competition?.finals_date;

  const phases = [
    entryStart || entryEnd ? {
      id: 'entry',
      kind: 'phase',
      title: 'Entry Period',
      subtitle: 'Nominations open',
      date: entryStart,
      endDate: entryEnd,
      status: getPeriodStatus(entryStart, entryEnd),
    } : null,
    votingStart || votingEnd ? {
      id: 'voting',
      kind: 'phase',
      title: 'Voting Period',
      subtitle: rounds.length > 1 ? `${rounds.length} rounds of public voting` : 'Public voting',
      date: votingStart,
      endDate: votingEnd,
      status: getPeriodStatus(votingStart, votingEnd),
      rounds: [...rounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0)),
    } : null,
    finaleDate ? {
      id: 'finale',
      kind: 'phase',
      title: 'Finale',
      subtitle: 'Live crowning event',
      date: finaleDate,
      status: getFinaleStatus(finaleDate),
      isFinale: true,
    } : null,
  ].filter(Boolean);

  // --- Host-uploaded events ---
  // `events` arrives already filtered to public + date-sorted from the data
  // layer; we map each to its own timeline item so they show alongside the
  // macro phases with the host's name, dates, time and location.
  const eventItems = (events || [])
    .filter((e) => e && e.date)
    .map((e) => ({
      id: `event-${e.id}`,
      kind: 'event',
      title: e.name || 'Event',
      date: e.date,
      endDate: e.end_date || null,
      time: e.time || null,
      location: e.location || null,
      status: getEventStatus(e.date, e.end_date),
    }));

  // Merge and sort chronologically by start date. Undated items sink to the
  // end; on a same-day tie the macro phase sorts ahead of an event.
  const items = [...phases, ...eventItems].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : Infinity;
    const db = b.date ? new Date(b.date).getTime() : Infinity;
    if (da !== db) return da - db;
    if (a.kind !== b.kind) return a.kind === 'phase' ? -1 : 1;
    return 0;
  });

  if (items.length === 0) {
    return null;
  }

  // Only the macro phases carry a step number; events get a calendar marker.
  let phaseNumber = 0;

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h4 className="section-label">Timeline</h4>
      </div>

      <div className="timeline-body">
        <div className="timeline-list">
          {items.map((item, index) => {
            if (item.kind === 'phase') phaseNumber += 1;
            return (
              <div
                key={item.id}
                className={`timeline-item timeline-item-${item.status}`}
              >
                <div className="timeline-marker">
                  <div className={`timeline-step timeline-step-${item.status}`}>
                    {item.kind === 'event' ? (
                      <Calendar size={13} />
                    ) : item.status === 'complete' ? (
                      <Check size={14} />
                    ) : item.isFinale ? (
                      <Trophy size={14} />
                    ) : (
                      <span className="timeline-step-number">{phaseNumber}</span>
                    )}
                  </div>
                  {index < items.length - 1 && (
                    <div className={`timeline-line timeline-line-${item.status}`} />
                  )}
                </div>
                <div className="timeline-content">
                  <span className="timeline-title">{item.title}</span>
                  <span className="timeline-date">
                    {formatDate(item.date)}
                    {item.endDate && item.endDate !== item.date && (
                      <> — {formatDate(item.endDate)}</>
                    )}
                    {item.kind === 'event' && item.time && (
                      <> · {formatEventTime(item.time)}</>
                    )}
                  </span>
                  {item.subtitle && (
                    <span className="timeline-subtitle">{item.subtitle}</span>
                  )}
                  {item.kind === 'event' && item.location && (
                    <span className="timeline-subtitle timeline-event-location">
                      <MapPin size={11} />
                      {item.location}
                    </span>
                  )}
                  {item.rounds && item.rounds.length > 0 && (
                    <ul className="timeline-rounds">
                      {item.rounds.map((r) => (
                        <li key={r.id || r.round_order} className="timeline-round">
                          <span className="timeline-round-title">{r.title || `Round ${r.round_order}`}</span>
                          <span className="timeline-round-dates">
                            {r.start_date && formatDate(r.start_date)}
                            {r.end_date && r.end_date !== r.start_date && (
                              <> — {formatDate(r.end_date)}</>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getPeriodStatus(startDate, endDate) {
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start && !end) return 'upcoming';
  if (end && now > end) return 'complete';
  if (start && end && now >= start && now <= end) return 'active';
  if (start && !end && now >= start) return 'active';
  return 'upcoming';
}

function getFinaleStatus(finaleDate) {
  const now = new Date();
  const finale = new Date(finaleDate);

  const finaleDay = new Date(finale.getFullYear(), finale.getMonth(), finale.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (today > finaleDay) return 'complete';
  if (today.getTime() === finaleDay.getTime()) return 'active';
  return 'upcoming';
}

/**
 * Day-based status for a host event. Events store plain dates (no time zone),
 * so we compare whole days: past → complete, within [start, end] → active,
 * future → upcoming. `endDate` is optional (single-day events).
 */
function getEventStatus(startDate, endDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const s = new Date(startDate);
  const start = new Date(s.getFullYear(), s.getMonth(), s.getDate());

  let end = start;
  if (endDate) {
    const e = new Date(endDate);
    end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  }

  if (today.getTime() > end.getTime()) return 'complete';
  if (today.getTime() >= start.getTime() && today.getTime() <= end.getTime()) return 'active';
  return 'upcoming';
}

/** "19:00:00" / "19:00" → "7:00 PM". Returns '' for unparseable input. */
function formatEventTime(value) {
  if (!value || typeof value !== 'string') return '';
  const [hStr, mStr = '00'] = value.split(':');
  let hours = parseInt(hStr, 10);
  if (Number.isNaN(hours)) return '';
  const minutes = mStr.padStart(2, '0').slice(0, 2);
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
}

export default Timeline;
