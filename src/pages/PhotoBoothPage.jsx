/**
 * PhotoBoothPage — Temporary event page for Lucky Disco × Most Eligible photo booth.
 *
 * Standalone fullscreen experience at /photobooth with custom event branding.
 * Takes 3-shot photo strips, optional nomination, and emails photos.
 *
 * POST-EVENT CLEANUP: Remove this file, the route in routes/index.jsx,
 * 'photobooth' from RESERVED_PATHS in utils/slugs.js, and
 * supabase/functions/send-photobooth-photo/.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { isValidEmail, normalizeEmail } from '../utils/validators/email';

// ─── Competition IDs (hardcoded for this event) ──────────────────────────────
const COMPETITIONS = [
  { id: 'c1c44ae3-6ccf-4470-8c14-ddcc5f021500', label: '🌹 Most Eligible Bachelorette 2026' },
  { id: 'd1887938-6d06-4ae8-aaf6-9beb773aa0ef', label: '🤵 Most Eligible Bachelor — Summer 2026' },
];

// ─── Design tokens (event-specific, NOT from theme.js) ───────────────────────
const C = {
  neon: '#00ff6a',
  gold: '#ffd700',
  hot: '#ff2d78',
  dark: '#060a06',
  dark2: '#0a120a',
  white: '#f8fff8',
};

const FONT_HEADING = "'Bebas Neue', sans-serif";
const FONT_BODY = "'Space Grotesk', sans-serif";

const TOTAL_SHOTS = 3;
const COUNTDOWN_SECS = 7;

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  // Shared
  screen: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity .35s, transform .35s',
    overflow: 'hidden',
    zIndex: 10,
  },
  hidden: { display: 'none' },

  // Welcome
  welcome: {
    background: `radial-gradient(ellipse 120% 90% at 50% 60%, #0d2e12, ${C.dark})`,
  },
  orb: {
    position: 'absolute',
    borderRadius: '50%',
    pointerEvents: 'none',
    filter: 'blur(70px)',
  },
  orb1: {
    width: 320, height: 320,
    background: 'rgba(0,255,106,.1)',
    top: -100, left: -80,
  },
  orb2: {
    width: 260, height: 260,
    background: 'rgba(255,215,0,.07)',
    bottom: -70, right: -50,
  },
  wInner: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 28px',
    width: '100%',
    maxWidth: 420,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(0,255,106,.07)',
    border: '1px solid rgba(0,255,106,.18)',
    borderRadius: 100,
    padding: '6px 14px',
    marginBottom: 24,
  },
  bdot: {
    width: 6, height: 6, borderRadius: '50%',
    background: C.neon,
    boxShadow: `0 0 8px ${C.neon}`,
  },
  badgeText: {
    fontSize: 11, fontWeight: 600, letterSpacing: 2,
    textTransform: 'uppercase', color: 'rgba(255,255,255,.7)',
  },
  heroPre: {
    fontSize: 'clamp(14px, 3.5vw, 17px)',
    fontWeight: 300, letterSpacing: 5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,.5)',
    marginBottom: 16,
  },
  heroLucky: {
    fontFamily: FONT_HEADING,
    fontSize: 'clamp(80px, 23vw, 145px)',
    lineHeight: .85,
    background: `linear-gradient(135deg, ${C.neon} 0%, #a8ff78 45%, ${C.gold} 100%)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  shamrock: {
    display: 'inline-block',
    fontSize: 'clamp(30px, 7vw, 48px)',
    marginLeft: 6,
    verticalAlign: 'middle',
  },
  heroSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,.4)',
    letterSpacing: .5,
    margin: '14px 0 32px',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  btnMain: {
    position: 'relative',
    background: 'transparent',
    border: `1.5px solid ${C.neon}`,
    color: C.neon,
    padding: '15px 56px',
    borderRadius: 4,
    fontFamily: FONT_HEADING,
    fontSize: 22,
    letterSpacing: 3,
    cursor: 'pointer',
    boxShadow: `0 0 22px rgba(0,255,106,.18)`,
  },

  // Camera
  camera: {
    background: '#000',
    padding: 0,
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
  },
  bracket: {
    position: 'absolute',
    width: 38, height: 38,
    zIndex: 20,
    pointerEvents: 'none',
  },
  camBot: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 5,
    background: 'linear-gradient(0deg, rgba(0,0,0,.8), transparent)',
    padding: '32px 22px 26px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  shutter: {
    width: 76, height: 76,
    borderRadius: '50%',
    border: `2px solid ${C.neon}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: `0 0 18px rgba(0,255,106,.32)`,
    background: 'transparent',
  },
  shutterIn: {
    width: 60, height: 60,
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(0,255,106,.9), rgba(0,200,70,.7))`,
    boxShadow: `0 0 18px rgba(0,255,106,.55)`,
  },
  camHint: {
    fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,.32)',
    fontWeight: 500,
  },
  countdown: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,.32)',
    zIndex: 50,
  },
  countdownNum: {
    fontFamily: FONT_HEADING,
    fontSize: 180,
    color: C.neon,
    textShadow: `0 0 80px rgba(0,255,106,.75)`,
  },
  shotDots: {
    display: 'flex', gap: 8, marginBottom: 4,
  },
  shotDot: (filled) => ({
    width: 10, height: 10, borderRadius: '50%',
    border: `1.5px solid ${C.neon}`,
    background: filled ? C.neon : 'transparent',
    boxShadow: filled ? `0 0 8px ${C.neon}` : 'none',
    transition: 'background .2s',
  }),

  // Flash
  flash: {
    position: 'fixed', inset: 0,
    background: '#fff', zIndex: 200,
    pointerEvents: 'none',
    transition: 'opacity .05s',
  },

  // Preview
  preview: {
    background: C.dark2,
  },
  previewInner: {
    position: 'relative', zIndex: 2,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', width: '100%',
    padding: '24px 22px', height: '100%',
    justifyContent: 'center',
  },
  previewTitle: {
    fontFamily: FONT_HEADING,
    fontSize: 28, letterSpacing: 2,
    color: C.white, marginBottom: 14,
    textAlign: 'center',
  },
  stripCanvas: {
    width: 'auto', maxWidth: 260,
    maxHeight: '55vh', height: 'auto',
    borderRadius: 10,
    boxShadow: `0 0 0 1px rgba(0,255,106,.15), 0 20px 50px rgba(0,0,0,.7)`,
    marginBottom: 20,
  },

  // Form / Who screen
  formScreen: {
    background: C.dark2,
    padding: '28px 22px 32px',
    justifyContent: 'flex-start',
    overflowY: 'auto',
  },
  whoPhoto: {
    width: '100%', maxWidth: 260,
    maxHeight: '35vh', height: 'auto',
    borderRadius: 14,
    boxShadow: `0 0 0 1px rgba(0,255,106,.15), 0 20px 50px rgba(0,0,0,.7)`,
    marginBottom: 14,
    alignSelf: 'center',
    objectFit: 'contain',
  },
  whoQuestion: {
    fontFamily: FONT_HEADING,
    fontSize: 'clamp(26px, 7vw, 38px)',
    lineHeight: 1, color: C.white,
    marginBottom: 6, textAlign: 'center',
    letterSpacing: 1,
  },
  whoSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,.4)',
    textAlign: 'center',
    marginBottom: 22,
    letterSpacing: .5,
  },
  whoForm: {
    width: '100%', maxWidth: 380,
    alignSelf: 'center',
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 10, fontWeight: 600,
    letterSpacing: 2, textTransform: 'uppercase',
    color: 'rgba(255,255,255,.38)',
    marginBottom: 5,
  },
  fieldInput: {
    width: '100%',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8,
    padding: '12px 13px',
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: C.white,
    outline: 'none',
    WebkitAppearance: 'none',
    boxSizing: 'border-box',
  },
  fieldInputErr: {
    borderColor: C.hot,
  },
  fieldInputFocus: {
    borderColor: C.neon,
    boxShadow: `0 0 10px rgba(0,255,106,.12)`,
  },
  fieldSelect: {
    width: '100%',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8,
    padding: '12px 13px',
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: C.white,
    outline: 'none',
    WebkitAppearance: 'none',
    boxSizing: 'border-box',
  },
  selectOption: {
    background: '#0a120a',
  },
  btnNext: {
    width: '100%',
    background: `linear-gradient(135deg, ${C.neon}, #a8ff78)`,
    color: C.dark,
    border: 'none',
    padding: 15,
    borderRadius: 10,
    fontFamily: FONT_HEADING,
    fontSize: 20,
    letterSpacing: 2,
    cursor: 'pointer',
    marginTop: 4,
    boxShadow: `0 0 22px rgba(0,255,106,.3)`,
  },
  btnGhost: {
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,.25)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 10,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    letterSpacing: .5,
    marginTop: 4,
  },

  // Send screen
  sendTitle: {
    fontFamily: FONT_HEADING,
    fontSize: 'clamp(28px, 8vw, 42px)',
    lineHeight: 1, color: C.white,
    letterSpacing: 1, textAlign: 'center',
    marginBottom: 18,
  },
  photoThumb: {
    width: '100%', maxWidth: 320,
    height: 'auto', objectFit: 'cover',
    borderRadius: 10, marginBottom: 18,
    alignSelf: 'center',
    boxShadow: `0 0 0 1px rgba(0,255,106,.12)`,
  },
  nomineeChip: {
    width: '100%', maxWidth: 380,
    alignSelf: 'center',
    background: 'rgba(0,255,106,.06)',
    border: '1px solid rgba(0,255,106,.18)',
    borderRadius: 10,
    padding: '12px 16px',
    marginBottom: 18,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  ncName: {
    fontSize: 14, fontWeight: 600, color: C.white,
  },
  ncComp: {
    fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1,
  },
  btnSend: (disabled) => ({
    width: '100%', maxWidth: 380,
    alignSelf: 'center',
    background: `linear-gradient(135deg, ${C.neon}, #a8ff78)`,
    color: C.dark,
    border: 'none',
    padding: 15,
    borderRadius: 10,
    fontFamily: FONT_HEADING,
    fontSize: 20,
    letterSpacing: 2,
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: `0 0 22px rgba(0,255,106,.3)`,
    opacity: disabled ? .4 : 1,
  }),
  btnRetake: {
    width: '100%', maxWidth: 380,
    alignSelf: 'center',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,.22)',
    fontSize: 11, cursor: 'pointer',
    padding: 10, textDecoration: 'underline',
    textUnderlineOffset: 3, letterSpacing: .5,
    textAlign: 'center', marginTop: 4,
  },

  // Success
  success: {
    background: `radial-gradient(ellipse 100% 80% at 50% 30%, #0d2e12, ${C.dark})`,
    textAlign: 'center',
    padding: '40px 28px',
  },
  successTitle: {
    fontFamily: FONT_HEADING,
    fontSize: 'clamp(44px, 12vw, 70px)',
    lineHeight: .95,
    color: C.white,
    marginBottom: 8,
  },
  successSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,.48)',
    lineHeight: 1.65,
    maxWidth: 280,
    margin: '0 auto 28px',
  },
  qrWrap: {
    background: '#fff',
    borderRadius: 16,
    padding: 16,
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginBottom: 26,
  },
  qrLabel: {
    fontSize: 9, fontWeight: 700,
    letterSpacing: 2, textTransform: 'uppercase',
    color: '#1a1a1a',
  },
  btnAgain: {
    background: 'transparent',
    border: '1.5px solid rgba(0,255,106,.32)',
    color: 'rgba(255,255,255,.55)',
    padding: '13px 36px',
    borderRadius: 8,
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Error message
  errorMsg: {
    color: C.hot,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  submitting: {
    opacity: 0.6,
    pointerEvents: 'none',
  },
};

// ─── CSS keyframes (injected once) ───────────────────────────────────────────
const KEYFRAMES_ID = 'photobooth-keyframes';
const KEYFRAMES_CSS = `
  @keyframes pb-blink{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes pb-glow{0%,100%{filter:drop-shadow(0 0 18px rgba(0,255,106,.4))}50%{filter:drop-shadow(0 0 48px rgba(0,255,106,.75))}}
  @keyframes pb-spin{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(12deg) translateY(-6px)}}
  @keyframes pb-scan{0%{top:14px}100%{top:calc(100% - 14px)}}
  @keyframes pb-cba{0%{transform:scale(2.2);opacity:0}100%{transform:scale(1);opacity:1}}
`;

// ─── Component ───────────────────────────────────────────────────────────────
export default function PhotoBoothPage() {
  // Screen state
  const [screen, setScreen] = useState('welcome'); // welcome | camera | preview | nominate | send | success

  // Camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownRef = useRef(null);

  // Photo data
  const [shots, setShots] = useState([]);
  const [shotCount, setShotCount] = useState(0);
  const [stripDataUrl, setStripDataUrl] = useState(null); // Preview composite
  const [brandedBlobs, setBrandedBlobs] = useState([]); // Individual branded photos for upload

  // UI state
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownNum, setCountdownNum] = useState(COUNTDOWN_SECS);
  const [flashOn, setFlashOn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Nomination form
  const [nomName, setNomName] = useState('');
  const [nomIg, setNomIg] = useState('');
  const [nomEmail, setNomEmail] = useState('');
  const [nomComp, setNomComp] = useState(COMPETITIONS[0].id);
  const [skipNom, setSkipNom] = useState(false);

  // Send form
  const [sendEmail, setSendEmail] = useState('');

  // Focus states for inputs
  const [focusedField, setFocusedField] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Load Google Fonts + keyframes on mount
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    if (!document.getElementById(KEYFRAMES_ID)) {
      const style = document.createElement('style');
      style.id = KEYFRAMES_ID;
      style.textContent = KEYFRAMES_CSS;
      document.head.appendChild(style);
    }

    return () => {
      document.head.removeChild(link);
      const kf = document.getElementById(KEYFRAMES_ID);
      if (kf) document.head.removeChild(kf);
    };
  }, []);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ─── Camera ──────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setScreen('camera');
    setShots([]);
    setShotCount(0);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera not supported on this device');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      setError('Camera access denied. Please allow camera access and try again.');
    }
  }, []);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) return;
    setShowCountdown(true);
    let c = COUNTDOWN_SECS;
    setCountdownNum(c);

    countdownRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setShowCountdown(false);
        takeShot();
      } else {
        setCountdownNum(c);
      }
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotCount]);

  const takeShot = useCallback(() => {
    // Flash effect
    setFlashOn(true);
    setTimeout(() => setFlashOn(false), 120);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 480, H = 480;
    canvas.width = W;
    canvas.height = H;

    const v = videoRef.current;
    if (v && v.srcObject) {
      // Mirror the image
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0, W, H);
      ctx.restore();
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setShots((prev) => {
      const newShots = [...prev, dataUrl];
      const newCount = newShots.length;
      setShotCount(newCount);

      if (newCount < TOTAL_SHOTS) {
        // Auto-start next countdown after a brief pause
        setTimeout(() => {
          setShowCountdown(true);
          let c = COUNTDOWN_SECS;
          setCountdownNum(c);
          countdownRef.current = setInterval(() => {
            c--;
            if (c <= 0) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
              setShowCountdown(false);
              takeShot();
            } else {
              setCountdownNum(c);
            }
          }, 1000);
        }, 900);
      } else {
        // All shots taken — build strip
        buildPhotos(newShots);
      }

      return newShots;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: draw a stylized 4-leaf clover with neon glow
  const drawStylizedClover = useCallback((ctx, cx, cy, size) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = C.neon;
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = C.neon;

    // Draw 4 heart-shaped leaves rotated 90° apart
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-size * 0.5, -size * 0.1, -size * 0.55, -size * 0.65, 0, -size * 0.85);
      ctx.bezierCurveTo(size * 0.55, -size * 0.65, size * 0.5, -size * 0.1, 0, 0);
      ctx.fill();
      ctx.restore();
    }

    // Small stem
    ctx.shadowBlur = 0;
    ctx.strokeStyle = C.neon;
    ctx.lineWidth = size * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, size * 0.1);
    ctx.quadraticCurveTo(size * 0.15, size * 0.5, size * 0.05, size * 0.7);
    ctx.stroke();

    ctx.restore();
  }, []);

  // Helper: draw gradient separator line (green → gold)
  const drawGradientLine = useCallback((ctx, x, y, W, h) => {
    const grad = ctx.createLinearGradient(x, y, x + W, y);
    grad.addColorStop(0, C.neon);
    grad.addColorStop(1, '#ffd700');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, W, h);
  }, []);

  // Helper: draw the branded banner on a canvas context
  const drawBanner = useCallback((ctx, W, wmH) => {
    // Dark background
    ctx.fillStyle = 'rgba(6,10,6,.97)';
    ctx.fillRect(0, 0, W, wmH);

    // Subtle radial green glow from center-top
    const glow = ctx.createRadialGradient(W * 0.5, 0, 0, W * 0.5, wmH * 0.5, W * 0.5);
    glow.addColorStop(0, 'rgba(0,255,106,0.1)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, wmH);

    // Gradient separator line at bottom (green → gold)
    drawGradientLine(ctx, 0, wmH - 2, W, 2);

    // Title with letter-spacing
    const fS = Math.max(13, W * 0.031);
    ctx.fillStyle = C.neon;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const title = 'LUCKY DISCO × MOST ELIGIBLE';
    const spacing = fS * 0.15;
    ctx.font = `800 ${fS}px "Bebas Neue", Arial Black, sans-serif`;
    let xPos = W * 0.04;
    const titleY = wmH * 0.42;
    for (const ch of title) {
      ctx.fillText(ch, xPos, titleY);
      xPos += ctx.measureText(ch).width + spacing;
    }

    // Subtitle
    ctx.font = `500 ${fS * 0.6}px "Space Grotesk", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.textBaseline = 'middle';
    ctx.fillText("St. Patrick's Day 2026", W * 0.04, wmH * 0.76);

    // Stylized clover (top-right)
    const cloverSize = wmH * 0.28;
    drawStylizedClover(ctx, W * 0.93, wmH * 0.48, cloverSize);

    ctx.textBaseline = 'alphabetic';
  }, [drawStylizedClover, drawGradientLine]);

  // Helper: draw the bottom footer bar with @mosteligiblechi
  const drawFooter = useCallback((ctx, W, y, ftH) => {
    ctx.fillStyle = 'rgba(6,10,6,.97)';
    ctx.fillRect(0, y, W, ftH);

    // Gradient separator line at top (green → gold)
    drawGradientLine(ctx, 0, y, W, 2);

    // Centered @mosteligiblechi
    const fS = Math.max(12, W * 0.028);
    ctx.font = `700 ${fS}px "Space Grotesk", Arial, sans-serif`;
    ctx.fillStyle = C.neon;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@mosteligiblechi', W * 0.5, y + ftH * 0.55);
    ctx.textBaseline = 'alphabetic';
  }, [drawGradientLine]);

  const buildPhotos = useCallback(async (allShots) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try { await document.fonts.ready; } catch (e) { /* proceed */ }

    const loadImage = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
      });

    const imgs = await Promise.all(allShots.map(loadImage));

    // 1. Build preview strip (for display only, not emailed)
    const SW = 480, SH = 480, pad = 8, wmH = 70, ftH = 50;
    const stripW = SW + pad * 2;
    const stripH = wmH + pad + (SH + pad) * TOTAL_SHOTS + pad + ftH;
    canvas.width = stripW;
    canvas.height = stripH;

    ctx.fillStyle = C.dark;
    ctx.fillRect(0, 0, stripW, stripH);
    drawBanner(ctx, stripW, wmH);

    imgs.forEach((img, i) => {
      const y = wmH + pad + i * (SH + pad);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(pad, y, SW, SH, 8);
      ctx.clip();
      ctx.drawImage(img, pad, y, SW, SH);
      ctx.restore();
    });

    drawFooter(ctx, stripW, stripH - ftH, ftH);

    setStripDataUrl(canvas.toDataURL('image/jpeg', 0.92));

    // 2. Build individual branded photos (banner + photo each, for email)
    const photoW = 600, photoH = 600, bannerH = 80, footerH = 50;
    const singleH = bannerH + photoH + footerH;
    const blobs = [];

    for (const img of imgs) {
      canvas.width = photoW;
      canvas.height = singleH;

      ctx.fillStyle = C.dark;
      ctx.fillRect(0, 0, photoW, singleH);
      drawBanner(ctx, photoW, bannerH);
      ctx.drawImage(img, 0, bannerH, photoW, photoH);
      drawFooter(ctx, photoW, bannerH + photoH, footerH);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      blobs.push(blob);
    }

    setBrandedBlobs(blobs);

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setScreen('preview');
  }, [drawBanner, drawFooter]);

  // ─── Nomination ──────────────────────────────────────────────────────────
  const goNominate = useCallback(() => {
    setScreen('nominate');
  }, []);

  const goSend = useCallback(() => {
    const errs = {};
    if (!nomName.trim()) errs.name = true;
    if (!isValidEmail(nomEmail)) errs.email = true;
    if (!nomIg.trim()) errs.ig = true;
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError('Please fill in name, email, and instagram to nominate someone.');
      return;
    }
    setFieldErrors({});
    setError('');
    setSkipNom(false);
    // Pre-fill send email with nominee email if available
    if (nomEmail.trim()) {
      setSendEmail(nomEmail.trim());
    }
    setScreen('send');
  }, [nomName, nomEmail, nomIg]);

  const goSendSkip = useCallback(() => {
    setSkipNom(true);
    setSendEmail('');
    setScreen('send');
  }, []);

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const email = normalizeEmail(sendEmail);
    if (!isValidEmail(email)) {
      setFieldErrors({ sendEmail: true });
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Upload individual branded photos to Supabase Storage
      const photoUrls = [];
      if (brandedBlobs.length > 0) {
        const ts = Date.now();
        for (let i = 0; i < brandedBlobs.length; i++) {
          const fileName = `photobooth/${ts}-${i + 1}-${Math.random().toString(36).substring(2, 7)}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, brandedBlobs[i], {
              contentType: 'image/jpeg',
              cacheControl: '31536000',
              upsert: false,
            });
          if (uploadError) {
            console.error(`Upload error photo ${i + 1}:`, uploadError);
            throw new Error('Failed to upload photos. Please try again.');
          }
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
          photoUrls.push(urlData.publicUrl);
        }
      }

      // 2. If nomination, insert nominee record (non-blocking — photo send always happens)
      let nomineeName = null;
      if (!skipNom && nomName.trim()) {
        nomineeName = nomName.trim();
        const nomineeEmail = normalizeEmail(nomEmail) || null;
        const isThirdParty = email !== (nomineeEmail || '');

        const insertData = {
          competition_id: nomComp,
          name: nomineeName,
          email: nomineeEmail,
          instagram: nomIg.trim() || null,
          nominated_by: isThirdParty ? 'third_party' : 'self',
          nomination_reason: 'Nominated at Lucky Disco photo booth',
          status: 'pending',
        };

        // If the person sending the photo is different from the nominee, they're the nominator
        if (isThirdParty && email) {
          insertData.nominator_email = email;
          insertData.nominator_notify = true;
        }

        try {
          const { data: inserted, error: dbError } = await supabase
            .from('nominees')
            .insert(insertData)
            .select('id, invite_token')
            .single();

          if (dbError) {
            if (dbError.code === '23505') {
              console.warn('Nominee already exists, continuing with photo delivery');
            } else {
              console.error('Nomination insert error:', dbError);
            }
          }

          // Fire-and-forget: send nomination invite email to nominee
          if (inserted?.id) {
            supabase.functions.invoke('send-nomination-invite', {
              body: { nominee_id: inserted.id },
            }).catch((err) => console.warn('Failed to send nomination invite:', err));
          }
        } catch (nomErr) {
          // Nomination failed but don't block photo delivery
          console.error('Nomination error (non-blocking):', nomErr);
        }
      }

      // 3. Send photo email — always runs even if nomination failed
      if (photoUrls.length > 0) {
        supabase.functions.invoke('send-photobooth-photo', {
          body: {
            to_email: email,
            photo_urls: photoUrls,
            nominee_name: nomineeName,
          },
        }).catch((err) => console.warn('Failed to send photo email:', err));
      }

      setScreen('success');
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [sendEmail, brandedBlobs, skipNom, nomName, nomEmail, nomIg, nomComp]);

  // ─── Reset ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setScreen('welcome');
    setShots([]);
    setShotCount(0);
    setStripDataUrl(null);
    setBrandedBlobs([]);
    setNomName('');
    setNomIg('');
    setNomEmail('');
    setNomComp(COMPETITIONS[0].id);
    setSkipNom(false);
    setSendEmail('');
    setError('');
    setFieldErrors({});
    setShowCountdown(false);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const retakeStrip = useCallback(() => {
    setShots([]);
    setShotCount(0);
    setStripDataUrl(null);
    setBrandedBlobs([]);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    startCamera();
  }, [startCamera]);

  const retakeFromSend = useCallback(() => {
    setShots([]);
    setShotCount(0);
    setStripDataUrl(null);
    setBrandedBlobs([]);
    setScreen('welcome');
  }, []);

  // ─── Input helper ────────────────────────────────────────────────────────
  const inputStyle = (fieldName) => ({
    ...styles.fieldInput,
    ...(focusedField === fieldName ? styles.fieldInputFocus : {}),
    ...(fieldErrors[fieldName] ? styles.fieldInputErr : {}),
  });

  // ─── QR Code (simple SVG-based approach) ─────────────────────────────────
  const qrRef = useRef(null);
  useEffect(() => {
    if (screen === 'success' && qrRef.current && !qrRef.current.hasChildNodes()) {
      // Dynamically load QR code library
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => {
        if (window.QRCode && qrRef.current) {
          new window.QRCode(qrRef.current, {
            text: 'https://www.instagram.com/mosteligiblechi/',
            width: 140,
            height: 140,
            colorDark: '#060a06',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel.H,
          });
        }
      };
      document.head.appendChild(script);
    }
  }, [screen]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_BODY, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Flash overlay */}
      <div style={{ ...styles.flash, opacity: flashOn ? 1 : 0 }} />

      {/* ─── WELCOME SCREEN ─── */}
      {screen === 'welcome' && (
        <div style={{ ...styles.screen, ...styles.welcome }}>
          <div style={{ ...styles.orb, ...styles.orb1 }} />
          <div style={{ ...styles.orb, ...styles.orb2 }} />
          <div style={styles.wInner}>
            <div style={styles.badge}>
              <div style={{ ...styles.bdot, animation: 'pb-blink 2s ease-in-out infinite' }} />
              <div style={styles.badgeText}>
                Most Eligible <span style={{ color: C.neon }}>×</span> VibeApple
              </div>
            </div>
            <div style={styles.heroPre}>I'm Feeling</div>
            <div style={{ lineHeight: 1, marginBottom: 8 }}>
              <span style={{ ...styles.heroLucky, animation: 'pb-glow 3s ease-in-out infinite' }}>LUCKY</span>
              <span style={{ ...styles.shamrock, animation: 'pb-spin 4s ease-in-out infinite' }}>🍀</span>
            </div>
            <div style={styles.heroSub}>
              Step into the booth. Strike a pose.<br />
              <strong style={{ color: 'rgba(255,255,255,.7)' }}>Get nominated.</strong>
            </div>
            <button style={styles.btnMain} onClick={startCamera}>
              LET'S GO &nbsp;☘️
            </button>
          </div>
        </div>
      )}

      {/* ─── CAMERA SCREEN ─── */}
      {screen === 'camera' && (
        <div style={{ ...styles.screen, ...styles.camera }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={styles.video}
          />

          {/* Corner brackets */}
          <div style={{ ...styles.bracket, top: 14, left: 14, borderTop: `2px solid ${C.neon}`, borderLeft: `2px solid ${C.neon}` }} />
          <div style={{ ...styles.bracket, top: 14, right: 14, borderTop: `2px solid ${C.neon}`, borderRight: `2px solid ${C.neon}` }} />
          <div style={{ ...styles.bracket, bottom: 14, left: 14, borderBottom: `2px solid ${C.neon}`, borderLeft: `2px solid ${C.neon}` }} />
          <div style={{ ...styles.bracket, bottom: 14, right: 14, borderBottom: `2px solid ${C.neon}`, borderRight: `2px solid ${C.neon}` }} />

          {/* Scan line */}
          <div style={{
            position: 'absolute', left: 14, right: 14, height: 2,
            background: `linear-gradient(90deg, transparent, ${C.neon}, transparent)`,
            zIndex: 20, pointerEvents: 'none',
            animation: 'pb-scan 3s linear infinite',
            boxShadow: `0 0 8px ${C.neon}`, opacity: .5,
          }} />

          {/* Countdown overlay */}
          {showCountdown && (
            <div style={styles.countdown}>
              <div
                key={countdownNum}
                style={{ ...styles.countdownNum, animation: 'pb-cba .7s cubic-bezier(.25,.46,.45,.94)' }}
              >
                {countdownNum}
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div style={styles.camBot}>
            <div style={styles.shotDots}>
              {Array.from({ length: TOTAL_SHOTS }).map((_, i) => (
                <div key={i} style={styles.shotDot(i < shotCount)} />
              ))}
            </div>
            <button style={styles.shutter} onClick={startCountdown}>
              <div style={styles.shutterIn} />
            </button>
            <div style={styles.camHint}>Tap to shoot · {COUNTDOWN_SECS} sec timer</div>
            {error && <div style={styles.errorMsg}>{error}</div>}
          </div>
        </div>
      )}

      {/* ─── PREVIEW SCREEN ─── */}
      {screen === 'preview' && stripDataUrl && (
        <div style={{ ...styles.screen, ...styles.preview }}>
          <div style={styles.previewInner}>
            <div style={styles.previewTitle}>
              YOUR <span style={{ color: C.neon }}>STRIP</span>
            </div>
            <img
              src={stripDataUrl}
              alt="Photo strip preview"
              style={styles.stripCanvas}
            />
            <button
              style={{ ...styles.btnNext, maxWidth: 320 }}
              onClick={goNominate}
            >
              LOOKS GOOD ✦
            </button>
            <button style={styles.btnGhost} onClick={retakeStrip}>
              ↩ Retake
            </button>
          </div>
        </div>
      )}

      {/* ─── NOMINATE SCREEN ─── */}
      {screen === 'nominate' && (
        <div style={{ ...styles.screen, ...styles.formScreen }}>
          {stripDataUrl && (
            <img src={stripDataUrl} alt="Photo strip" style={styles.whoPhoto} />
          )}
          <h2 style={styles.whoQuestion}>
            Who is the <span style={{ color: C.neon }}>Most Eligible</span> single?
          </h2>
          <p style={styles.whoSub}>Tell us about the star of the show</p>
          <div style={styles.whoForm}>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Nominee's Name</label>
              <input
                type="text"
                placeholder="First & Last"
                autoComplete="off"
                value={nomName}
                onChange={(e) => setNomName(e.target.value)}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                style={inputStyle('name')}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Their Instagram</label>
              <input
                type="text"
                placeholder="@handle"
                autoComplete="off"
                value={nomIg}
                onChange={(e) => setNomIg(e.target.value)}
                onFocus={() => setFocusedField('ig')}
                onBlur={() => setFocusedField(null)}
                style={inputStyle('ig')}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Their Email</label>
              <input
                type="email"
                placeholder="nominee@email.com"
                autoComplete="off"
                value={nomEmail}
                onChange={(e) => setNomEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                style={inputStyle('email')}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Competition</label>
              <select
                value={nomComp}
                onChange={(e) => setNomComp(e.target.value)}
                style={styles.fieldSelect}
              >
                {COMPETITIONS.map((c) => (
                  <option key={c.id} value={c.id} style={styles.selectOption}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {error && <div style={styles.errorMsg}>{error}</div>}
            <button style={styles.btnNext} onClick={goSend}>NEXT →</button>
            <button style={styles.btnGhost} onClick={goSendSkip}>
              Skip — just send me the photo
            </button>
          </div>
        </div>
      )}

      {/* ─── SEND SCREEN ─── */}
      {screen === 'send' && (
        <div style={{ ...styles.screen, ...styles.formScreen }}>
          <div style={styles.sendTitle}>
            Now, <span style={{ color: C.neon }}>send it</span>.
          </div>
          {stripDataUrl && (
            <img src={stripDataUrl} alt="Photo strip" style={styles.photoThumb} />
          )}
          {!skipNom && nomName.trim() && (
            <div style={styles.nomineeChip}>
              <div style={{ fontSize: 20 }}>👑</div>
              <div style={{ flex: 1 }}>
                <div style={styles.ncName}>{nomName.trim()}</div>
                <div style={styles.ncComp}>
                  {nomIg.trim() || 'Most Eligible Chicago 2026'}
                </div>
              </div>
            </div>
          )}
          <div style={{ ...styles.field, width: '100%', maxWidth: 380, alignSelf: 'center' }}>
            <label style={styles.fieldLabel}>Where should we send the photo?</label>
            <input
              type="email"
              placeholder="you@email.com"
              autoComplete="off"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
              onFocus={() => setFocusedField('sendEmail')}
              onBlur={() => setFocusedField(null)}
              style={inputStyle('sendEmail')}
            />
          </div>
          {error && <div style={styles.errorMsg}>{error}</div>}
          <button
            style={styles.btnSend(!sendEmail.trim())}
            onClick={handleSubmit}
            disabled={!sendEmail.trim() || isSubmitting}
          >
            {isSubmitting ? 'SENDING...' : 'SUBMIT ✦'}
          </button>
          <button style={styles.btnRetake} onClick={retakeFromSend}>
            ↩ Retake photo
          </button>
        </div>
      )}

      {/* ─── SUCCESS SCREEN ─── */}
      {screen === 'success' && (
        <div style={{ ...styles.screen, ...styles.success }}>
          <h1 style={styles.successTitle}>
            LOCKED<br />IN & <span style={{ color: C.neon }}>LUCKY</span>
          </h1>
          <p style={styles.successSub}>
            Your photos are on the way! Check your email shortly.
          </p>
          <div style={styles.qrWrap}>
            <div style={styles.qrLabel}>Follow the competition</div>
            <div ref={qrRef} />
          </div>
          <br />
          <button style={styles.btnAgain} onClick={reset}>
            ☘️ &nbsp;Take Another Photo
          </button>
        </div>
      )}
    </div>
  );
}
