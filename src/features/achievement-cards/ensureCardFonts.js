/**
 * Lazily loads the Montserrat/Inter web fonts used ONLY by the canvas share-card
 * generators (vote + achievement cards).
 *
 * These fonts are intentionally NOT loaded in index.html: per CLAUDE.md the app UI
 * uses system fonts only, and loading web fonts render-blocking on every page load
 * hurt FCP/LCP (Real Experience Score). Confining them to the lazy, user-initiated
 * card-generation path keeps them completely off the critical render path.
 *
 * Rare Google Fonts exception, noted per CLAUDE.md ("rare exceptions allowed only
 * when noted in a comment") — scoped to downloadable share-card images, not app UI.
 */

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&display=swap';

let fontsPromise = null;

/**
 * Ensures the share-card fonts are loaded before drawing to canvas.
 * Idempotent + memoized: the stylesheet is injected at most once, and repeated
 * calls await the same promise. Resolves (never rejects) so a font-load failure
 * degrades gracefully to the system-ui fallback in the generators' FONT stack.
 */
export function ensureCardFonts() {
  if (fontsPromise) return fontsPromise;

  fontsPromise = (async () => {
    if (typeof document === 'undefined') return;

    if (!document.getElementById('card-fonts')) {
      const link = document.createElement('link');
      link.id = 'card-fonts';
      link.rel = 'stylesheet';
      link.href = FONT_CSS_URL;
      document.head.appendChild(link);
    }

    // Wait for the actual weights the cards draw with so canvas text is not
    // rendered before the font is ready (which would bake in the fallback).
    if (document.fonts?.load) {
      try {
        await Promise.all(
          ['400', '500', '600', '700', '800'].map((w) =>
            document.fonts.load(`${w} 16px Montserrat`)
          )
        );
        await document.fonts.ready;
      } catch {
        // Fall back to system-ui — cards still render, just not in Montserrat.
      }
    }
  })();

  return fontsPromise;
}
