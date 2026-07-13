/**
 * Achievement Card Generator
 *
 * Generates branded shareable cards for contestant milestones.
 * Clean, minimal design on pure black. Optimized for Instagram Stories (1080x1920).
 */

import { ensureCardFonts } from './ensureCardFonts';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const CX = CARD_WIDTH / 2;

const FONT = "'Montserrat', 'Inter', system-ui, sans-serif";
const GOLD = '#d4af37';

export const ACHIEVEMENT_TYPES = {
  nominated: {
    title: 'NOMINATED',
    subtitle: 'for',
  },
  contestant: {
    title: 'CONTESTANT',
    subtitle: '',
  },
  advanced: {
    title: 'ADVANCED',
    subtitle: 'in',
  },
  finalist: {
    title: 'FINALIST',
    subtitle: 'in',
  },
  winner: {
    title: 'WINNER',
    subtitle: 'of',
  },
  placement: {
    title: 'PLACED',
    subtitle: 'in',
  },
};

export function getAdvancementTitle(advancingCount) {
  return `TOP ${advancingCount}`;
}

export function getPlacementTitle(place) {
  if (place === 1) return 'WINNER';
  const suffix = place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH';
  return `${place}${suffix} PLACE`;
}

export function getRoundAdvancementTitle(round, nextRound) {
  if (nextRound?.contestants_advance) {
    return `TOP ${nextRound.contestants_advance}`;
  }
  if (round?.title) {
    return `${round.title.toUpperCase()} QUALIFIER`;
  }
  return 'ADVANCED';
}

function formatSeasonLabel(season) {
  if (!season) return null;
  const year = typeof season === 'number' ? season : Number(season);
  if (!isNaN(year) && year > 0) {
    return `Season ${year}`;
  }
  return String(season);
}

function loadImage(src) {
  return fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return res.blob();
    })
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to decode image blob'));
          };
          img.src = url;
        })
    );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawRoundedRectImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const imgAspect = img.width / img.height;
  const boxAspect = w / h;
  let dw, dh, dx, dy;
  if (imgAspect > boxAspect) {
    dh = h;
    dw = dh * imgAspect;
    dx = x + (w - dw) / 2;
    dy = y;
  } else {
    dw = w;
    dh = dw / imgAspect;
    dx = x;
    dy = y + (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawInitialRect(ctx, initial, x, y, w, h, r) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = '#111111';
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = `${GOLD}40`;
  ctx.font = `300 ${Math.min(w, h) * 0.35}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial.toUpperCase(), x + w / 2, y + h / 2);
}

export async function generateAchievementCard({
  achievementType = 'nominated',
  customTitle,
  name,
  photoUrl,
  handle,
  competitionName,
  cityName: rawCityName,
  season,
  organizationName = 'Most Eligible',
  organizationLogoUrl,
  accentColor = GOLD,
  voteUrl,
  rank,
  // votingStartDate kept for API compat — many callers pass it, but the
  // "Voting opens …" line was removed from the card layout.
  votingStartDate: _votingStartDate,
}) {
  // Load the card fonts (Montserrat/Inter) before drawing so canvas text
  // isn't baked in with the system-ui fallback. Kept off the page's critical
  // render path — see ensureCardFonts.js.
  await ensureCardFonts();

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  const achievement = ACHIEVEMENT_TYPES[achievementType] || ACHIEVEMENT_TYPES.nominated;
  const displayTitle = customTitle || achievement.title;
  const subtitle = achievement.subtitle;

  // Safety: coerce cityName to string (callers may pass an object)
  const cityName = (rawCityName && typeof rawCityName === 'object')
    ? (rawCityName.name || rawCityName.city_name || '')
    : (rawCityName || '');

  // === BACKGROUND — pure black, no effects ===
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // === LOGO (top, centered) ===
  const logoSize = 160;
  const logoY = 60;

  if (organizationLogoUrl) {
    try {
      const logo = await loadImage(organizationLogoUrl);
      const logoAspect = logo.width / logo.height;
      let drawW = logoSize * logoAspect;
      let drawH = logoSize;
      if (drawW > 360) { drawW = 360; drawH = drawW / logoAspect; }
      ctx.drawImage(logo, CX - drawW / 2, logoY, drawW, drawH);
    } catch {
      // No fallback text — logo only
    }
  }

  // === PHOTO — fixed frame, cover crop ===
  const photoW = 560;
  const photoH = 700;
  const photoR = 16;
  const photoStartY = 270;
  const frameOffset = 4;
  const frameR = photoR + frameOffset;

  let loadedImg = null;

  if (photoUrl) {
    try {
      loadedImg = await loadImage(photoUrl);
    } catch {
      loadedImg = null;
    }
  }

  const photoX = CX - photoW / 2;
  const photoY = photoStartY;

  // Photo frame: 2px solid gold border, 4px offset from photo edge
  roundRect(
    ctx,
    photoX - frameOffset,
    photoY - frameOffset,
    photoW + frameOffset * 2,
    photoH + frameOffset * 2,
    frameR,
  );
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Photo or initial fallback
  if (loadedImg) {
    drawRoundedRectImage(ctx, loadedImg, photoX, photoY, photoW, photoH, photoR);
  } else {
    drawInitialRect(ctx, name?.charAt(0) || '?', photoX, photoY, photoW, photoH, photoR);
  }

  // === CONTENT SECTION — starts after photo ===
  let y = photoY + photoH + 60;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // === NAME — 72px, weight 700, white ===
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 72px ${FONT}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '-1.44px';
  let displayName = name || 'Contestant';
  if (ctx.measureText(displayName).width > 960) {
    while (ctx.measureText(displayName + '...').width > 960 && displayName.length > 0) {
      displayName = displayName.slice(0, -1);
    }
    displayName += '...';
  }
  ctx.fillText(displayName, CX, y);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  y += 72 + 36;

  // === BADGE — pill, gold border, transparent bg ===
  const badgeFontSize = 34;
  ctx.font = `700 ${badgeFontSize}px ${FONT}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '4px';
  const badgeText = displayTitle;
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgePadH = 56;
  const badgePadV = 20;
  const badgeW = badgeTextW + badgePadH * 2;
  const badgeH = badgeFontSize + badgePadV * 2;
  const badgeX = CX - badgeW / 2;
  const badgeY = y;

  // Pill border (transparent bg, gold outline)
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Badge text
  ctx.fillStyle = GOLD;
  ctx.font = `700 ${badgeFontSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, CX, badgeY + badgeH / 2);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  // === SUBTITLE + COMPETITION NAME — center "for" between badge and comp name ===
  const gapAfterBadge = 24;
  const gapBeforeComp = 26; // space from subtitle to competition name top
  const compFontSize = 52;
  const subtitleFontSize = 38;

  if (subtitle) {
    // Total gap between badge bottom and competition name baseline
    const totalGap = gapAfterBadge + subtitleFontSize + gapBeforeComp;
    const subtitleY = badgeY + badgeH + totalGap / 2;

    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `400 ${subtitleFontSize}px ${FONT}`;
    ctx.fillText(subtitle, CX, subtitleY);

    y = badgeY + badgeH + totalGap;
  } else {
    y = badgeY + badgeH + gapAfterBadge;
  }

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${compFontSize}px ${FONT}`;
  let compDisplay = competitionName || 'the competition';
  if (ctx.measureText(compDisplay).width > 960) {
    ctx.font = `600 44px ${FONT}`;
  }
  ctx.fillText(compDisplay, CX, y);
  y += compFontSize + 16;

  // === LOCATION — muted, tracked ===
  if (season) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `500 38px ${FONT}`;
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '4.5px';
    const metaText = cityName ? `${cityName}  \u00B7  ${season}` : formatSeasonLabel(season);
    ctx.fillText(metaText, CX, y);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    y += 38 + 48;
  }

  // Rank (for top placements only)
  if (rank && achievementType !== 'nominated' && achievementType !== 'contestant') {
    ctx.fillStyle = GOLD;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`#${rank}`, CX, y);
    y += 46;
  }

  // === CTA BUTTON — solid gold pill, black text ===
  const ctaText = 'www.eliterank.co';
  const ctaFontSize = 34;
  ctx.font = `700 ${ctaFontSize}px ${FONT}`;
  const ctaTextW = ctx.measureText(ctaText).width;
  const ctaPadH = 80;
  const ctaPadV = 32;
  const ctaW = ctaTextW + ctaPadH * 2;
  const ctaH = ctaFontSize + ctaPadV * 2;
  const ctaX = CX - ctaW / 2;
  const ctaY = y;

  // Solid gold background
  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2);
  ctx.fillStyle = GOLD;
  ctx.fill();

  // Black text
  ctx.fillStyle = '#000000';
  ctx.font = `700 ${ctaFontSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, CX, ctaY + ctaH / 2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export default generateAchievementCard;
