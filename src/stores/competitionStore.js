/**
 * Competition Store - Centralized competition state with Zustand
 * 
 * Consolidates competition state from:
 * - CompetitionContext.jsx (selected competition, contestants, events, etc.)
 * - PublicCompetitionContext.jsx (active public competition)
 * - App.jsx hostCompetition state
 */
import { create } from 'zustand';

export const useCompetitionStore = create((set, get) => ({
  // ========== Active Competition (Public View) ==========
  activeCompetition: null,
  organization: null,

  // ========== Host's Competition (Dashboard) ==========
  hostCompetition: null,

  // ========== Competition Data ==========
  contestants: [],
  events: [],
  announcements: [],
  sponsors: [],
  judges: [],
  votingRounds: [],
  nominationPeriods: [],
  rules: null,

  // ========== Phase/Status ==========
  phase: null,
  about: null,
  theme: null,

  // ========== Loading States ==========
  isLoading: false,
  error: null,

  // ========== Sort State ==========
  sortBy: 'votes', // 'votes', 'name', 'recent'

  // ========== Actions: Active Competition ==========
  setActiveCompetition: (competition) => set({ 
    activeCompetition: competition,
    error: null,
  }),

  setOrganization: (organization) => set({ organization }),

  setPhase: (phase) => set({ phase }),

  // ========== Actions: Host Competition ==========
  setHostCompetition: (competition) => set({ 
    hostCompetition: competition,
  }),

  clearHostCompetition: () => set({ hostCompetition: null }),

  // ========== Actions: Contestants ==========
  setContestants: (contestants) => set({ contestants }),

  addContestant: (contestant) => set((state) => ({
    contestants: [
      ...state.contestants,
      { id: `c${Date.now()}`, votes: 0, rank: state.contestants.length + 1, ...contestant },
    ],
  })),

  updateContestant: (contestantId, updates) => set((state) => ({
    contestants: state.contestants.map((c) =>
      c.id === contestantId ? { ...c, ...updates } : c
    ),
  })),

  removeContestant: (contestantId) => set((state) => ({
    contestants: state.contestants.filter((c) => c.id !== contestantId),
  })),

  // Update votes and re-rank
  updateContestantVotes: (id, votes) => set((state) => {
    const updated = state.contestants
      .map((c) => (c.id === id ? { ...c, votes } : c))
      .sort((a, b) => b.votes - a.votes)
      .map((c, i) => ({ ...c, rank: i + 1 }));
    return { contestants: updated };
  }),

  // Increment votes by amount
  incrementVotes: (id, amount = 1) => set((state) => {
    const updated = state.contestants
      .map((c) => (c.id === id ? { ...c, votes: (c.votes || 0) + amount } : c))
      .sort((a, b) => b.votes - a.votes)
      .map((c, i) => ({ ...c, rank: i + 1 }));
    return { contestants: updated };
  }),

  // ========== Actions: Events ==========
  setEvents: (events) => set({ events }),

  addEvent: (event) => set((state) => ({
    events: [...state.events, { id: `e${Date.now()}`, ...event }],
  })),

  updateEvent: (eventId, updates) => set((state) => ({
    events: state.events.map((e) =>
      e.id === eventId ? { ...e, ...updates } : e
    ),
  })),

  removeEvent: (eventId) => set((state) => ({
    events: state.events.filter((e) => e.id !== eventId),
  })),

  // ========== Actions: Announcements ==========
  setAnnouncements: (announcements) => set({ announcements }),

  addAnnouncement: (announcement) => set((state) => ({
    announcements: [
      { id: `a${Date.now()}`, createdAt: new Date().toISOString(), ...announcement },
      ...state.announcements,
    ],
  })),

  removeAnnouncement: (announcementId) => set((state) => ({
    announcements: state.announcements.filter((a) => a.id !== announcementId),
  })),

  // ========== Actions: Sponsors ==========
  setSponsors: (sponsors) => set({ sponsors }),

  addSponsor: (sponsor) => set((state) => ({
    sponsors: [...state.sponsors, { id: `s${Date.now()}`, ...sponsor }],
  })),

  updateSponsor: (sponsorId, updates) => set((state) => ({
    sponsors: state.sponsors.map((s) =>
      s.id === sponsorId ? { ...s, ...updates } : s
    ),
  })),

  removeSponsor: (sponsorId) => set((state) => ({
    sponsors: state.sponsors.filter((s) => s.id !== sponsorId),
  })),

  // ========== Actions: Judges ==========
  setJudges: (judges) => set({ judges }),

  addJudge: (judge) => set((state) => ({
    judges: [...state.judges, { id: `j${Date.now()}`, ...judge }],
  })),

  updateJudge: (judgeId, updates) => set((state) => ({
    judges: state.judges.map((j) =>
      j.id === judgeId ? { ...j, ...updates } : j
    ),
  })),

  removeJudge: (judgeId) => set((state) => ({
    judges: state.judges.filter((j) => j.id !== judgeId),
  })),

  // ========== Actions: Voting/Nomination Data ==========
  setVotingRounds: (votingRounds) => set({ votingRounds }),
  setNominationPeriods: (nominationPeriods) => set({ nominationPeriods }),
  setRules: (rules) => set({ rules }),
  setAbout: (about) => set({ about }),
  setTheme: (theme) => set({ theme }),

  // ========== Actions: Sorting ==========
  setSortBy: (sortBy) => set({ sortBy }),

  changeSort: (newSort) => set((state) => {
    if (state.sortBy === newSort) return state;
    
    let sorted = [...state.contestants];
    switch (newSort) {
      case 'votes':
        sorted.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        break;
      case 'name':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'recent':
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
      default:
        break;
    }
    
    return { 
      sortBy: newSort,
      contestants: sorted.map((c, i) => ({ ...c, rank: i + 1 })),
    };
  }),

  // ========== Actions: Loading/Error ==========
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // ========== Selectors ==========
  // Get contestant by ID
  getContestant: (id) => {
    const { contestants } = get();
    return contestants.find((c) => c.id === id);
  },

  // Get contestant by slug
  getContestantBySlug: (slug) => {
    const { contestants } = get();
    return contestants.find((c) => c.slug === slug);
  },

  // Get top N contestants
  getTopContestants: (n = 3) => {
    const { contestants } = get();
    return contestants
      .slice()
      .sort((a, b) => (b.votes || 0) - (a.votes || 0))
      .slice(0, n);
  },

  // Get contestants in danger zone (bottom 20%)
  getDangerZone: (threshold = 0.2) => {
    const { contestants } = get();
    if (contestants.length < 5) return [];
    const cutoff = Math.max(1, Math.floor(contestants.length * threshold));
    return contestants
      .slice()
      .sort((a, b) => (a.votes || 0) - (b.votes || 0))
      .slice(0, cutoff);
  },

  // Competition stats
  getStats: () => {
    const { contestants, sponsors, judges, events } = get();
    const totalVotes = contestants.reduce((sum, c) => sum + (c.votes || 0), 0);
    const sponsorshipTotal = sponsors.reduce((sum, s) => sum + (s.amount || 0), 0);
    
    return {
      contestantCount: contestants.length,
      judgeCount: judges.length,
      sponsorCount: sponsors.length,
      eventCount: events.length,
      totalVotes,
      sponsorshipTotal,
    };
  },

  // ========== Bulk Updates ==========
  setCompetitionData: (data) => set({
    activeCompetition: data.competition ?? get().activeCompetition,
    organization: data.organization ?? get().organization,
    contestants: data.contestants ?? get().contestants,
    events: data.events ?? get().events,
    announcements: data.announcements ?? get().announcements,
    sponsors: data.sponsors ?? get().sponsors,
    votingRounds: data.votingRounds ?? get().votingRounds,
    nominationPeriods: data.nominationPeriods ?? get().nominationPeriods,
    rules: data.rules ?? get().rules,
    phase: data.phase ?? get().phase,
    about: data.about ?? get().about,
    theme: data.theme ?? get().theme,
  }),

  // ========== Reset ==========
  resetActiveCompetition: () => set({
    activeCompetition: null,
    organization: null,
    contestants: [],
    events: [],
    announcements: [],
    sponsors: [],
    votingRounds: [],
    nominationPeriods: [],
    rules: null,
    phase: null,
    about: null,
    theme: null,
    isLoading: false,
    error: null,
  }),

  resetAll: () => set({
    activeCompetition: null,
    organization: null,
    hostCompetition: null,
    contestants: [],
    events: [],
    announcements: [],
    sponsors: [],
    judges: [],
    votingRounds: [],
    nominationPeriods: [],
    rules: null,
    phase: null,
    about: null,
    theme: null,
    isLoading: false,
    error: null,
    sortBy: 'votes',
  }),
}));

// ========== Convenience Hooks ==========

export const useActiveCompetition = () => useCompetitionStore((state) => state.activeCompetition);

export const useHostCompetition = () => useCompetitionStore((state) => state.hostCompetition);

export const useContestants = () => useCompetitionStore((state) => state.contestants);

export const useTopThree = () => useCompetitionStore((state) => {
  return state.contestants
    .slice()
    .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    .slice(0, 3);
});

export const useDangerZone = (threshold = 0.2) => useCompetitionStore((state) => {
  const { contestants } = state;
  if (contestants.length < 5) return [];
  const cutoff = Math.max(1, Math.floor(contestants.length * threshold));
  return contestants
    .slice()
    .sort((a, b) => (a.votes || 0) - (b.votes || 0))
    .slice(0, cutoff);
});

export const useCompetitionPhase = () => useCompetitionStore((state) => state.phase);

export const useCompetitionLoading = () => useCompetitionStore((state) => state.isLoading);

export default useCompetitionStore;
