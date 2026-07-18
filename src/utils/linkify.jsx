import React from 'react';
import { colors } from '../styles/theme';

// Matches http(s):// URLs and bare www. URLs. Kept deliberately simple —
// we only need to turn plainly-typed links into clickable ones.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
// Trailing punctuation that's almost always sentence punctuation, not URL.
const TRAILING_PUNCT_RE = /[.,!?;:)\]}'"]+$/;

/**
 * Turn plain text into an array of React nodes, converting any URLs into
 * clickable links that open in a new tab. Text is rendered as React text
 * nodes (auto-escaped), so this is safe for untrusted content — no
 * dangerouslySetInnerHTML.
 *
 * The returned <a> elements must live inside a non-<button> container
 * (nesting interactive elements inside a <button> is invalid HTML).
 * Each link stops click propagation so it doesn't also trigger a clickable
 * parent row.
 *
 * @param {string} text
 * @param {{ linkColor?: string }} [opts]
 * @returns {React.ReactNode}
 */
export function renderTextWithLinks(text, { linkColor } = {}) {
  if (!text || typeof text !== 'string') return text;

  const nodes = [];
  let lastIndex = 0;
  let key = 0;
  let match;
  URL_RE.lastIndex = 0;

  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    // Peel trailing punctuation back out of the link.
    let url = raw;
    let trailing = '';
    const t = url.match(TRAILING_PUNCT_RE);
    if (t) {
      trailing = t[0];
      url = url.slice(0, url.length - trailing.length);
    }

    if (url) {
      const href = url.startsWith('www.') ? `https://${url}` : url;
      nodes.push(
        <a
          key={`lnk-${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: linkColor || colors.gold.primary,
            textDecoration: 'underline',
            wordBreak: 'break-word',
          }}
        >
          {url}
        </a>
      );
    }
    if (trailing) nodes.push(trailing);

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes.length > 0 ? nodes : text;
}
