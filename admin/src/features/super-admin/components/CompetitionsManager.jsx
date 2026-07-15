import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Crown, Plus, MapPin, Calendar, Edit2, Trash2, UserPlus,
  Eye, AlertTriangle, Trophy, Radio, FileEdit, Globe, CheckCircle,
} from 'lucide-react';
import { Button } from '@shared/components/ui';
import { colors, spacing, borderRadius, typography } from '@shared/styles/theme';
import { supabase } from '@shared/lib/supabase';
import { useToast } from '@shared/contexts/ToastContext';
import {
  COMPETITION_STATUS,
  STATUS_CONFIG,
} from '@shared/types/competition';
import { validateStatusChange, COMPETITION_STATUSES } from '@shared/utils/competitionPhase';
import { generateCompetitionSlug } from '@shared/utils/slugs';

import { DataTable, FilterBar, StatRow, FormModal, ActionMenu } from '../../../components';
import CompetitionCreateWizard from './CompetitionCreateWizard';
import LegacyCompetitionWizard from './LegacyCompetitionWizard';
import CompetitionEditModal from './CompetitionEditModal';

// The `eligibility_gender / eligibility_age_min / eligibility_age_max` columns
// (migration 089) are the source of truth for the public "Who can enter" copy,
// the auto-generated rules, and entry eligibility — NOT `demographic_id`. The
// admin create/edit flow used to persist only the bucket, so competitions set
// up here kept NULL eligibility columns and rendered as "All genders" no matter
// which demographic was chosen. Derive the eligibility columns from the
// selected bucket so the two never drift. A NULL bucket gender ("Open (All)")
// means all genders.
const eligibilityFromDemographic = (demographic) => ({
  eligibility_gender: demographic?.gender || 'all',
  eligibility_age_min: demographic?.age_min ?? null,
  eligibility_age_max: demographic?.age_max ?? null,
});

export default function CompetitionsManager({ onViewDashboard }) {
  const toast = useToast();

  // ── Data state ──────────────────────────────────────────
  const [competitions, setCompetitions] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [demographics, setDemographics] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Modal state ─────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLegacyModal, setShowLegacyModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDefaultTab, setEditDefaultTab] = useState('basic');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignHostModal, setShowAssignHostModal] = useState(false);
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const [showDemographicConfirmModal, setShowDemographicConfirmModal] = useState(false);
  const [pendingDemographicUpdate, setPendingDemographicUpdate] = useState(null);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Filter state ────────────────────────────────────────
  const [searchValue, setSearchValue] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSeason, setFilterSeason] = useState('');

  // ── Data fetching ───────────────────────────────────────
  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [orgsRes, citiesRes, catsRes, demosRes, hostsRes, compsRes, nomineeCounts, contestantCounts] = await Promise.all([
        supabase.from('organizations').select('*').order('name'),
        supabase.from('cities').select('*').order('name'),
        supabase.from('categories').select('*').eq('active', true).order('name'),
        supabase.from('demographics').select('*').eq('active', true).order('id'),
        supabase.from('profiles').select('id, email, first_name, last_name').eq('is_host', true),
        supabase.from('competitions').select('*').order('created_at', { ascending: false }),
        supabase.from('nominees').select('competition_id'),
        supabase.from('contestants').select('competition_id'),
      ]);

      if (!orgsRes.error) setOrganizations(orgsRes.data || []);
      if (!citiesRes.error) setCities(citiesRes.data || []);
      if (!catsRes.error) setCategories(catsRes.data || []);
      if (!demosRes.error) setDemographics(demosRes.data || []);
      setHosts(hostsRes.data || []);

      // Build count maps from actual data
      const nCounts = {};
      (nomineeCounts.data || []).forEach(r => { nCounts[r.competition_id] = (nCounts[r.competition_id] || 0) + 1; });
      const cCounts = {};
      (contestantCounts.data || []).forEach(r => { cCounts[r.competition_id] = (cCounts[r.competition_id] || 0) + 1; });

      // Attach actual counts to competition objects
      if (!compsRes.error) {
        setCompetitions((compsRes.data || []).map(comp => ({
          ...comp,
          _nominee_count: nCounts[comp.id] || 0,
          _contestant_count: cCounts[comp.id] || 0,
        })));
      } else {
        setCompetitions([]);
      }
    } catch (err) {
      toast.error(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────
  const getCompetitionName = useCallback((comp) => {
    if (comp.name) return comp.name;
    const org = organizations.find(o => o.id === comp.organization_id);
    const city = cities.find(c => c.id === comp.city_id);
    const demographic = demographics.find(d => d.id === comp.demographic_id);
    const orgName = org?.name || 'Unknown Org';
    const cityName = city?.name || 'Unknown City';
    if (demographic && demographic.slug !== 'open') {
      return `${orgName} ${cityName} - ${demographic.label}`;
    }
    return `${orgName} ${cityName}`;
  }, [organizations, cities, demographics]);

  const getHostName = useCallback((host) => {
    if (!host) return null;
    if (host.first_name || host.last_name) {
      return `${host.first_name || ''} ${host.last_name || ''}`.trim();
    }
    return host.email;
  }, []);

  // ── Filter options ──────────────────────────────────────
  const uniqueSeasons = useMemo(() => {
    const seasons = [...new Set(competitions.map(c => c.season))];
    return seasons.sort((a, b) => b - a);
  }, [competitions]);

  const statusOptions = useMemo(() =>
    Object.entries(STATUS_CONFIG).map(([key, config]) => ({
      value: key,
      label: config.label,
    })),
    [],
  );

  const cityFilterOptions = useMemo(() =>
    cities.map(c => ({ value: c.id, label: c.name })),
    [cities],
  );

  const seasonFilterOptions = useMemo(() =>
    uniqueSeasons.map(s => ({ value: String(s), label: String(s) })),
    [uniqueSeasons],
  );

  // ── Filtered data ───────────────────────────────────────
  const filteredCompetitions = useMemo(() => {
    return competitions.filter(comp => {
      if (filterStatus && comp.status !== filterStatus) return false;
      if (filterCity && comp.city_id !== filterCity) return false;
      if (filterSeason && comp.season !== parseInt(filterSeason)) return false;
      if (searchValue) {
        const name = getCompetitionName(comp).toLowerCase();
        if (!name.includes(searchValue.toLowerCase())) return false;
      }
      return true;
    });
  }, [competitions, filterStatus, filterCity, filterSeason, searchValue, getCompetitionName]);

  // ── Stat counts ─────────────────────────────────────────
  const stats = useMemo(() => {
    const liveCount = competitions.filter(c => c.status === COMPETITION_STATUS.LIVE).length;
    const draftCount = competitions.filter(c => c.status === COMPETITION_STATUS.DRAFT).length;
    const pubCount = competitions.filter(c => c.status === COMPETITION_STATUS.PUBLISH).length;
    return [
      { label: 'Total', value: competitions.length, icon: Trophy },
      { label: 'Live', value: liveCount, icon: Radio, color: colors.status.success },
      { label: 'Draft', value: draftCount, icon: FileEdit, color: colors.text.muted },
      { label: 'Published', value: pubCount, icon: Globe, color: colors.gold.primary },
    ];
  }, [competitions]);

  // ── Filter change handler ───────────────────────────────
  const handleFilterChange = useCallback((key, value) => {
    if (key === 'status') setFilterStatus(value);
    else if (key === 'city') setFilterCity(value);
    else if (key === 'season') setFilterSeason(value);
  }, []);

  // ── Status changes ──────────────────────────────────────
  const requiresConfirmation = (currentStatus, newStatus) => {
    if (newStatus === COMPETITION_STATUSES.ARCHIVE) return true;
    if (newStatus === COMPETITION_STATUSES.COMPLETED) return true;
    if (currentStatus === COMPETITION_STATUSES.LIVE) return true;
    return false;
  };

  const getConfirmationContent = (currentStatus, newStatus) => {
    if (newStatus === COMPETITION_STATUSES.ARCHIVE) {
      return {
        title: 'Archive Competition?',
        message: 'This will hide the competition from public view and host dashboard.',
        confirmLabel: 'Archive',
      };
    }
    if (newStatus === COMPETITION_STATUSES.COMPLETED) {
      return {
        title: 'Complete Competition?',
        message: 'This will finalize results and make the competition read-only. This should only be done after winners are determined.',
        confirmLabel: 'Complete',
      };
    }
    if (currentStatus === COMPETITION_STATUSES.LIVE) {
      return {
        title: 'Change Live Competition?',
        message: 'This competition is currently live. Changing status will affect active voting.',
        confirmLabel: 'Change Status',
      };
    }
    return {
      title: 'Change Status?',
      message: 'Are you sure you want to change the competition status?',
      confirmLabel: 'Change Status',
    };
  };

  const executeStatusChange = async (competitionId, newStatus) => {
    try {
      const { error } = await supabase
        .from('competitions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', competitionId);
      if (error) throw error;
      toast.success(`Status changed to ${STATUS_CONFIG[newStatus].label}`);
      fetchData();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleApproveCompetition = async (competitionId) => {
    try {
      const { error } = await supabase.rpc('approve_competition', { p_competition_id: competitionId });
      if (error) throw error;
      toast.success('Competition approved — the host can now publish.');
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Failed to approve competition');
    }
  };

  const handleStatusChange = async (competitionId, newStatus) => {
    const competition = competitions.find(c => c.id === competitionId);
    if (!competition) { toast.error('Competition not found'); return; }
    if (competition.status === newStatus) return;

    const validation = validateStatusChange(competition, newStatus);
    if (!validation.valid) { toast.error(validation.error); return; }

    if (requiresConfirmation(competition.status, newStatus)) {
      setPendingStatusChange({ competitionId, newStatus, competition });
      setShowStatusConfirmModal(true);
      return;
    }
    await executeStatusChange(competitionId, newStatus);
  };

  const handleStatusConfirm = async () => {
    if (!pendingStatusChange) return;
    await executeStatusChange(pendingStatusChange.competitionId, pendingStatusChange.newStatus);
    setShowStatusConfirmModal(false);
    setPendingStatusChange(null);
  };

  const handleStatusCancel = () => {
    setShowStatusConfirmModal(false);
    setPendingStatusChange(null);
  };

  // ── Create competition ──────────────────────────────────
  const handleCreate = async (formData) => {
    if (!formData.organization_id || !formData.city_id || !formData.category_id || !formData.demographic_id) {
      toast.error('Organization, city, category, and demographic are required');
      return;
    }
    if (formData.min_contestants < 10) {
      toast.error('Minimum contestants must be at least 10');
      return;
    }
    const maxContestants = formData.max_contestants ? parseInt(formData.max_contestants, 10) : null;
    if (maxContestants !== null && maxContestants <= formData.min_contestants) {
      toast.error('Maximum contestants must be greater than minimum');
      return;
    }

    setIsSubmitting(true);
    try {
      // Duplicate check
      const { data: existing } = await supabase
        .from('competitions')
        .select('id')
        .eq('organization_id', formData.organization_id)
        .eq('city_id', formData.city_id)
        .eq('category_id', formData.category_id)
        .eq('demographic_id', formData.demographic_id)
        .eq('season', formData.season)
        .limit(1);

      if (existing && existing.length > 0) {
        const selectedCategory = categories.find(c => c.id === formData.category_id);
        const selectedDemographic = demographics.find(d => d.id === formData.demographic_id);
        const selectedCity = cities.find(c => c.id === formData.city_id);
        toast.error(
          `A ${selectedCategory?.name || 'Unknown'} competition for ${selectedDemographic?.label || 'Unknown'} in ${selectedCity?.name || 'Unknown'} already exists for Season ${formData.season}.`
        );
        setIsSubmitting(false);
        return;
      }

      const selectedCity = cities.find(c => c.id === formData.city_id);
      const selectedDemographic = demographics.find(d => d.id === formData.demographic_id);
      const competitionSlug = generateCompetitionSlug({
        name: formData.name || 'competition',
        citySlug: selectedCity?.slug || selectedCity?.name || 'unknown',
        season: formData.season,
        demographicSlug: selectedDemographic?.slug,
      });

      const insertPayload = {
        organization_id: formData.organization_id,
        city_id: formData.city_id,
        category_id: formData.category_id,
        demographic_id: formData.demographic_id,
        ...eligibilityFromDemographic(selectedDemographic),
        name: formData.name || null,
        slug: competitionSlug,
        season: formData.season,
        status: COMPETITION_STATUS.DRAFT,
        entry_type: 'nominations',
        has_events: true,
        number_of_winners: formData.number_of_winners,
        selection_criteria: 'votes',
        host_id: formData.host_id || null,
        description: formData.description || '',
        eligibility_radius_miles: formData.eligibility_radius,
        min_contestants: formData.min_contestants,
        max_contestants: maxContestants,
        price_per_vote: 1.00,
        use_price_bundler: false,
      };
      if (formData.minimum_prize !== '' && formData.minimum_prize !== null) {
        insertPayload.prize_pool_minimum = Number(formData.minimum_prize);
      }

      const { error } = await supabase
        .from('competitions')
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;

      toast.success('Competition created successfully');
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      toast.error(`Failed to create competition: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Create legacy (past) competition ─────────────────────
  const handleCreateLegacy = async (formData) => {
    if (!formData.organization_id || !formData.city_id || !formData.category_id || !formData.demographic_id) {
      toast.error('Organization, city, category, and demographic are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCity = cities.find(c => c.id === formData.city_id);
      const selectedDemographic = demographics.find(d => d.id === formData.demographic_id);
      const competitionSlug = generateCompetitionSlug({
        name: formData.name || 'competition',
        citySlug: selectedCity?.slug || selectedCity?.name || 'unknown',
        season: formData.season,
        demographicSlug: selectedDemographic?.slug,
      });

      const contestants = formData.contestants || [];

      // Create the competition
      const { data: comp, error } = await supabase
        .from('competitions')
        .insert({
          organization_id: formData.organization_id,
          city_id: formData.city_id,
          category_id: formData.category_id,
          demographic_id: formData.demographic_id,
          ...eligibilityFromDemographic(selectedDemographic),
          name: formData.name || null,
          slug: competitionSlug,
          season: formData.season,
          status: COMPETITION_STATUS.COMPLETED,
          is_legacy: true,
          entry_type: 'nominations',
          has_events: false,
          number_of_winners: contestants.length || formData.number_of_winners,
          selection_criteria: 'votes',
          prize_pool_minimum: 0,
          eligibility_radius_miles: 100,
          min_contestants: 10,
          max_contestants: null,
          price_per_vote: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert contestants linked to their profiles, ranked by order added
      if (contestants.length > 0) {
        const contestantRows = contestants.map((c) => ({
          competition_id: comp.id,
          user_id: c.profileId,
          name: c.name,
          email: c.email || null,
          avatar_url: c.avatarUrl || null,
          instagram: c.instagram || null,
          city: c.city || null,
          status: 'active',
          votes: 0,
          rank: c.rank,
        }));

        const { error: contestantError } = await supabase
          .from('contestants')
          .insert(contestantRows);

        if (contestantError) {
          console.error('Error inserting contestants:', contestantError);
          toast.warning('Competition created but some contestants could not be added');
        }
      }

      toast.success('Legacy competition created successfully');
      setShowLegacyModal(false);
      fetchData();
    } catch (err) {
      toast.error(`Failed to create legacy competition: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Edit competition ────────────────────────────────────
  const openEditModal = (comp, tab = 'basic') => {
    setSelectedCompetition(comp);
    setEditDefaultTab(tab);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    if (!selectedCompetition) return;

    if (formData.min_contestants < 10) {
      toast.error('Minimum contestants must be at least 10');
      return;
    }
    const maxContestants = formData.max_contestants ? parseInt(formData.max_contestants, 10) : null;
    if (maxContestants !== null && maxContestants <= formData.min_contestants) {
      toast.error('Maximum contestants must be greater than minimum');
      return;
    }

    // Changing the demographic (age/gender bracket) mid-competition can
    // invalidate already-collected entries — confirm when a roster exists.
    const demographicChanged =
      (formData.demographic_id || null) !== (selectedCompetition.demographic_id || null);
    const rosterCount =
      (selectedCompetition._nominee_count || 0) + (selectedCompetition._contestant_count || 0);
    if (demographicChanged && rosterCount > 0) {
      setPendingDemographicUpdate(formData);
      setShowDemographicConfirmModal(true);
      return;
    }

    commitUpdate(formData);
  };

  const handleDemographicConfirm = () => {
    setShowDemographicConfirmModal(false);
    const formData = pendingDemographicUpdate;
    setPendingDemographicUpdate(null);
    if (formData) commitUpdate(formData);
  };

  const handleDemographicCancel = () => {
    setShowDemographicConfirmModal(false);
    setPendingDemographicUpdate(null);
  };

  const commitUpdate = async (formData) => {
    if (!selectedCompetition) return;
    const maxContestants = formData.max_contestants ? parseInt(formData.max_contestants, 10) : null;

    setIsSubmitting(true);
    try {
      // Only re-derive eligibility when the demographic bucket actually changes.
      // A host can set an arbitrary eligibility range (e.g. 21-50) via their own
      // dashboard, which writes eligibility_* but not demographic_id — leaving it
      // untouched on unrelated admin saves avoids clobbering that with the
      // bucket's preset range.
      const demographicChanged =
        (formData.demographic_id || null) !== (selectedCompetition.demographic_id || null);
      const selectedDemographic = demographics.find(d => d.id === formData.demographic_id);
      const updatePayload = {
        name: formData.name || null,
        season: formData.season,
        number_of_winners: formData.number_of_winners,
        host_id: formData.host_id || null,
        category_id: formData.category_id,
        demographic_id: formData.demographic_id || null,
        ...(demographicChanged ? eligibilityFromDemographic(selectedDemographic) : {}),
        description: formData.description || '',
        cover_image: formData.cover_image || null,
        price_per_vote: formData.price_per_vote,
        use_price_bundler: formData.use_price_bundler,
        winners_split_by_gender: formData.winners_split_by_gender,
        eligibility_radius_miles: formData.eligibility_radius,
        min_contestants: formData.min_contestants,
        max_contestants: maxContestants,
        updated_at: new Date().toISOString(),
      };
      if (formData.minimum_prize !== '' && formData.minimum_prize !== null) {
        updatePayload.prize_pool_minimum = Number(formData.minimum_prize);
      }

      const { error } = await supabase
        .from('competitions')
        .update(updatePayload)
        .eq('id', selectedCompetition.id);

      if (error) throw error;
      toast.success('Competition updated');
      setShowEditModal(false);
      setSelectedCompetition(null);
      fetchData();
    } catch (err) {
      toast.error(`Failed to update competition: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Assign host ─────────────────────────────────────────
  const handleAssignHost = async (hostId) => {
    if (!selectedCompetition) return;
    try {
      const { error } = await supabase.rpc('assign_competition_host', {
        p_competition_id: selectedCompetition.id,
        p_user_id: hostId,
      });
      if (error) throw error;
      toast.success('Host assigned successfully');
      setShowAssignHostModal(false);
      setSelectedCompetition(null);
      fetchData();
    } catch (err) {
      toast.error(`Failed to assign host: ${err.message || 'Unknown error'}`);
    }
  };

  // ── Delete competition ──────────────────────────────────
  const handleDelete = async () => {
    if (!selectedCompetition) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('competitions')
        .delete()
        .eq('id', selectedCompetition.id);
      if (error) throw error;
      toast.success('Competition deleted successfully');
      setShowDeleteModal(false);
      setSelectedCompetition(null);
      fetchData();
    } catch {
      toast.error('Failed to delete competition');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Table columns ───────────────────────────────────────
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Competition',
      sortable: true,
      width: '260px',
      render: (_val, row) => {
        const org = organizations.find(o => o.id === row.organization_id);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <div style={styles.compIcon}>
              {org?.logo_url ? (
                <img src={org.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: borderRadius.sm }} />
              ) : (
                <Crown size={14} style={{ color: colors.gold.primary }} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={styles.compName}>{getCompetitionName(row)}</p>
              <p style={styles.compSeason}>Season {row.season}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'city_id',
      label: 'City',
      sortable: true,
      render: (_val, row) => {
        const city = cities.find(c => c.id === row.city_id);
        return (
          <span style={styles.cityCell}>
            <MapPin size={12} style={{ flexShrink: 0 }} />
            {city?.name || '--'}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '110px',
      render: (_val, row) => {
        const config = STATUS_CONFIG[row.status] || STATUS_CONFIG[COMPETITION_STATUS.DRAFT];
        return (
          <span style={{
            ...styles.statusBadge,
            color: config.color,
            background: config.bg,
          }}>
            {config.label}
          </span>
        );
      },
    },
    {
      key: 'entry_type',
      label: 'Entry',
      sortable: true,
      width: '100px',
      render: (_val, row) => {
        const label = row.entry_type === 'nominations' ? 'Nomination' : row.entry_type === 'self' ? 'Self-Entry' : row.entry_type || '--';
        return (
          <span style={styles.entryBadge}>
            {label}
          </span>
        );
      },
    },
    {
      key: 'host_id',
      label: 'Host',
      render: (_val, row) => {
        const host = hosts.find(h => h.id === row.host_id);
        if (host) {
          return (
            <span style={styles.hostBadge}>
              <UserPlus size={10} style={{ color: colors.gold.primary }} />
              {getHostName(host)}
            </span>
          );
        }
        return (
          <span style={styles.noHostBadge}>
            <AlertTriangle size={10} />
            None
          </span>
        );
      },
    },
    {
      key: '_nominee_count',
      label: 'Nominees',
      sortable: true,
      width: '90px',
      render: (_val, row) => (
        <span style={{ color: row._nominee_count > 0 ? colors.gold.primary : colors.text.tertiary, fontSize: typography.fontSize.sm, fontWeight: row._nominee_count > 0 ? 600 : 400 }}>
          {row._nominee_count || 0}
        </span>
      ),
    },
    {
      key: '_contestant_count',
      label: 'Contestants',
      sortable: true,
      width: '110px',
      render: (_val, row) => {
        const actual = row._contestant_count || 0;
        const target = row.min_contestants || 40;
        const met = actual >= target;
        return (
          <span style={{ color: met ? '#22c55e' : colors.text.secondary, fontSize: typography.fontSize.sm }}>
            {actual}<span style={{ color: colors.text.tertiary }}> / {target}</span>
          </span>
        );
      },
    },
    {
      key: 'number_of_winners',
      label: 'Winners',
      sortable: true,
      width: '80px',
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      width: '120px',
      render: (_val, row) => (
        <span style={{ color: colors.text.tertiary, fontSize: typography.fontSize.xs }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
  ], [organizations, cities, hosts, getCompetitionName, getHostName, formatDate]);

  // ── Table row actions ───────────────────────────────────
  const rowActions = useCallback((row) => {
    const org = organizations.find(o => o.id === row.organization_id);
    const city = cities.find(c => c.id === row.city_id);

    const actions = [];
    if (onViewDashboard) {
      actions.push({
        label: 'View Dashboard',
        icon: Eye,
        onClick: () => onViewDashboard({
          ...row,
          name: getCompetitionName(row),
          city,
          organization: org,
        }),
      });
    }
    actions.push(
      { label: 'Edit', icon: Edit2, onClick: () => openEditModal(row, 'basic') },
      { label: 'Pricing', icon: Calendar, onClick: () => openEditModal(row, 'pricing') },
    );

    // Host submitted this competition for review — approve it so the host can
    // publish to the public.
    if (row.status === 'pending_approval') {
      actions.push({
        label: 'Approve competition',
        icon: CheckCircle,
        onClick: () => handleApproveCompetition(row.id),
      });
    }
    if (!row.host_id) {
      actions.push({
        label: 'Assign Host',
        icon: UserPlus,
        onClick: () => { setSelectedCompetition(row); setShowAssignHostModal(true); },
      });
    }

    // Status change sub-actions
    Object.entries(STATUS_CONFIG).forEach(([status, config]) => {
      if (row.status !== status) {
        actions.push({
          label: `Set ${config.label}`,
          onClick: () => handleStatusChange(row.id, status),
        });
      }
    });

    actions.push({
      label: 'Delete',
      icon: Trash2,
      variant: 'danger',
      onClick: () => { setSelectedCompetition(row); setShowDeleteModal(true); },
    });

    return <ActionMenu actions={actions} />;
  }, [organizations, cities, onViewDashboard, getCompetitionName]);

  // ── Render ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {/* Page header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Competitions</h2>
          <p style={styles.subtitle}>Create and manage competitions</p>
        </div>
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Button variant="secondary" icon={Trophy} onClick={() => setShowLegacyModal(true)}>
            Add Past Competition
          </Button>
          <Button icon={Plus} onClick={() => setShowCreateModal(true)}>
            New Competition
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatRow stats={stats} />

      {/* Filters */}
      <FilterBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search competitions..."
        filters={[
          { key: 'status', label: 'Status', options: statusOptions, value: filterStatus },
          { key: 'city', label: 'City', options: cityFilterOptions, value: filterCity },
          { key: 'season', label: 'Season', options: seasonFilterOptions, value: filterSeason },
        ]}
        onFilterChange={handleFilterChange}
      />

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filteredCompetitions}
        loading={loading}
        emptyMessage="No competitions found"
        onRowClick={(row) => {
          if (onViewDashboard) {
            const org = organizations.find(o => o.id === row.organization_id);
            const city = cities.find(c => c.id === row.city_id);
            onViewDashboard({
              ...row,
              name: getCompetitionName(row),
              city,
              organization: org,
            });
          }
        }}
        actions={rowActions}
      />

      {/* ── Create Wizard ──────────────────────────────── */}
      <CompetitionCreateWizard
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        loading={isSubmitting}
        organizations={organizations}
        cities={cities}
        categories={categories}
        demographics={demographics}
        hosts={hosts}
        getHostName={getHostName}
      />

      {/* ── Legacy Competition Wizard ────────────────── */}
      <LegacyCompetitionWizard
        isOpen={showLegacyModal}
        onClose={() => setShowLegacyModal(false)}
        onCreate={handleCreateLegacy}
        loading={isSubmitting}
        organizations={organizations}
        cities={cities}
        categories={categories}
        demographics={demographics}
      />

      {/* ── Edit Modal ─────────────────────────────────── */}
      <CompetitionEditModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedCompetition(null); }}
        onSave={handleUpdate}
        loading={isSubmitting}
        competition={selectedCompetition}
        organizations={organizations}
        cities={cities}
        categories={categories}
        demographics={demographics}
        hosts={hosts}
        getHostName={getHostName}
        getCompetitionName={getCompetitionName}
        defaultTab={editDefaultTab}
      />

      {/* ── Delete Confirmation ────────────────────────── */}
      <FormModal
        isOpen={showDeleteModal && !!selectedCompetition}
        onClose={() => { setShowDeleteModal(false); setSelectedCompetition(null); }}
        title="Delete Competition?"
        subtitle={selectedCompetition ? `"${getCompetitionName(selectedCompetition)}"` : ''}
        onSubmit={handleDelete}
        submitLabel={isSubmitting ? 'Deleting...' : 'Delete'}
        loading={isSubmitting}
        size="sm"
      >
        <div style={styles.deleteBody}>
          <div style={styles.deleteIcon}>
            <Trash2 size={24} style={{ color: colors.status.error }} />
          </div>
          <p style={styles.deleteText}>
            Are you sure you want to delete this competition? This action cannot be undone.
          </p>
        </div>
      </FormModal>

      {/* ── Status Confirm ─────────────────────────────── */}
      {showStatusConfirmModal && pendingStatusChange && (
        <FormModal
          isOpen={showStatusConfirmModal}
          onClose={handleStatusCancel}
          title={getConfirmationContent(pendingStatusChange.competition.status, pendingStatusChange.newStatus).title}
          onSubmit={handleStatusConfirm}
          submitLabel={getConfirmationContent(pendingStatusChange.competition.status, pendingStatusChange.newStatus).confirmLabel}
          size="sm"
        >
          <div style={styles.deleteBody}>
            <div style={{
              ...styles.deleteIcon,
              background: pendingStatusChange.newStatus === COMPETITION_STATUSES.ARCHIVE
                ? 'rgba(156,163,175,0.15)'
                : pendingStatusChange.newStatus === COMPETITION_STATUSES.COMPLETED
                  ? 'rgba(168,85,247,0.15)'
                  : 'rgba(251,191,36,0.15)',
            }}>
              <AlertTriangle size={24} style={{
                color: pendingStatusChange.newStatus === COMPETITION_STATUSES.ARCHIVE
                  ? colors.text.muted
                  : pendingStatusChange.newStatus === COMPETITION_STATUSES.COMPLETED
                    ? '#a855f7'
                    : '#fbbf24',
              }} />
            </div>
            <p style={styles.deleteText}>
              {getConfirmationContent(pendingStatusChange.competition.status, pendingStatusChange.newStatus).message}
            </p>
          </div>
        </FormModal>
      )}

      {/* ── Demographic Change Confirm ──────────────────── */}
      {showDemographicConfirmModal && selectedCompetition && pendingDemographicUpdate && (
        <FormModal
          isOpen={showDemographicConfirmModal}
          onClose={handleDemographicCancel}
          title="Change demographic?"
          onSubmit={handleDemographicConfirm}
          submitLabel="Change demographic"
          size="sm"
        >
          <div style={styles.deleteBody}>
            <div style={{ ...styles.deleteIcon, background: 'rgba(251,191,36,0.15)' }}>
              <AlertTriangle size={24} style={{ color: '#fbbf24' }} />
            </div>
            <p style={styles.deleteText}>
              This competition already has{' '}
              {(selectedCompetition._nominee_count || 0) > 0 && (
                <strong>{selectedCompetition._nominee_count} nominee{selectedCompetition._nominee_count === 1 ? '' : 's'}</strong>
              )}
              {(selectedCompetition._nominee_count || 0) > 0 && (selectedCompetition._contestant_count || 0) > 0 && ' and '}
              {(selectedCompetition._contestant_count || 0) > 0 && (
                <strong>{selectedCompetition._contestant_count} contestant{selectedCompetition._contestant_count === 1 ? '' : 's'}</strong>
              )}
              {' '}entered under the current demographic
              {' '}(<strong>{demographics.find(d => d.id === selectedCompetition.demographic_id)?.label || 'Not set'}</strong>).
              Changing it to{' '}
              <strong>{demographics.find(d => d.id === pendingDemographicUpdate.demographic_id)?.label || 'Not set'}</strong>{' '}
              may mean existing entries no longer match the age/gender bracket. Continue?
            </p>
          </div>
        </FormModal>
      )}

      {/* ── Assign Host Modal ──────────────────────────── */}
      <FormModal
        isOpen={showAssignHostModal && !!selectedCompetition}
        onClose={() => { setShowAssignHostModal(false); setSelectedCompetition(null); }}
        title="Assign Host"
        subtitle={selectedCompetition ? getCompetitionName(selectedCompetition) : ''}
        size="sm"
      >
        {hosts.length === 0 ? (
          <p style={{ color: colors.text.tertiary, textAlign: 'center', padding: spacing.lg }}>
            No hosts available
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {hosts.map(host => (
              <button
                key={host.id}
                type="button"
                onClick={() => handleAssignHost(host.id)}
                style={styles.hostCard}
              >
                <div style={styles.hostAvatar}>
                  {(host.first_name?.[0] || host.email[0]).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: typography.fontWeight.medium, color: colors.text.primary, margin: 0, fontSize: typography.fontSize.sm }}>
                    {getHostName(host)}
                  </p>
                  <p style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, margin: 0 }}>
                    {host.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </FormModal>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    margin: 0,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    margin: `${spacing[1]} 0 0`,
  },
  compIcon: {
    width: '32px',
    height: '32px',
    borderRadius: borderRadius.sm,
    background: colors.background.tertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  compName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  compSeason: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    margin: 0,
  },
  cityCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[1],
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  statusBadge: {
    display: 'inline-block',
    padding: `2px ${spacing.sm}`,
    borderRadius: borderRadius.pill,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    whiteSpace: 'nowrap',
  },
  hostBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[1],
    padding: `2px ${spacing.sm}`,
    background: `${colors.gold.primary}15`,
    borderRadius: borderRadius.sm,
    fontSize: typography.fontSize.xs,
    color: colors.gold.primary,
  },
  entryBadge: {
    display: 'inline-block',
    padding: `2px ${spacing.sm}`,
    borderRadius: borderRadius.sm,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    background: colors.background.tertiary,
  },
  noHostBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[1],
    padding: `2px ${spacing.sm}`,
    background: `${colors.status.error}15`,
    borderRadius: borderRadius.sm,
    fontSize: typography.fontSize.xs,
    color: colors.status.error,
  },
  deleteBody: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: spacing.md,
  },
  deleteIcon: {
    width: '56px',
    height: '56px',
    borderRadius: borderRadius.full,
    background: `${colors.status.error}15`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.normal,
    margin: 0,
  },
  hostCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    background: colors.background.tertiary,
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.md,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    fontFamily: typography.fontFamily.sans,
  },
  hostAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    background: `linear-gradient(135deg, ${colors.gold.primary}, ${colors.gold.light})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.text.inverse,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
    flexShrink: 0,
  },
};
