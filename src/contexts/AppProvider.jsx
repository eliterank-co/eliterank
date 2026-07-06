import React from 'react';
import { AuthProvider } from './AuthContext';
import { CompetitionProvider } from './CompetitionContext';
import { AnnouncementProvider } from './AnnouncementContext';

/**
 * AppProvider combines all context providers in the correct order.
 * Auth should be outermost as other contexts may depend on auth state.
 */
export function AppProvider({ children }) {
  return (
    <AuthProvider>
      <CompetitionProvider>
        <AnnouncementProvider>
          {children}
        </AnnouncementProvider>
      </CompetitionProvider>
    </AuthProvider>
  );
}

export default AppProvider;
