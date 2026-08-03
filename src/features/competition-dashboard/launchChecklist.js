import {
  Sparkles,
  UserCircle,
  CalendarClock,
  Vote,
  Trophy,
  Zap,
  ClipboardList,
  Scale,
  Gift,
  Heart,
  CalendarHeart,
  Users,
} from 'lucide-react';

/**
 * Launch checklist definitions.
 *
 * The host dashboard shows a guided, sequenced set of launch tasks so getting a
 * competition live feels like completing a checklist rather than staring at a
 * wall of always-editable settings. Each step computes its own status from the
 * real dashboard data and carries a deep-link target so its CTA can drop the
 * host on the exact tab/section that completes it.
 *
 * Checklists are template-driven. Most Eligible has a fixed framework; other
 * organizations get a leaner general default. `resolveLaunchChecklist` picks the
 * template for a competition. The resolver is the single extension point for
 * future org-level controls — once organizations can define their own launch
 * to-dos (e.g. a `launch_checklist` config on the org/competition row), wire
 * that lookup in here and fall back to these built-ins.
 */

// Status values a step can report.
export const STEP_STATUS = {
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  INCOMPLETE: 'incomplete',
};

// Only completed self-nominations that have claimed a profile count as real
// nominees the host can review (mirrors OverviewTab's nominee accounting).
function reviewableNominees(nominees = []) {
  return (nominees || []).filter(
    (n) => !(n.nominatedBy === 'self' && !n.claimedAt)
  );
}

// ---------------------------------------------------------------------------
// Step definitions. `ctx` is the dashboard data bag:
//   { competition, host, nominees, contestants, judges, judgingCriteria,
//     prizes, events, sponsors, doubleDays }
// ---------------------------------------------------------------------------

const STEP_CREATE = {
  id: 'create',
  icon: Sparkles,
  title: 'Competition created',
  description: 'Category, city, season and economics are set by the admin.',
  managedBy: 'admin',
  // The dashboard only exists once the competition does, so this is always done.
  getStatus: () => STEP_STATUS.COMPLETE,
  target: null,
};

const STEP_PROFILE = {
  id: 'profile',
  icon: UserCircle,
  title: 'Set up your host profile',
  description: 'Add your photo and bio — this is what the public sees as the face of the competition.',
  getStatus: ({ host }) => {
    const hasAvatar = !!host?.avatar;
    const hasBio = !!(host?.bio && host.bio.trim());
    if (hasAvatar && hasBio) return STEP_STATUS.COMPLETE;
    if (hasAvatar || hasBio) return STEP_STATUS.PARTIAL;
    return STEP_STATUS.INCOMPLETE;
  },
  getDetail: ({ host }) => {
    const missing = [];
    if (!host?.avatar) missing.push('photo');
    if (!(host?.bio && host.bio.trim())) missing.push('bio');
    return missing.length ? `Add your ${missing.join(' and ')}` : null;
  },
  // Routed to the host's own profile page, where they can edit it.
  target: { type: 'profile' },
  ctaLabel: 'Edit profile',
};

const STEP_NOMINATION_DATES = {
  id: 'nominationDates',
  icon: CalendarClock,
  title: 'Set nomination dates',
  description: 'Define the window when people can nominate or apply.',
  // Host-upload competitions have no nomination period — the host provides the
  // roster directly — so this step doesn't apply to them.
  appliesTo: ({ competition }) =>
    (competition?.entryType || competition?.entry_type) !== 'host_upload',
  getStatus: ({ competition }) => {
    const hasNomination = (competition?.nomination_periods || []).some(
      (p) => p.start_date && p.end_date
    ) || !!competition?.nominationStart;
    return hasNomination ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE;
  },
  target: { type: 'tab', tab: 'setup', section: 'timeline' },
  ctaLabel: 'Set dates',
};

const STEP_VOTING_ROUNDS = {
  id: 'votingRounds',
  icon: Vote,
  title: 'Set voting round dates',
  description: 'Schedule your voting and judging rounds — your last round decides the winners.',
  getStatus: ({ competition }) => {
    const rounds = competition?.voting_rounds || [];
    const hasDatedRound = rounds.some((r) => r.start_date && r.end_date);
    return hasDatedRound ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE;
  },
  target: { type: 'tab', tab: 'setup', section: 'timeline' },
  ctaLabel: 'Set rounds',
};

const STEP_FINALE = {
  id: 'finale',
  icon: Trophy,
  title: 'Set the finale date',
  description: 'The official close date — flips the competition to Completed after your last round ends. Winners are already decided by the rounds; this is the public finale/reveal date (optional).',
  optional: true,
  getStatus: ({ competition }) =>
    competition?.finalsDate ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'setup', section: 'timeline' },
  ctaLabel: 'Set finale',
};

const STEP_NOMINATION_FORM = {
  id: 'nominationForm',
  icon: ClipboardList,
  title: 'Customize the nomination form',
  description: 'Add your own questions to the nomination form (optional).',
  optional: true,
  // No nomination form for host-upload competitions.
  appliesTo: ({ competition }) =>
    (competition?.entryType || competition?.entry_type) !== 'host_upload',
  getStatus: ({ competition }) => {
    const questions = competition?.nominationFormConfig?.custom_questions || [];
    return questions.length > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE;
  },
  target: { type: 'tab', tab: 'setup', section: 'nominationForm' },
  ctaLabel: 'Add questions',
};

const STEP_JUDGES = {
  id: 'judges',
  icon: Users,
  title: 'Add your judges',
  description: 'Invite the judges who will score contestants. Manage them on the People tab.',
  getStatus: ({ judges }) =>
    (judges?.length || 0) > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'people' },
  ctaLabel: 'Add judges',
};

const STEP_JUDGING_CRITERIA = {
  id: 'judgingCriteria',
  icon: Scale,
  title: 'Add judging criteria',
  description: 'Define the qualities judges score on, and how much judging counts each round.',
  getStatus: ({ judgingCriteria }) =>
    (judgingCriteria?.length || 0) > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'setup', section: 'judgingCriteria' },
  ctaLabel: 'Add criteria',
};

const STEP_PRIZES = {
  id: 'prizes',
  icon: Gift,
  title: 'Add prizes',
  description: 'Add the prizes winners take home (via a sponsor in Setup).',
  getStatus: ({ prizes }) =>
    (prizes?.length || 0) > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'setup', section: 'sponsors' },
  ctaLabel: 'Add prizes',
};

const STEP_CHARITY = {
  id: 'charity',
  icon: Heart,
  title: 'Add a charity partner',
  description: 'Link the charity your competition supports (optional).',
  optional: true,
  getStatus: ({ competition }) =>
    competition?.charityName ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'setup', section: 'charity' },
  ctaLabel: 'Add charity',
};

const STEP_EVENTS = {
  id: 'events',
  icon: CalendarHeart,
  title: 'Add your IRL events',
  description: 'Schedule the in-person events for the competition (optional).',
  optional: true,
  getStatus: ({ events }) =>
    (events?.length || 0) > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'engagement', section: 'events' },
  ctaLabel: 'Add events',
};

const STEP_DOUBLE_VOTE_DAYS = {
  id: 'doubleVoteDays',
  icon: Zap,
  title: 'Set double-vote days',
  description: 'Pick days when every vote counts double (optional).',
  optional: true,
  getStatus: ({ doubleDays }) =>
    (doubleDays?.length || 0) > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'engagement', section: 'doubleVoteDays' },
  ctaLabel: 'Set days',
};

const STEP_BONUS_TASKS = {
  id: 'bonusTasks',
  icon: Gift,
  title: 'Create bonus vote tasks',
  description: 'Reward contestants with bonus votes for completing tasks (optional).',
  optional: true,
  getStatus: ({ bonusTasks }) =>
    (bonusTasks?.length || 0) > 0 ? STEP_STATUS.COMPLETE : STEP_STATUS.INCOMPLETE,
  target: { type: 'tab', tab: 'engagement', section: 'bonusVotes' },
  ctaLabel: 'Create tasks',
};

const STEP_NOMINEES = {
  id: 'nominees',
  icon: Users,
  title: 'Get your first nominees & review them',
  description: 'Share the nomination link, then approve or decline who comes in.',
  getStatus: ({ nominees }) => {
    const reviewable = reviewableNominees(nominees);
    if (reviewable.length === 0) return STEP_STATUS.INCOMPLETE;
    const pending = reviewable.filter((n) => n.status === 'pending').length;
    return pending > 0 ? STEP_STATUS.PARTIAL : STEP_STATUS.COMPLETE;
  },
  getDetail: ({ nominees }) => {
    const reviewable = reviewableNominees(nominees);
    const pending = reviewable.filter((n) => n.status === 'pending').length;
    if (reviewable.length === 0) return null;
    return pending > 0
      ? `${pending} awaiting your approval`
      : `${reviewable.length} reviewed`;
  },
  target: { type: 'tab', tab: 'people' },
  ctaLabel: 'Review nominees',
};

// ---------------------------------------------------------------------------
// Templates
//
// `steps` are the launch (setup) tasks. Once every required launch step is
// done, the dashboard flips the checklist into "run" mode and shows `runSteps`
// — the ongoing tasks of operating a live competition (e.g. reviewing
// nominees), which aren't part of getting set up.
// ---------------------------------------------------------------------------

// Most Eligible's full launch framework, in launch order.
export const MOST_ELIGIBLE_CHECKLIST = {
  id: 'most-eligible',
  title: 'Launch Checklist',
  steps: [
    STEP_CREATE,
    STEP_PROFILE,
    STEP_NOMINATION_DATES,
    STEP_VOTING_ROUNDS,
    STEP_FINALE,
    STEP_NOMINATION_FORM,
    STEP_JUDGES,
    STEP_JUDGING_CRITERIA,
    STEP_PRIZES,
    STEP_CHARITY,
    STEP_EVENTS,
    STEP_DOUBLE_VOTE_DAYS,
    STEP_BONUS_TASKS,
  ],
  runTitle: 'Run your competition',
  runSteps: [STEP_NOMINEES],
};

// Leaner default for competitions outside the Most Eligible framework: just the
// core steps every competition needs, without the brand-specific extras.
export const GENERAL_CHECKLIST = {
  id: 'general',
  title: 'Launch Checklist',
  steps: [
    STEP_CREATE,
    STEP_PROFILE,
    STEP_NOMINATION_DATES,
    STEP_VOTING_ROUNDS,
    STEP_FINALE,
    STEP_JUDGES,
    STEP_JUDGING_CRITERIA,
    STEP_PRIZES,
    STEP_CHARITY,
    STEP_DOUBLE_VOTE_DAYS,
    STEP_BONUS_TASKS,
  ],
  runTitle: 'Run your competition',
  runSteps: [STEP_NOMINEES],
};

// Built-in per-organization templates, keyed by a lowercased org name match.
const ORG_TEMPLATES = [
  { match: (name) => name.includes('most eligible'), checklist: MOST_ELIGIBLE_CHECKLIST },
];

/**
 * Resolve which launch checklist a competition should use.
 *
 * Resolution order (extend the first branch when org-level config lands):
 *   1. Org/competition-defined launch to-dos (future DB config) — not yet wired.
 *   2. Built-in per-organization template (e.g. Most Eligible).
 *   3. General default.
 */
export function resolveLaunchChecklist(competition) {
  const orgName = (competition?.organizationName || '').toLowerCase();
  const orgTemplate = ORG_TEMPLATES.find((t) => t.match(orgName));
  if (orgTemplate) return orgTemplate.checklist;
  return GENERAL_CHECKLIST;
}

/**
 * Compute per-step status plus an overall progress summary for a checklist.
 * Optional steps are tracked but excluded from the required-progress count so a
 * host can launch without them.
 */
export function computeChecklistProgress(checklist, ctx) {
  const steps = checklist.steps
    // Steps can opt out for competitions they don't apply to (e.g. nomination
    // steps on a host-upload competition). Excluded steps never affect progress.
    .filter((step) => !step.appliesTo || step.appliesTo(ctx))
    .map((step) => {
      const status = step.getStatus(ctx);
      return {
        ...step,
        status,
        detail: step.getDetail ? step.getDetail(ctx) : null,
      };
    });

  const required = steps.filter((s) => !s.optional);
  const requiredComplete = required.filter(
    (s) => s.status === STEP_STATUS.COMPLETE
  ).length;

  // Counts across every step (optional included) — used for the displayed
  // progress so the counter matches the numbered list. `allRequiredComplete`
  // (required-only) still governs whether launch is "done".
  const completedCount = steps.filter((s) => s.status === STEP_STATUS.COMPLETE).length;

  return {
    steps,
    requiredComplete,
    requiredTotal: required.length,
    completedCount,
    totalCount: steps.length,
    allRequiredComplete: requiredComplete === required.length,
  };
}
