/**
 * Vote Share Card Generator
 *
 * Generates a shareable "I Voted" card with the Nominated/Contestant
 * card visual language — gold-outlined pill badge, rounded-rect photo
 * with gold border, solid gold CTA button. Reads top-to-bottom as
 * "I VOTED for [Name] in [Competition] — YOU SHOULD TOO!"
 * Optimized for Instagram Stories (1080x1920).
 */

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const CX = CARD_WIDTH / 2;

const FONT = "'Montserrat', 'Inter', system-ui, sans-serif";
const GOLD = '#d4af37';

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

/**
 * Generate a shareable "I Voted" card
 *
 * @param {Object} params
 * @param {string} params.contestantName - Name of the contestant voted for
 * @param {string} params.photoUrl - Contestant's photo URL
 * @param {string} params.competitionName - Competition name
 * @param {string} [params.organizationLogoUrl] - Logo URL
 * @returns {Promise<Blob>} PNG blob
 */
export async function generateVoteCard({
  contestantName,
  photoUrl,
  competitionName,
  organizationLogoUrl,
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  // === BACKGROUND ===
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // === LOGO (top, centered) ===
  const logoSize = 200;
  const logoY = 60;

  if (organizationLogoUrl) {
    try {
      const logo = await loadImage(organizationLogoUrl);
      const logoAspect = logo.width / logo.height;
      let drawW = logoSize * logoAspect;
      let drawH = logoSize;
      if (drawW > 560) { drawW = 560; drawH = drawW / logoAspect; }
      ctx.drawImage(logo, CX - drawW / 2, logoY, drawW, drawH);
    } catch {
      // No fallback text — logo only
    }
  }

  // === PHOTO — rounded rect with gold border (matches Nominated card) ===
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

  if (loadedImg) {
    drawRoundedRectImage(ctx, loadedImg, photoX, photoY, photoW, photoH, photoR);
  } else {
    drawInitialRect(ctx, contestantName?.charAt(0) || '?', photoX, photoY, photoW, photoH, photoR);
  }

  // === CONTENT SECTION ===
  let y = photoY + photoH + 60;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // === BADGE — "I VOTED" gold-outlined pill with gold dots ===
  const badgeFontSize = 34;
  ctx.font = `700 ${badgeFontSize}px ${FONT}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '4px';
  const badgeText = 'I VOTED';
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgePadH = 56;
  const badgePadV = 20;
  const badgeW = badgeTextW + badgePadH * 2;
  const badgeH = badgeFontSize + badgePadV * 2;
  const badgeX = CX - badgeW / 2;
  const badgeY = y;

  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const dotR = 5;
  const dotY = badgeY + badgeH / 2;
  const textHalfW = badgeTextW / 2;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(CX - textHalfW - 20, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CX + textHalfW + 20, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = GOLD;
  ctx.font = `700 ${badgeFontSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, CX, badgeY + badgeH / 2);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';

  y = badgeY + badgeH + 44;

  // === LINE 1 — Contestant name (72px white bold) ===
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 72px ${FONT}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '-1.44px';
  let displayName = contestantName || 'Contestant';
  if (ctx.measureText(displayName).width > 960) {
    while (ctx.measureText(displayName + '...').width > 960 && displayName.length > 0) {
      displayName = displayName.slice(0, -1);
    }
    displayName += '...';
  }
  ctx.fillText(displayName, CX, y);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  y += 72 + 20;

  // === LINE 2 — "for" (muted subtitle) ===
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `400 38px ${FONT}`;
  ctx.fillText('for', CX, y);
  y += 38 + 16;

  // === LINE 3 — Competition name ===
  ctx.fillStyle = '#FFFFFF';
  const compFontSize = 52;
  ctx.font = `600 ${compFontSize}px ${FONT}`;
  let compDisplay = competitionName || 'the competition';
  if (ctx.measureText(compDisplay).width > 960) {
    ctx.font = `600 44px ${FONT}`;
  }
  ctx.fillText(compDisplay, CX, y);
  y += compFontSize + 48;

  // === LINE 4 — "YOU SHOULD TOO!" (gold, tracked, uppercase) ===
  ctx.fillStyle = GOLD;
  ctx.font = `700 44px ${FONT}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '6px';
  ctx.fillText('YOU SHOULD TOO!', CX, y);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  y += 44 + 56;

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

  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2);
  ctx.fillStyle = GOLD;
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.font = `700 ${ctaFontSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, CX, ctaY + ctaH / 2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export default generateVoteCard;
