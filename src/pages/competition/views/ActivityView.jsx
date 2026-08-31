import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { RulesAccordion } from '../components/RulesAccordion';
import { Timeline } from '../components/Timeline';
import { UpcomingEventCard } from '../components/UpcomingEventCard';
import { HostSection } from '../components/HostSection';
import {
  TrendingUp,
  TrendingDown,
  Crown,
  Trophy,
  DollarSign,
  Eye,
  Share2,
  Clock,
  Info,
  Heart,
} from 'lucide-react';
import { transformSupabaseImage } from '../../../lib/storageImage';

// Map icon names to components
const iconComponents = {
  vote: Heart,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  crown: Crown,
  trophy: Trophy,
  'dollar-sign': DollarSign,
  eye: Eye,
  'share-2': Share2,
  clock: Clock,
  info: Info,
};

/**
 * Activity & News page
 */
export function ActivityView() {
  const {
    activities,
    activitiesLoading,
    hasMoreActivities,
    loadMoreActivities,
    announcements,
    events,
    contestants,
    competition,
    votingRounds,
    about,
    orgSlug,
    competitionSlug,
    publicBasePath,
  } = usePublicCompetition();

  const rulesPath = publicBasePath
    ? `${publicBasePath}/rules`
    : competitionSlug
    ? `/${orgSlug}/${competitionSlug}/rules`
    : competition?.id
      ? `/${orgSlug}/id/${competition.id}/rules`
      : null;

  // Find contestant by ID for avatar
  const getContestant = (contestantId) => {
    return contestants?.find(c => c.id === contestantId);
  };

  return (
    <div className="activity-view">
      {/* Upcoming Event + Host Profile side by side */}
      <section className="phase-section phase-grid phase-grid-2">
        <UpcomingEventCard />
        <HostSection />
      </section>

      <div className="activity-view-grid">
        {/* Main Column */}
        <div className="activity-main">
          {/* News/Announcements */}
          <section className="activity-section">
            <h2>Latest News</h2>
            {announcements?.length > 0 ? (
              <div className="news-list">
                {announcements.map((announcement) => (
                  <article key={announcement.id} className="news-item">
                    {announcement.pinned && (
                      <span className="news-pinned">Pinned</span>
                    )}
                    <h3>{announcement.title}</h3>
                    <p>{announcement.content}</p>
                    <time>
                      {new Date(announcement.published_at).toLocaleDateString()}
                    </time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">No announcements yet</p>
            )}
          </section>

          {/* Timeline */}
          <section className="activity-section">
            <h2>Upcoming Events</h2>
            {events?.length > 0 ? (
              <div className="timeline">
                {events.map((event) => (
                  <div key={event.id} className="timeline-item">
                    <span className="timeline-date">
                      {new Date(typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date + 'T00:00:00' : event.date).toLocaleDateString()}
                    </span>
                    <span className="timeline-title">{event.name}</span>
                    {event.location && (
                      <span className="timeline-location">{event.location}</span>
                    )}
                    {event.is_double_vote_day && (
                      <span className="timeline-badge">2x Votes</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No upcoming events</p>
            )}
          </section>

          {/* Competition Rules */}
          <section className="activity-section">
            <RulesAccordion competition={competition} votingRounds={votingRounds} about={about} events={events} rulesPath={rulesPath} />
          </section>
        </div>

        {/* Sidebar */}
        <aside className="activity-sidebar">
          {/* Live Activity Feed */}
          <section className="activity-section">
            <div className="activity-feed-header">
              <span className="live-indicator" />
              <h3>Live Activity</h3>
            </div>

            <div className="activity-feed">
              {activities?.map((activity) => {
                const IconComponent =
                  iconComponents[activity.typeInfo?.icon] || Info;
                const contestant = activity.contestant_id ? getContestant(activity.contestant_id) : null;

                return (
                  <div
                    key={activity.id}
                    className={`activity-item ${activity.typeInfo?.colorClass || ''}`}
                  >
                    {contestant?.avatar_url ? (
                      <div className="activity-avatar">
                        <img src={transformSupabaseImage(contestant.avatar_url, { width: 64, height: 64 })} alt="" />
                      </div>
                    ) : (
                      <div className="activity-icon-wrap">
                        <IconComponent size={16} className="activity-icon" />
                      </div>
                    )}
                    <div className="activity-content">
                      <span className="activity-message">{activity.message}</span>
                      <span className="activity-time">{activity.timeAgo}</span>
                    </div>
                  </div>
                );
              })}

              {activities?.length === 0 && !activitiesLoading && (
                <p className="empty-state">No activity yet</p>
              )}

              {hasMoreActivities && (
                <button
                  onClick={loadMoreActivities}
                  disabled={activitiesLoading}
                  className="load-more-btn"
                >
                  {activitiesLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>
          </section>

          {/* Timeline — moved from competition page sidebar */}
          <section className="activity-section">
            <Timeline />
          </section>
        </aside>
      </div>

    </div>
  );
}

export default ActivityView;
