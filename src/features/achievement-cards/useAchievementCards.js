/**
 * useAchievementCards - Hook for generating, storing, and fetching achievement cards
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { generateAchievementCard, ACHIEVEMENT_TYPES } from './generateAchievementCard';
import { getCompetitionShareUrl } from '../../config/competitionAliases';

/**
 * Hook to manage achievement cards for a contestant
 * 
 * @param {string} contestantId - Contestant UUID
 * @returns {Object} Card management functions and state
 */
export function useAchievementCards(contestantId) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all stored cards for this contestant
   */
  const fetchCards = useCallback(async () => {
    if (!contestantId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('contestant_cards')
        .select('*')
        .eq('contestant_id', contestantId)
        .order('created_at', { ascending: false });
      
      if (fetchError) throw fetchError;
      setCards(data || []);
    } catch (err) {
      console.error('Error fetching cards:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [contestantId]);

  /**
   * Generate and store a new achievement card
   * 
   * @param {Object} params - Card generation params
   * @param {string} params.achievementType - Type from ACHIEVEMENT_TYPES
   * @param {Object} params.contestant - Contestant data
   * @param {Object} params.competition - Competition data
   * @param {Object} params.organization - Organization data
   * @returns {Object} The created card record
   */
  const generateCard = useCallback(async ({
    achievementType,
    customTitle,
    contestant,
    competition,
    organization,
    rank,
  }) => {
    if (!contestantId) throw new Error('No contestant ID');
    
    setGenerating(true);
    setError(null);
    
    try {
      // Build vote URL from competition
      const voteUrl = competition?.slug 
        ? getCompetitionShareUrl(organization?.slug, competition.slug)
        : 'eliterank.co';

      // Generate the card image
      const blob = await generateAchievementCard({
        achievementType,
        customTitle,
        name: contestant?.name,
        photoUrl: contestant?.avatar_url,
        handle: contestant?.instagram,
        competitionName: competition?.name || `Most Eligible ${typeof competition?.city === 'string' ? competition.city : (competition?.city?.name || '')}`,
        cityName: typeof competition?.city === 'string' ? competition.city : (competition?.city?.name || ''),
        season: competition?.season?.toString(),
        organizationName: organization?.name || 'Most Eligible',
        organizationLogoUrl: organization?.logo_url,
        accentColor: competition?.theme_primary || '#d4af37',
        voteUrl,
        rank,
        votingStartDate: competition?.voting_start,
      });

      // Upload to Supabase Storage
      const fileName = `${contestantId}/${achievementType}-${Date.now()}.png`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contestant-cards')
        .upload(fileName, blob, {
          contentType: 'image/png',
          cacheControl: '31536000', // 1 year cache
        });
      
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('contestant-cards')
        .getPublicUrl(fileName);

      // Store card record in database
      const cardRecord = {
        contestant_id: contestantId,
        competition_id: competition?.id,
        achievement_type: achievementType,
        custom_title: customTitle,
        image_url: publicUrl,
        storage_path: fileName,
        rank: rank || null,
        metadata: {
          contestant_name: contestant?.name,
          competition_name: competition?.name,
          generated_at: new Date().toISOString(),
        },
      };

      const { data: insertData, error: insertError } = await supabase
        .from('contestant_cards')
        .insert(cardRecord)
        .select()
        .single();
      
      if (insertError) throw insertError;

      // Update local state
      setCards(prev => [insertData, ...prev]);
      
      return insertData;
    } catch (err) {
      console.error('Error generating card:', err);
      setError(err.message);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [contestantId]);

  /**
   * Delete a card
   */
  const deleteCard = useCallback(async (cardId, storagePath) => {
    try {
      // Delete from storage
      if (storagePath) {
        await supabase.storage
          .from('contestant-cards')
          .remove([storagePath]);
      }

      // Delete record
      const { error: deleteError } = await supabase
        .from('contestant_cards')
        .delete()
        .eq('id', cardId);
      
      if (deleteError) throw deleteError;

      setCards(prev => prev.filter(c => c.id !== cardId));
    } catch (err) {
      console.error('Error deleting card:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Download a card
   */
  const downloadCard = useCallback((imageUrl, fileName = 'achievement-card.png') => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /**
   * Share a card (native share or fallback)
   */
  const shareCard = useCallback(async (imageUrl, title = "I'm competing!") => {
    try {
      // Fetch the image as blob for native share
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'achievement.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: title,
        });
        return 'shared';
      }

      // Fallback: copy URL
      await navigator.clipboard.writeText(imageUrl);
      return 'copied';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      console.error('Share failed:', err);
      throw err;
    }
  }, []);

  return {
    cards,
    loading,
    generating,
    error,
    fetchCards,
    generateCard,
    deleteCard,
    downloadCard,
    shareCard,
    ACHIEVEMENT_TYPES,
  };
}

export default useAchievementCards;
