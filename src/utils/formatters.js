/**
 * Format a number with locale-specific thousand separators
 * @param {number} num - Number to format
 * @returns {string} - Formatted number string
 */
export function formatNumber(num) {
  return num?.toLocaleString() || '0';
}

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date relative to now
 * @param {string|Date} dateString - Date to format
 * @returns {string} - Relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date for display
 * @param {string|Date} dateString - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
export function formatDate(dateString, options = {}) {
  const defaultOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  };

  // Append T00:00:00 to date-only strings to prevent UTC parsing shifting the day
  const safeDate = typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? dateString + 'T00:00:00'
    : dateString;

  return new Date(safeDate).toLocaleDateString('en-US', defaultOptions);
}

/**
 * Format an event date range
 * @param {Object} event - Event object with date and optional endDate
 * @returns {string} - Formatted date range string
 */
export function formatEventDateRange(event) {
  const safeStart = typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date)
    ? event.date + 'T00:00:00' : event.date;
  const startDate = new Date(safeStart);
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (event.endDate) {
    const safeEnd = typeof event.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate)
      ? event.endDate + 'T00:00:00' : event.endDate;
    const endDate = new Date(safeEnd);
    const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} - ${endStr}`;
  }

  return startStr;
}

/**
 * Get initials from a name
 * @param {string} name - Full name
 * @returns {string} - Initials (max 2 characters)
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

/**
 * Calculate days until a date
 * @param {string|Date} targetDate - Target date
 * @returns {number} - Number of days until target date
 */
export function daysUntil(targetDate) {
  const now = new Date();
  // Append T00:00:00 to date-only strings to prevent UTC parsing shifting the day
  const safeTarget = typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
    ? targetDate + 'T00:00:00' : targetDate;
  const target = new Date(safeTarget);
  const diffTime = target - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Format date with time
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  if (!date) return '';

  const d = new Date(date);

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format countdown for display
 * @param {object} timeRemaining - From getTimeRemaining()
 * @returns {string}
 */
export function formatCountdown(timeRemaining) {
  if (!timeRemaining || timeRemaining.expired) {
    return 'Ended';
  }

  const { days, hours, minutes } = timeRemaining;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format contestant name for URL slug
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Format a time string (HH:mm or HH:mm:ss) to 12-hour format (e.g., "7:30 PM CST")
 * @param {string} timeStr - Time string from DB (e.g., "19:30:00")
 * @param {string} timezone - Timezone abbreviation (default: "CST")
 * @returns {string} - Formatted time string
 */
export function formatEventTime(timeStr, timezone = 'CST') {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  const displayMin = String(minutes).padStart(2, '0');
  return `${displayHour}:${displayMin} ${period} ${timezone}`;
}

/**
 * Human label for who receives a prize, from its sponsor's recipient setting.
 * Returns null for winner prizes (the "Winner's Prize Package" section header
 * already conveys that) and when no recipient is set, so callers can simply
 * skip rendering a chip on a null.
 * @param {object} prize - Prize with `recipient` and `recipient_top_x_count`
 * @returns {string|null}
 */
export function formatPrizeRecipient(prize) {
  if (!prize) return null;
  const count = prize.recipient_top_x_count;
  switch (prize.recipient) {
    case 'top_x':
      return count ? `Top ${count} contestants` : 'Top contestants';
    case 'all':
      return 'All contestants';
    default:
      return null;
  }
}

/**
 * Human label for the gender a prize is restricted to, from its sponsor's
 * recipient_gender setting. Returns null for 'all' (or unset) so callers can
 * skip rendering a chip when a prize is open to everyone. Only meaningful in
 * competitions that crown winners split by gender.
 * @param {object} prize - Prize with `recipient_gender`
 * @returns {string|null}
 */
export function formatPrizeGender(prize) {
  if (!prize) return null;
  switch (prize.recipient_gender) {
    case 'male':
      return 'Men only';
    case 'female':
      return 'Women only';
    default:
      return null;
  }
}

/**
 * Order a prize list so gendered prizes alternate men → women → men … with any
 * "everyone" prizes kept after them. In a gender-split competition this makes it
 * visually obvious that both genders are catered for (male prize, female prize,
 * male prize…). When the list has no mix of male AND female prizes there's
 * nothing to alternate, so the original order (by sort_order) is preserved.
 * @param {Array<object>} prizes - Prizes carrying `recipient_gender`
 * @returns {Array<object>}
 */
export function interleaveByGender(prizes) {
  if (!Array.isArray(prizes) || prizes.length === 0) return prizes || [];
  const male = prizes.filter((p) => p.recipient_gender === 'male');
  const female = prizes.filter((p) => p.recipient_gender === 'female');
  // Nothing to alternate unless both genders are represented.
  if (male.length === 0 || female.length === 0) return prizes;
  const neutral = prizes.filter((p) => p.recipient_gender !== 'male' && p.recipient_gender !== 'female');
  const alternated = [];
  for (let i = 0; i < Math.max(male.length, female.length); i++) {
    if (male[i]) alternated.push(male[i]);
    if (female[i]) alternated.push(female[i]);
  }
  return [...alternated, ...neutral];
}

/**
 * Get ordinal suffix for number (1st, 2nd, 3rd, etc.)
 * @param {number} n
 * @returns {string}
 */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
