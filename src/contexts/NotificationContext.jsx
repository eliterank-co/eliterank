import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useSupabaseAuth } from '../hooks';

const NotificationContext = createContext(null);

// Every signed-in tab runs this poll for as long as it stays open, so the
// interval sets a floor on API traffic that is independent of real usage:
// at 15s a single idle tab issued ~5.8k requests/day (~11.5k with OPTIONS
// preflights), and open tabs — not activity — accounted for most of the
// ~267k requests/day seen on 2026-08-13. A badge that settles within a
// minute is not a regression; 4x the load to shave 45s off it is.
const POLL_INTERVAL = 60_000; // 60 seconds

const NOTIFICATION_ICONS = {
  nominated: { emoji: '\u{1F3C6}', label: 'Nominated' },
  nomination_approved: { emoji: '\u2705', label: 'Approved' },
  new_reward: { emoji: '\u{1F381}', label: 'Reward' },
  prize_package: { emoji: '\u{1F389}', label: 'Prize' },
  rank_change: { emoji: '\u{1F4CA}', label: 'Ranking' },
  vote_received: { emoji: '\u{1F5F3}\uFE0F', label: 'Votes' },
  vote_digest: { emoji: '\u{1F5F3}\uFE0F', label: 'Votes' },
  bonus_awarded: { emoji: '\u2B50', label: 'Bonus' },
  bonus_rejected: { emoji: '\u26A0\uFE0F', label: 'Bonus' },
  event_posted: { emoji: '\u{1F4E2}', label: 'Event' },
  system_announcement: { emoji: '\u{1F4E3}', label: 'System' },
  host_message: { emoji: '\u{1F48C}', label: 'Message' },
  video_prompt: { emoji: '\u{1F3AC}', label: 'Video' },
  video_response: { emoji: '\u{1F4F9}', label: 'Video' },
};

export function getNotificationMeta(type) {
  return NOTIFICATION_ICONS[type] || { emoji: '\u{1F514}', label: 'Notification' };
}

export function NotificationProvider({ children }) {
  const { user, isAuthenticated } = useSupabaseAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  // Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !isSupabaseConfigured()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
      // Also update unread count from the fetched data
      setUnreadCount((data || []).filter((n) => !n.read_at).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  // Lightweight unread count poll
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !isSupabaseConfigured()) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [isAuthenticated, user?.id]);

  // Initial fetch on auth
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetchNotifications();
  }, [isAuthenticated, user?.id, fetchNotifications]);

  // Poll unread count every 15s
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    pollRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id, fetchUnreadCount]);

  // Mark a single notification as read
  const markAsRead = useCallback(async (notificationId) => {
    if (!isSupabaseConfigured()) return;

    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', notificationId)
        .is('read_at', null);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read_at: now } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !isSupabaseConfigured()) return;

    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, [isAuthenticated, user?.id]);

  // Delete a notification
  const deleteNotification = useCallback(async (notificationId) => {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications((prev) => {
        const removed = prev.find((n) => n.id === notificationId);
        if (removed && !removed.read_at) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.filter((n) => n.id !== notificationId);
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, []);

  // Toggle panel — fetch fresh notifications when opening
  const togglePanel = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        // Opening — fetch fresh list
        fetchNotifications();
      }
      return !prev;
    });
  }, [fetchNotifications]);

  // Close panel
  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = {
    notifications,
    unreadCount,
    isOpen,
    loading,
    togglePanel,
    closePanel,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      notifications: [],
      unreadCount: 0,
      isOpen: false,
      loading: false,
      togglePanel: () => {},
      closePanel: () => {},
      markAsRead: () => {},
      markAllAsRead: () => {},
      deleteNotification: () => {},
      fetchNotifications: () => {},
    };
  }
  return context;
}

export default NotificationContext;
