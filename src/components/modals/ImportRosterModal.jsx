import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check, Loader, Trash2, Plus, ImagePlus, ArrowRight, ArrowLeft,
  AlertTriangle, CheckCircle, XCircle, FileSpreadsheet,
} from 'lucide-react';
import { Modal, Button } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { uploadPhoto } from '../../features/entry/utils/uploadPhoto';

/**
 * ImportRosterModal
 *
 * Lets a host bring their existing roster into a competition in one shot.
 *
 * Flow:
 *  1. "input"  — paste rows (from a spreadsheet) or upload a .csv. Parsed into
 *                an editable table. A manual "Add row" is available too.
 *  2. "review" — an editable table: fix any cell, attach a photo per person
 *                (spreadsheets can't carry images), drop rows.
 *  3. "result" — a summary of what was created / skipped / errored.
 *
 * On import each person gets a real account + is added directly as a contestant,
 * and (by default) is emailed a "claim your profile" link. The heavy lifting is
 * done server-side by the bulk-import-contestants edge function via `onImport`.
 */

// Header aliases → canonical field. Anything not recognized is ignored.
const HEADER_ALIASES = {
  name: 'name',
  'full name': 'name',
  fullname: 'name',
  email: 'email',
  'e-mail': 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  cell: 'phone',
  instagram: 'instagram',
  ig: 'instagram',
  handle: 'instagram',
  'instagram handle': 'instagram',
  city: 'city',
  location: 'city',
  age: 'age',
  bio: 'bio',
  about: 'bio',
  description: 'bio',
  gender: 'gender',
  sex: 'gender',
};

const DEFAULT_ORDER = ['name', 'email', 'phone', 'instagram', 'city', 'age', 'bio'];

let rowIdCounter = 0;
const makeRow = (data = {}) => ({
  id: `row-${rowIdCounter++}`,
  name: '',
  email: '',
  phone: '',
  instagram: '',
  city: '',
  age: '',
  bio: '',
  gender: '',
  avatarUrl: '',
  uploading: false,
  ...data,
});

// Parse a single delimited line, respecting double-quoted fields.
function parseLine(line, delimiter) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const isEmailish = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

// Turn pasted/CSV text into row objects.
function parseRoster(text) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Prefer tab when present (Excel/Sheets copy-paste), else comma.
  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const firstCells = parseLine(lines[0], delimiter).map((c) => c.toLowerCase());
  const hasHeader = firstCells.some((c) => HEADER_ALIASES[c]);
  const hasFirstLast = firstCells.includes('first name') && firstCells.includes('last name');

  let columns; // canonical field name per column index (or null to skip)
  let firstNameIdx = -1;
  let lastNameIdx = -1;
  let dataLines;

  if (hasHeader || hasFirstLast) {
    columns = firstCells.map((c) => HEADER_ALIASES[c] || null);
    firstNameIdx = firstCells.indexOf('first name');
    lastNameIdx = firstCells.indexOf('last name');
    dataLines = lines.slice(1);
  } else {
    columns = DEFAULT_ORDER;
    dataLines = lines;
  }

  return dataLines.map((line) => {
    const cells = parseLine(line, delimiter);
    const data = {};
    columns.forEach((field, idx) => {
      if (field && cells[idx] != null && cells[idx] !== '') data[field] = cells[idx];
    });
    if ((firstNameIdx >= 0 || lastNameIdx >= 0) && !data.name) {
      data.name = [cells[firstNameIdx], cells[lastNameIdx]]
        .filter(Boolean)
        .join(' ')
        .trim();
    }
    return makeRow(data);
  });
}

export default function ImportRosterModal({
  isOpen,
  onClose,
  onImport,
  splitByGender = false,
}) {
  const [step, setStep] = useState('input'); // 'input' | 'review' | 'result'
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef(null);
  const photoInputRefs = useRef({});

  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setRawText('');
      setRows([]);
      setImporting(false);
      setResult(null);
      setParseError('');
    }
  }, [isOpen]);

  const handleParse = () => {
    setParseError('');
    const parsed = parseRoster(rawText);
    if (parsed.length === 0) {
      setParseError('No rows found. Paste your roster (one person per line) or upload a CSV.');
      return;
    }
    setRows(parsed);
    setStep('review');
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawText(String(reader.result || ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addBlankRow = () => {
    setRows((prev) => [...prev, makeRow()]);
  };

  const handlePhoto = useCallback(async (id, file) => {
    if (!file) return;
    updateRow(id, 'uploading', true);
    try {
      const url = await uploadPhoto(file, 'nominations');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, avatarUrl: url, uploading: false } : r)));
    } catch (err) {
      console.error('Photo upload failed:', err);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, uploading: false } : r)));
    }
  }, []);

  const rowValid = (r) =>
    r.name.trim().length > 0 &&
    isEmailish(r.email) &&
    (!splitByGender || r.gender === 'male' || r.gender === 'female');

  const validRows = rows.filter(rowValid);
  const invalidCount = rows.length - validRows.length;
  const anyUploading = rows.some((r) => r.uploading);

  const handleImport = async () => {
    if (validRows.length === 0 || !onImport) return;
    setImporting(true);
    try {
      const payload = validRows.map((r) => ({
        name: r.name.trim(),
        email: r.email.trim(),
        phone: r.phone.trim() || null,
        instagram: r.instagram.trim() || null,
        city: r.city.trim() || null,
        age: r.age.toString().trim() || null,
        bio: r.bio.trim() || null,
        gender: splitByGender ? r.gender : (r.gender || null),
        avatar_url: r.avatarUrl || null,
      }));
      const res = await onImport(payload);
      setResult(res || { created: [], skipped: [], errors: [] });
      setStep('result');
    } catch (err) {
      console.error('Roster import failed:', err);
      setResult({ created: [], skipped: [], errors: [{ name: '', email: '', error: err?.message || 'Import failed' }] });
      setStep('result');
    } finally {
      setImporting(false);
    }
  };

  const title =
    step === 'result' ? 'Import Complete'
      : step === 'review' ? 'Review Roster'
        : 'Import Roster';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth={step === 'review' ? '920px' : '560px'}
      footer={renderFooter()}
    >
      {step === 'input' && renderInput()}
      {step === 'review' && renderReview()}
      {step === 'result' && renderResult()}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Modal>
  );

  function renderFooter() {
    if (step === 'input') {
      return (
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleParse} disabled={!rawText.trim()} icon={ArrowRight}>
            Continue
          </Button>
        </>
      );
    }
    if (step === 'review') {
      return (
        <>
          <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep('input')}>
            Back
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || anyUploading || validRows.length === 0}
            icon={importing ? Loader : Check}
          >
            {importing
              ? 'Importing...'
              : `Import ${validRows.length} ${validRows.length === 1 ? 'Contestant' : 'Contestants'}`}
          </Button>
        </>
      );
    }
    return <Button onClick={onClose}>Done</Button>;
  }

  function renderInput() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, margin: 0, lineHeight: 1.6 }}>
          Paste your roster from a spreadsheet (one person per row), or upload a CSV.
          Each person gets an account and is added straight to your contestant lineup —
          they'll be emailed a link to set a password and claim their profile.
        </p>

        <div style={{
          padding: spacing.md,
          background: colors.background.secondary,
          border: `1px solid ${colors.border.light}`,
          borderRadius: borderRadius.lg,
          fontSize: typography.fontSize.xs,
          color: colors.text.muted,
          lineHeight: 1.6,
        }}>
          Recognized columns:{' '}
          <span style={{ color: colors.text.secondary }}>
            name, email, phone, instagram, city, age, bio{splitByGender ? ', gender' : ''}
          </span>
          . A header row is optional — without one, columns are read in that order.
          Photos are added in the next step.
        </div>

        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`name, email, instagram, city\nJane Doe, jane@example.com, @janedoe, Dallas\nJohn Smith, john@example.com, @johnsmith, Austin`}
          rows={8}
          style={{
            width: '100%',
            padding: spacing.md,
            background: colors.background.secondary,
            border: `1px solid ${colors.border.light}`,
            borderRadius: borderRadius.lg,
            color: colors.text.primary,
            fontSize: typography.fontSize.sm,
            fontFamily: 'monospace',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => fileInputRef.current?.click()}>
            Upload CSV
          </Button>
          <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>
            .csv file from Excel, Google Sheets, Numbers, etc.
          </span>
        </div>

        {parseError && (
          <p style={{ color: colors.status.error, fontSize: typography.fontSize.sm, margin: 0 }}>
            {parseError}
          </p>
        )}
      </div>
    );
  }

  function renderReview() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
          <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, margin: 0 }}>
            {rows.length} {rows.length === 1 ? 'person' : 'people'} • {validRows.length} ready
            {invalidCount > 0 && (
              <span style={{ color: '#f59e0b' }}>
                {' '}• {invalidCount} need{invalidCount === 1 ? 's' : ''} a name{splitByGender ? ', email & gender' : ' & valid email'}
              </span>
            )}
          </p>
          <Button variant="secondary" size="sm" icon={Plus} onClick={addBlankRow}>
            Add row
          </Button>
        </div>

        <div style={{ overflowX: 'auto', border: `1px solid ${colors.border.light}`, borderRadius: borderRadius.lg }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: colors.background.secondary }}>
                {['Photo', 'Name *', 'Email *', 'Age', 'City', 'Instagram', 'Phone']
                  .concat(splitByGender ? ['Gender *'] : [])
                  .concat(['']).map((h, i) => (
                    <th key={i} style={{
                      textAlign: 'left',
                      padding: `${spacing.sm} ${spacing.md}`,
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.secondary,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const valid = rowValid(r);
                return (
                  <tr key={r.id} style={{
                    borderTop: `1px solid ${colors.border.lighter}`,
                    background: valid ? 'transparent' : 'rgba(245,158,11,0.06)',
                  }}>
                    <td style={cellStyle}>
                      <button
                        type="button"
                        onClick={() => photoInputRefs.current[r.id]?.click()}
                        title="Add photo"
                        style={{
                          width: 40, height: 40, borderRadius: borderRadius.full,
                          border: `1px solid ${colors.border.primary}`,
                          background: r.avatarUrl ? `url(${r.avatarUrl}) center/cover` : colors.background.secondary,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: colors.text.muted, padding: 0, flexShrink: 0,
                        }}
                      >
                        {r.uploading
                          ? <Loader size={16} style={{ animation: 'spin 1s linear infinite', color: colors.gold.primary }} />
                          : !r.avatarUrl && <ImagePlus size={16} />}
                      </button>
                      <input
                        ref={(el) => { photoInputRefs.current[r.id] = el; }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => { handlePhoto(r.id, e.target.files?.[0]); e.target.value = ''; }}
                      />
                    </td>
                    <td style={cellStyle}><CellInput value={r.name} onChange={(v) => updateRow(r.id, 'name', v)} placeholder="Full name" width={140} /></td>
                    <td style={cellStyle}><CellInput value={r.email} onChange={(v) => updateRow(r.id, 'email', v)} placeholder="email@…" width={170} invalid={r.email.length > 0 && !isEmailish(r.email)} /></td>
                    <td style={cellStyle}><CellInput value={r.age} onChange={(v) => updateRow(r.id, 'age', v)} placeholder="—" width={48} /></td>
                    <td style={cellStyle}><CellInput value={r.city} onChange={(v) => updateRow(r.id, 'city', v)} placeholder="—" width={100} /></td>
                    <td style={cellStyle}><CellInput value={r.instagram} onChange={(v) => updateRow(r.id, 'instagram', v)} placeholder="@handle" width={110} /></td>
                    <td style={cellStyle}><CellInput value={r.phone} onChange={(v) => updateRow(r.id, 'phone', v)} placeholder="—" width={110} /></td>
                    {splitByGender && (
                      <td style={cellStyle}>
                        <select
                          value={r.gender}
                          onChange={(e) => updateRow(r.id, 'gender', e.target.value)}
                          style={{
                            padding: `6px ${spacing.sm}`,
                            background: colors.background.secondary,
                            border: `1px solid ${r.gender ? colors.border.light : '#f59e0b'}`,
                            borderRadius: borderRadius.md,
                            color: colors.text.primary,
                            fontSize: typography.fontSize.sm,
                            outline: 'none',
                          }}
                        >
                          <option value="">—</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </td>
                    )}
                    <td style={cellStyle}>
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        title="Remove"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.muted, padding: spacing.xs }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {invalidCount > 0 && (
          <p style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: colors.text.muted, fontSize: typography.fontSize.xs, margin: 0 }}>
            <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
            Rows missing a name{splitByGender ? ', email or gender' : ' or a valid email'} are skipped on import.
          </p>
        )}
      </div>
    );
  }

  function renderResult() {
    const created = result?.created || [];
    const skipped = result?.skipped || [];
    const errors = result?.errors || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
          <ResultStat icon={CheckCircle} color="#22c55e" count={created.length} label="Added" />
          <ResultStat icon={AlertTriangle} color="#f59e0b" count={skipped.length} label="Skipped" />
          <ResultStat icon={XCircle} color="#ef4444" count={errors.length} label="Errors" />
        </div>

        {created.length > 0 && (
          <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, margin: 0, lineHeight: 1.6 }}>
            {created.length} {created.length === 1 ? 'person is' : 'people are'} now in your lineup and
            {' '}have been emailed a link to claim their profile.
          </p>
        )}

        {(skipped.length > 0 || errors.length > 0) && (
          <div style={{
            maxHeight: 220, overflowY: 'auto',
            border: `1px solid ${colors.border.light}`, borderRadius: borderRadius.lg,
          }}>
            {[...errors.map((e) => ({ ...e, kind: 'error' })), ...skipped.map((s) => ({ ...s, kind: 'skip' }))].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm,
                padding: `${spacing.sm} ${spacing.md}`,
                borderBottom: `1px solid ${colors.border.lighter}`,
                fontSize: typography.fontSize.sm,
              }}>
                {item.kind === 'error'
                  ? <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                  : <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                <span style={{ color: colors.text.primary, minWidth: 0, flex: 1 }}>
                  <strong>{item.name || item.email || 'Unknown'}</strong>
                  <span style={{ color: colors.text.muted }}> — {item.error || item.reason}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}

const cellStyle = {
  padding: `${spacing.sm} ${spacing.md}`,
  verticalAlign: 'middle',
};

function CellInput({ value, onChange, placeholder, width = 120, invalid = false }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width,
        maxWidth: '100%',
        padding: `6px ${spacing.sm}`,
        background: colors.background.secondary,
        border: `1px solid ${invalid ? colors.status.error : colors.border.light}`,
        borderRadius: borderRadius.md,
        color: colors.text.primary,
        fontSize: typography.fontSize.sm,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

function ResultStat({ icon: Icon, color, count, label }) {
  return (
    <div style={{
      flex: 1, minWidth: 120,
      background: colors.background.card,
      border: `1px solid ${colors.border.light}`,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      display: 'flex', alignItems: 'center', gap: spacing.md,
    }}>
      <Icon size={22} style={{ color }} />
      <div>
        <p style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color, margin: 0 }}>
          {count}
        </p>
        <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, margin: 0 }}>{label}</p>
      </div>
    </div>
  );
}
