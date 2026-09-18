import React, { useState, useEffect } from 'react';
import {
  Trophy, FileText, Users, Building2, MapPin, Gift, Package, Settings,
  Crown, ChevronLeft, ChevronRight, Menu, X, ShieldAlert,
} from 'lucide-react';
import { colors, spacing, borderRadius, typography, transitions } from '@shared/styles/theme';
import { useResponsive } from '@shared/hooks/useResponsive';

const NAV_GROUPS = [
  {
    label: 'Competitions',
    items: [
      { key: 'competitions', label: 'All Competitions', icon: Trophy },
      { key: 'interests', label: 'Interest Submissions', icon: FileText },
    ],
  },
  {
    label: 'People',
    items: [
      { key: 'hosts', label: 'Hosts', icon: Users },
      { key: 'organizations', label: 'Organizations', icon: Building2 },
      { key: 'accounts', label: 'Accounts', icon: ShieldAlert },
    ],
  },
  {
    label: 'Locations',
    items: [
      { key: 'cities', label: 'Cities', icon: MapPin },
    ],
  },
  {
    label: 'Rewards',
    items: [
      { key: 'rewards', label: 'Manage Rewards', icon: Gift },
      { key: 'redemptions', label: 'Redemptions', icon: Package },
    ],
  },
  {
    label: 'System',
    items: [
      { key: 'settings', label: 'Site Settings', icon: Settings },
    ],
  },
];

const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 56;

function NavItem({ item, isActive, collapsed, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;

  return (
    <button
      onClick={() => onNavigate(item.key)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? item.label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        width: '100%',
        padding: collapsed ? `${spacing.sm} 0` : `${spacing.sm} ${spacing.md}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: isActive
          ? 'rgba(212, 175, 55, 0.1)'
          : hovered
            ? colors.interactive.hover
            : 'transparent',
        border: 'none',
        borderLeft: isActive
          ? `3px solid ${colors.gold.primary}`
          : '3px solid transparent',
        borderRadius: 0,
        color: isActive ? colors.gold.primary : hovered ? colors.text.primary : colors.text.secondary,
        fontSize: typography.fontSize.sm,
        fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.normal,
        cursor: 'pointer',
        transition: `all ${transitions.fast} ${transitions.ease}`,
        minHeight: '36px',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <Icon
        size={18}
        style={{
          flexShrink: 0,
          transition: `color ${transitions.fast} ${transitions.ease}`,
        }}
      />
      {!collapsed && (
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {item.label}
        </span>
      )}
    </button>
  );
}

function GroupLabel({ label, collapsed }) {
  if (collapsed) return null;

  return (
    <div style={{
      padding: `${spacing.lg} ${spacing.md} ${spacing.xs} ${spacing.lg}`,
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.semibold,
      color: colors.text.tertiary,
      letterSpacing: typography.letterSpacing.wider,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }}>
      {label}
    </div>
  );
}

export default function AdminSidebar({ activeSection, onNavigate, collapsed, onToggleCollapse }) {
  const [collapseHovered, setCollapseHovered] = useState(false);
  const { isMobile, isTablet } = useResponsive();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer when navigating
  const handleNavigate = (key) => {
    onNavigate(key);
    if (isMobile || isTablet) {
      setMobileOpen(false);
    }
  };

  // Close drawer on escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  // Mobile: hamburger button + slide-out drawer overlay
  if (isMobile || isTablet) {
    return (
      <>
        {/* Hamburger trigger — rendered by SuperAdminPage via CSS, not here */}
        {/* This component just renders the drawer */}

        {/* Overlay backdrop */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 99,
              animation: 'fadeIn 0.15s ease-out',
            }}
          />
        )}

        {/* Slide-out drawer */}
        <aside style={{
          position: 'fixed',
          top: 0,
          left: mobileOpen ? 0 : -SIDEBAR_EXPANDED_WIDTH,
          width: SIDEBAR_EXPANDED_WIDTH,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: colors.background.secondary,
          borderRight: `1px solid ${colors.border.primary}`,
          transition: `left ${transitions.normal} ${transitions.ease}`,
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {/* Header with close button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${spacing.lg} ${spacing.md}`,
            borderBottom: `1px solid ${colors.border.secondary}`,
            minHeight: '56px',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <div style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
                borderRadius: borderRadius.md,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Crown size={18} style={{ color: '#fff' }} />
              </div>
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <div style={{
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text.primary,
                  lineHeight: typography.lineHeight.tight,
                }}>
                  EliteRank
                </div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.text.tertiary,
                  lineHeight: typography.lineHeight.tight,
                }}>
                  Admin
                </div>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'none',
                border: `1px solid ${colors.border.secondary}`,
                borderRadius: borderRadius.sm,
                color: colors.text.tertiary,
                cursor: 'pointer',
                padding: 0,
              }}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          </div>

          {/* Nav */}
          <nav style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingTop: spacing.sm,
            paddingBottom: spacing.sm,
            WebkitOverflowScrolling: 'touch',
          }}>
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <GroupLabel label={group.label} collapsed={false} />
                {group.items.map((item) => (
                  <NavItem
                    key={item.key}
                    item={item}
                    isActive={activeSection === item.key}
                    collapsed={false}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Hamburger button — exported for the header to use */}
        <MobileMenuButton onOpen={() => setMobileOpen(true)} />
      </>
    );
  }

  // Desktop: normal sidebar
  return (
    <aside style={{
      width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      minWidth: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      background: colors.background.secondary,
      borderRight: `1px solid ${colors.border.primary}`,
      transition: `width ${transitions.normal} ${transitions.ease}, min-width ${transitions.normal} ${transitions.ease}`,
      overflow: 'hidden',
      zIndex: 20,
    }}>
      {/* Logo / Brand */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: collapsed ? `${spacing.lg} 0` : `${spacing.lg} ${spacing.md}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderBottom: `1px solid ${colors.border.secondary}`,
        minHeight: '56px',
        flexShrink: 0,
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
          borderRadius: borderRadius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Crown size={18} style={{ color: '#fff' }} />
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              lineHeight: typography.lineHeight.tight,
            }}>
              EliteRank
            </div>
            <div style={{
              fontSize: typography.fontSize.xs,
              color: colors.text.tertiary,
              lineHeight: typography.lineHeight.tight,
            }}>
              Admin
            </div>
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <nav style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
      }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <GroupLabel label={group.label} collapsed={collapsed} />
            {collapsed && (
              <div style={{ height: spacing.sm }} />
            )}
            {group.items.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                isActive={activeSection === item.key}
                collapsed={collapsed}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div style={{
        borderTop: `1px solid ${colors.border.secondary}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onToggleCollapse}
          onMouseEnter={() => setCollapseHovered(true)}
          onMouseLeave={() => setCollapseHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: spacing.sm,
            width: '100%',
            padding: collapsed ? `${spacing.md} 0` : `${spacing.md} ${spacing.md}`,
            background: collapseHovered ? colors.interactive.hover : 'transparent',
            border: 'none',
            color: colors.text.tertiary,
            fontSize: typography.fontSize.sm,
            cursor: 'pointer',
            transition: `all ${transitions.fast} ${transitions.ease}`,
            minHeight: '44px',
          }}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <>
              <ChevronLeft size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/**
 * Invisible mobile menu button that renders a fixed hamburger icon.
 * Positioned in the top-left so it's accessible even without the header.
 */
function MobileMenuButton({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        position: 'fixed',
        top: spacing.md,
        left: spacing.md,
        width: '40px',
        height: '40px',
        background: colors.background.secondary,
        border: `1px solid ${colors.border.primary}`,
        borderRadius: borderRadius.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.text.secondary,
        cursor: 'pointer',
        zIndex: 30,
        padding: 0,
      }}
      aria-label="Open menu"
    >
      <Menu size={20} />
    </button>
  );
}
