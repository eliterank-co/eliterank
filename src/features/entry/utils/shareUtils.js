/**
 * Share Utilities
 * Canvas-based shareable card generation and share/download.
 * Premium photo-first design for Instagram Stories (1080x1920).
 */

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const CX = CARD_WIDTH / 2;

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

function drawSparkle(ctx, x, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x + size * 0.15, y - size * 0.15, x + size, y);
  ctx.quadraticCurveTo(x + size * 0.15, y + size * 0.15, x, y + size);
  ctx.quadraticCurveTo(x - size * 0.15, y + size * 0.15, x - size, y);
  ctx.quadraticCurveTo(x - size * 0.15, y - size * 0.15, x, y - size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCircularImage(ctx, img, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const imgAspect = img.width / img.height;
  let drawW, drawH, drawX, drawY;
  if (imgAspect > 1) {
    drawH = radius * 2;
    drawW = drawH * imgAspect;
    drawX = cx - drawW / 2;
    drawY = cy - radius;
  } else {
    drawW = radius * 2;
    drawH = drawW / imgAspect;
    drawX = cx - radius;
    drawY = cy - drawH / 2;
  }
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function drawInitial(ctx, initial, cx, cy, radius, accentColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  gradient.addColorStop(0, '#1a1a20');
  gradient.addColorStop(1, '#0d0d10');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = accentColor;
  ctx.font = `bold ${radius * 0.9}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial.toUpperCase(), cx, cy + 4);
}

function drawDecorativeLine(ctx, cx, y, width, color) {
  const lineGradL = ctx.createLinearGradient(cx - width / 2, y, cx - 20, y);
  lineGradL.addColorStop(0, 'transparent');
  lineGradL.addColorStop(1, `${color}60`);
  ctx.strokeStyle = lineGradL;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx - 20, y);
  ctx.stroke();

  const lineGradR = ctx.createLinearGradient(cx + 20, y, cx + width / 2, y);
  lineGradR.addColorStop(0, `${color}60`);
  lineGradR.addColorStop(1, 'transparent');
  ctx.strokeStyle = lineGradR;
  ctx.beginPath();
  ctx.moveTo(cx + 20, y);
  ctx.lineTo(cx + width / 2, y);
  ctx.stroke();

  drawSparkle(ctx, cx, y, 6, color, 0.8);
}

/**
 * Generate a shareable PNG card -- premium photo-first design
 */
export async function generateShareCard({
  name,
  photoUrl,
  handle,
  competitionTitle,
  cityName,
  season,
  accentColor = '#d4af37',
  organizationLogoUrl,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  // === BACKGROUND ===
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bgGrad.addColorStop(0, '#050507');
  bgGrad.addColorStop(0.15, '#0a0a10');
  bgGrad.addColorStop(0.4, '#0e0e14');
  bgGrad.addColorStop(0.6, '#0c0c12');
  bgGrad.addColorStop(0.85, '#0a0a10');
  bgGrad.addColorStop(1, '#050507');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Warm glow behind photo
  const glow1 = ctx.createRadialGradient(CX, 620, 0, CX, 620, 500);
  glow1.addColorStop(0, `${accentColor}20`);
  glow1.addColorStop(0.4, `${accentColor}0c`);
  glow1.addColorStop(1, 'transparent');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Secondary glow behind achievement
  const glow2 = ctx.createRadialGradient(CX, 1150, 0, CX, 1150, 400);
  glow2.addColorStop(0, `${accentColor}14`);
  glow2.addColorStop(0.5, `${accentColor}08`);
  glow2.addColorStop(1, 'transparent');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Bottom glow
  const glow3 = ctx.createRadialGradient(CX, 1700, 0, CX, 1700, 300);
  glow3.addColorStop(0, `${accentColor}10`);
  glow3.addColorStop(1, 'transparent');
  ctx.fillStyle = glow3;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // === SPARKLES ===
  const sparkles = [
    { x: 120, y: 180, size: 8, alpha: 0.3 },
    { x: 960, y: 200, size: 10, alpha: 0.35 },
    { x: 200, y: 260, size: 5, alpha: 0.2 },
    { x: 880, y: 270, size: 6, alpha: 0.25 },
    { x: 160, y: 440, size: 14, alpha: 0.5 },
    { x: 920, y: 480, size: 12, alpha: 0.45 },
    { x: 130, y: 620, size: 6, alpha: 0.2 },
    { x: 950, y: 580, size: 8, alpha: 0.3 },
    { x: 180, y: 780, size: 10, alpha: 0.35 },
    { x: 900, y: 740, size: 16, alpha: 0.5 },
    { x: 140, y: 980, size: 6, alpha: 0.2 },
    { x: 940, y: 1020, size: 8, alpha: 0.25 },
    { x: 100, y: 1150, size: 12, alpha: 0.4 },
    { x: 980, y: 1130, size: 10, alpha: 0.35 },
    { x: 160, y: 1280, size: 5, alpha: 0.15 },
    { x: 920, y: 1300, size: 7, alpha: 0.2 },
    { x: 200, y: 1500, size: 10, alpha: 0.3 },
    { x: 880, y: 1460, size: 14, alpha: 0.45 },
    { x: 140, y: 1650, size: 6, alpha: 0.2 },
    { x: 940, y: 1680, size: 8, alpha: 0.25 },
    { x: 300, y: 1780, size: 5, alpha: 0.15 },
    { x: 780, y: 1800, size: 7, alpha: 0.2 },
    { x: 260, y: 360, size: 4, alpha: 0.12 },
    { x: 820, y: 340, size: 3, alpha: 0.1 },
    { x: 240, y: 1100, size: 4, alpha: 0.12 },
    { x: 840, y: 1400, size: 3, alpha: 0.1 },
  ];
  for (const s of sparkles) {
    drawSparkle(ctx, s.x, s.y, s.size, accentColor, s.alpha);
  }

  // === BRANDING (top) ===
  let y = 200;
  ctx.textAlign = 'center';

  if (organizationLogoUrl) {
    try {
      const logo = await loadImage(organizationLogoUrl);
      const maxH = 140;
      const maxW = 600;
      let logoW = logo.width;
      let logoH = logo.height;
      if (logoH > maxH) { logoW = (maxH / logoH) * logoW; logoH = maxH; }
      if (logoW > maxW) { logoH = (maxW / logoW) * logoH; logoW = maxW; }
      ctx.drawImage(logo, CX - logoW / 2, y - logoH / 2, logoW, logoH);
      y += logoH / 2 + 40;
    } catch {
      ctx.fillStyle = `${accentColor}cc`;
      ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('E L I T E R A N K', CX, y);
      y += 40;
    }
  } else {
    ctx.fillStyle = `${accentColor}cc`;
    ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('E L I T E R A N K', CX, y);
    y += 40;
  }

  drawDecorativeLine(ctx, CX, y, 260, accentColor);
  y += 60;

  // === PHOTO (hero) ===
  const photoRadius = 200;
  const photoCY = y + photoRadius;

  // Glow behind photo
  ctx.save();
  const outerGlow = ctx.createRadialGradient(CX, photoCY, photoRadius * 0.5, CX, photoCY, photoRadius + 100);
  outerGlow.addColorStop(0, `${accentColor}18`);
  outerGlow.addColorStop(0.6, `${accentColor}0a`);
  outerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(CX, photoCY, photoRadius + 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (photoUrl) {
    try {
      const img = await loadImage(photoUrl);
      drawCircularImage(ctx, img, CX, photoCY, photoRadius);
    } catch {
      drawInitial(ctx, name?.charAt(0) || '?', CX, photoCY, photoRadius, accentColor);
    }
  } else {
    drawInitial(ctx, name?.charAt(0) || '?', CX, photoCY, photoRadius, accentColor);
  }

  // Triple ring
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(CX, photoCY, photoRadius + 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `${accentColor}20`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(CX, photoCY, photoRadius + 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `${accentColor}12`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(CX, photoCY, photoRadius + 30, 0, Math.PI * 2);
  ctx.stroke();

  // Ring sparkles
  drawSparkle(ctx, CX - photoRadius - 10, photoCY - 40, 5, accentColor, 0.5);
  drawSparkle(ctx, CX + photoRadius + 14, photoCY + 30, 4, accentColor, 0.4);
  drawSparkle(ctx, CX - 30, photoCY - photoRadius - 12, 5, accentColor, 0.45);
  drawSparkle(ctx, CX + 50, photoCY + photoRadius + 15, 4, accentColor, 0.35);

  y = photoCY + photoRadius + 70;

  // === NAME ===
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let displayName = name || 'Nominee';
  if (ctx.measureText(displayName).width > 860) {
    while (ctx.measureText(displayName + '...').width > 860 && displayName.length > 0) {
      displayName = displayName.slice(0, -1);
    }
    displayName += '...';
  }
  ctx.fillText(displayName, CX, y);
  y += 46;

  if (handle) {
    ctx.fillStyle = '#9a9aaa';
    ctx.font = '400 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`@${handle.replace('@', '')}`, CX, y);
    y += 40;
  }

  // === DIVIDER ===
  y += 30;
  drawDecorativeLine(ctx, CX, y, 300, accentColor);
  y += 60;

  // === ACHIEVEMENT TITLE ===
  // Subtle glow pass
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 15;
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 88px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('NOMINATED', CX, y);
  ctx.restore();

  // Crisp pass
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 88px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('NOMINATED', CX, y);
  y += 66;

  // Subtitle
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '400 36px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('for', CX, y);
  y += 56;

  ctx.fillStyle = '#e4e4e7';
  ctx.font = '600 46px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(competitionTitle || 'Competition', CX, y);
  y += 52;

  const metaParts = [];
  if (cityName) metaParts.push(cityName);
  if (season) metaParts.push(season);
  if (metaParts.length) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 34px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(metaParts.join('  ·  '), CX, y);
  }

  // === CTA ===
  const ctaY = y + 80;
  const ctaHeight = 68;
  const ctaWidth = 480;
  const ctaX = CX - ctaWidth / 2;

  ctx.save();
  ctx.shadowColor = `${accentColor}40`;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, ctaX, ctaY, ctaWidth, ctaHeight, ctaHeight / 2);
  const ctaGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaWidth, ctaY + ctaHeight);
  ctaGrad.addColorStop(0, accentColor);
  ctaGrad.addColorStop(1, '#f4d03f');
  ctx.fillStyle = ctaGrad;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#0a0a0c';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('www.eliterank.co', CX, ctaY + ctaHeight / 2);

  roundRect(ctx, ctaX, ctaY, ctaWidth, ctaHeight, ctaHeight / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Generate a landscape OG card (1200x630) for link sharing previews
 */
export async function generateOGCard({
  name,
  photoUrl,
  handle,
  competitionTitle,
  cityName,
  season,
  accentColor = '#d4af37',
  organizationLogoUrl,
  variant = 'nominated', // 'nominated' | 'vote' | 'winner' | 'finalist'
}) {
  const OG_W = 1200;
  const OG_H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = OG_W;
  canvas.height = OG_H;
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, OG_W, OG_H);
  bgGrad.addColorStop(0, '#050507');
  bgGrad.addColorStop(0.5, '#0a0a10');
  bgGrad.addColorStop(1, '#050507');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, OG_W, OG_H);

  // Glow
  const glow = ctx.createRadialGradient(400, 315, 0, 400, 315, 350);
  glow.addColorStop(0, `${accentColor}18`);
  glow.addColorStop(0.5, `${accentColor}08`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, OG_W, OG_H);

  // Sparkles
  const sparkles = [
    { x: 60, y: 80, size: 8, alpha: 0.3 },
    { x: 1100, y: 100, size: 10, alpha: 0.35 },
    { x: 100, y: 500, size: 6, alpha: 0.25 },
    { x: 1050, y: 520, size: 8, alpha: 0.3 },
  ];
  for (const s of sparkles) {
    drawSparkle(ctx, s.x, s.y, s.size, accentColor, s.alpha);
  }

  // Photo (left side)
  const photoRadius = 120;
  const photoCX = 280;
  const photoCY = 315;

  if (photoUrl) {
    try {
      const img = await loadImage(photoUrl);
      drawCircularImage(ctx, img, photoCX, photoCY, photoRadius);
    } catch {
      drawInitial(ctx, name?.charAt(0) || '?', photoCX, photoCY, photoRadius, accentColor);
    }
  } else {
    drawInitial(ctx, name?.charAt(0) || '?', photoCX, photoCY, photoRadius, accentColor);
  }

  // Ring
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoRadius + 5, 0, Math.PI * 2);
  ctx.stroke();

  // Right side text
  const textX = 500;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Variant title
  const variantLabels = {
    nominated: 'NOMINATED',
    vote: 'VOTE FOR ME',
    winner: 'WINNER',
    finalist: 'FINALIST',
  };

  let y = 200;
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(variantLabels[variant] || 'NOMINATED', textX, y);
  y += 60;

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, sans-serif';
  let displayName = name || 'Nominee';
  if (ctx.measureText(displayName).width > 620) {
    while (ctx.measureText(displayName + '...').width > 620 && displayName.length > 0) {
      displayName = displayName.slice(0, -1);
    }
    displayName += '...';
  }
  ctx.fillText(displayName, textX, y);
  y += 40;

  if (handle) {
    ctx.fillStyle = '#9a9aaa';
    ctx.font = '400 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`@${handle.replace('@', '')}`, textX, y);
    y += 40;
  }

  // Competition
  y += 10;
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '600 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(competitionTitle || 'Competition', textX, y);
  y += 36;

  const metaParts = [];
  if (cityName) metaParts.push(cityName);
  if (season) metaParts.push(season);
  if (metaParts.length) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 22px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(metaParts.join('  ·  '), textX, y);
  }

  // Bottom bar with branding
  const barY = OG_H - 60;
  ctx.fillStyle = `${accentColor}20`;
  ctx.fillRect(0, barY, OG_W, 60);
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('eliterank.co', OG_W / 2, barY + 38);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function shareOrDownload(blob, fileName = 'eliterank-nomination.png', { text } = {}) {
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'EliteRank',
        text: text || "I've been nominated on EliteRank!",
      });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }

  downloadBlob(blob, fileName);
  return 'downloaded';
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Present the OS share sheet for a profile/competition link, falling back to
 * copying the link to the clipboard. Returns an outcome describing what the
 * user did so callers can decide whether to award an engagement bonus.
 *
 * Bonus-vote note: a dismissed native share sheet ('AbortError') is treated
 * the same as a completed share. There is no reliable way to confirm an
 * external share — and on several iOS Safari versions even a *successful*
 * share rejects with AbortError — so gating the reward on OS confirmation
 * caused contestants to share yet earn nothing. This is a self-attested
 * engagement task, consistent with "view how to win" awarding on open.
 *
 * @param {string} shareUrl - the link to share
 * @param {{ title?: string }} [opts]
 * @returns {Promise<'shared'|'copied'|'failed'>}
 *   'shared' - native share sheet was presented (completed or dismissed)
 *   'copied' - link copied to clipboard (no usable native share)
 *   'failed' - could not present a share surface or copy the link
 */
export async function shareProfileLink(shareUrl, { title = 'Check out my profile!' } = {}) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url: shareUrl });
      return 'shared';
    } catch (err) {
      // AbortError = the sheet opened and the user dismissed it; still counts
      // as engaging the share. Any other error means native share genuinely
      // failed (e.g. not allowed / unsupported), so fall through to clipboard.
      if (err?.name === 'AbortError') return 'shared';
    }
  }

  if (await copyLink(shareUrl)) return 'copied';
  return 'failed';
}
