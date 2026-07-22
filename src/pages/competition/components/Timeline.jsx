import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { Check, Trophy, Calendar } from 'lucide-react';
import { formatDate, formatEventTime } from '../../../utils/formatters';

/**
 * Competition timeline — the high-level journey:
 * Entry Period | Voting Period | Finale, with any events the competition is
 * hosting interleaved chronologically as their own milestones.
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
      title: 'Entry Period',
      subtitle: 'Nominations open',
      date: entryStart,
      endDate: entryEnd,
      status: getPeriodStatus(entryStart, entryEnd),
    } : null,
    votingStart || votingEnd ? {
      id: 'voting',
      title: 'Voting Period',
      subtitle: rounds.length > 1 ? `${rounds.length} rounds of public voting` : 'Public voting',
      date: votingStart,
      endDate: votingEnd,
      status: getPeriodStatus(votingStart, votingEnd),
      rounds: [...rounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0)),
    } : null,
    finaleDate ? {
      id: 'finale',
      title: 'Finale',
      subtitle: 'Live crowning event',
      date: finaleDate,
      status: getFinaleStatus(finaleDate),
      isFinale: true,
    } : null,
  ].filter(Boolean);

  // Number the high-level phases (1, 2, …) in their natural order up front so
  // the count stays stable no matter where events land once interleaved. The
  // finale keeps its trophy instead of a number.
  const phaseNodes = phases.map((p, i) => ({ ...p, kind: 'phase', stepNumber: i + 1 }));

  // Events the competition is hosting become their own milestones on the
  // timeline (a launch party, mixer, the crowning gala, …). `events` is already
  // filtered to publicly-visible rows and sorted by date upstream.
  const eventNodes = (events || []).map((e) => ({
    id: `event-${e.id}`,
    kind: 'event',
    title: e.name,
    date: e.date || null,
    time: e.time || null,
    location: e.location || e.venue || null,
    ticketUrl: e.ticket_url || e.ticketUrl || null,
    status: getEventStatus(e.date),
  }));

  // Merge phases + events into a single chronological list. Nodes without a
  // date (e.g. an event with a TBD date) sort to the end.
  const nodes = [...phaseNodes, ...eventNodes].sort(
    (a, b) => timelineSortKey(a) - timelineSortKey(b),
  );

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h4 className="section-label">Timeline</h4>
      </div>

      <div className="timeline-body">
        <div className="timeline-list">
          {nodes.map((item, index) => (
            <div
              key={item.id}
              className={`timeline-item timeline-item-${item.status}${item.kind === 'event' ? ' timeline-item-event' : ''}`}
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
                    <span className="timeline-step-number">{item.stepNumber}</span>
                  )}
                </div>
                {index < nodes.length - 1 && (
                  <div className={`timeline-line timeline-line-${item.status}`} />
                )}
              </div>
              <div className="timeline-content">
                <span className="timeline-title">{item.title}</span>
                <span className="timeline-date">
                  {item.date ? formatDate(item.date) : 'Date TBD'}
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
                  <span className="timeline-subtitle">{item.location}</span>
                )}
                {item.kind === 'event' && item.ticketUrl && (
                  <a
                    className="timeline-event-link"
                    href={item.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get tickets →
                  </a>
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
          ))}
        </div>
      </div>
    </div>
  );
}

// Comparable timestamp for ordering a timeline node. Phases sort by their start
// (falling back to end); events by their date. Missing dates sort last.
function timelineSortKey(node) {
  const raw = node.kind === 'event' ? node.date : (node.date || node.endDate);
  if (!raw) return Infinity;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? Infinity : t;
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

// Events resolve to a single day, so compare on the calendar day: past → done,
// today → active, future → upcoming. An event without a date is treated as
// upcoming (it renders "Date TBD").
function getEventStatus(eventDate) {
  if (!eventDate) return 'upcoming';
  const now = new Date();
  const [y, m, d] = eventDate.split('T')[0].split('-').map(Number);
  const eventDay = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (today > eventDay) return 'complete';
  if (today.getTime() === eventDay.getTime()) return 'active';
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

export default Timeline;
