import { describe, it, expect } from 'vitest';
import {
  normalizeStatus,
  computeCompetitionPhase,
  isCompetitionVisible,
  isCompetitionAccessible,
  COMPETITION_STATUSES,
} from './competitionPhase';
import { getCompetitionPhase } from './getCompetitionPhase';

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

describe('normalizeStatus', () => {
  it('keeps the approval-lifecycle statuses distinct instead of collapsing to draft', () => {
    expect(normalizeStatus('pending_approval')).toBe(COMPETITION_STATUSES.PENDING_APPROVAL);
    expect(normalizeStatus('pending-approval')).toBe(COMPETITION_STATUSES.PENDING_APPROVAL);
    expect(normalizeStatus('under_review')).toBe(COMPETITION_STATUSES.PENDING_APPROVAL);
    expect(normalizeStatus('approved')).toBe(COMPETITION_STATUSES.APPROVED);
    expect(normalizeStatus('cancelled')).toBe(COMPETITION_STATUSES.CANCELLED);
    expect(normalizeStatus('canceled')).toBe(COMPETITION_STATUSES.CANCELLED);
  });

  it('maps live sub-phases stored directly in status to live', () => {
    expect(normalizeStatus('voting')).toBe(COMPETITION_STATUSES.LIVE);
    expect(normalizeStatus('nomination')).toBe(COMPETITION_STATUSES.LIVE);
    expect(normalizeStatus('finals')).toBe(COMPETITION_STATUSES.LIVE);
  });

  it('still falls back to draft for genuinely unknown values', () => {
    expect(normalizeStatus('banana')).toBe(COMPETITION_STATUSES.DRAFT);
    expect(normalizeStatus(null)).toBe(COMPETITION_STATUSES.DRAFT);
  });
});

describe('computeCompetitionPhase', () => {
  it('returns the canonical lifecycle status for non-live competitions', () => {
    expect(computeCompetitionPhase({ status: 'pending_approval' })).toBe('pending_approval');
    expect(computeCompetitionPhase({ status: 'approved' })).toBe('approved');
    expect(computeCompetitionPhase({ status: 'cancelled' })).toBe('cancelled');
    expect(computeCompetitionPhase({ status: 'publish' })).toBe('publish');
  });

  it('computes the timeline sub-phase when a live comp is in a voting round', () => {
    const comp = {
      status: 'live',
      voting_rounds: [
        { round_order: 1, round_type: 'voting', start_date: daysFromNow(-1), end_date: daysFromNow(1) },
      ],
    };
    expect(computeCompetitionPhase(comp)).toBe('voting');
  });
});

describe('getCompetitionPhase visibility', () => {
  it('treats under-review and approved competitions as not public', () => {
    const review = getCompetitionPhase({ status: 'pending_approval' });
    expect(review.phase).toBe('pending-approval');
    expect(review.isPublic).toBe(false);

    const approved = getCompetitionPhase({ status: 'approved' });
    expect(approved.phase).toBe('approved');
    expect(approved.isPublic).toBe(false);
  });

  it('resolves the (previously dead) cancelled branch', () => {
    const cancelled = getCompetitionPhase({ status: 'cancelled' });
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.isPublic).toBe(false);
  });

  it('reports an active voting round as public voting', () => {
    const comp = {
      status: 'live',
      voting_rounds: [
        { round_order: 1, round_type: 'voting', start_date: daysFromNow(-1), end_date: daysFromNow(1) },
      ],
    };
    const phase = getCompetitionPhase(comp, comp.voting_rounds);
    expect(phase.isVoting).toBe(true);
    expect(phase.isPublic).toBe(true);
  });
});

describe('status visibility helpers', () => {
  it('does not expose lifecycle-pre-publish statuses publicly', () => {
    for (const s of ['pending_approval', 'approved', 'cancelled', 'draft']) {
      expect(isCompetitionVisible(s)).toBe(false);
      expect(isCompetitionAccessible(s)).toBe(false);
    }
  });

  it('exposes published, live and completed competitions', () => {
    expect(isCompetitionVisible('publish')).toBe(true);
    expect(isCompetitionVisible('live')).toBe(true);
    expect(isCompetitionVisible('completed')).toBe(true);
    expect(isCompetitionAccessible('live')).toBe(true);
    expect(isCompetitionAccessible('completed')).toBe(true);
  });
});
