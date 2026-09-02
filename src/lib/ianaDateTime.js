export class LocalDateTimeError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseLocal(value) {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) throw new LocalDateTimeError('invalid_local_datetime');
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0),
  };
  const roundTrip = new Date(Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second,
  ));
  if (
    roundTrip.getUTCFullYear() !== parts.year
    || roundTrip.getUTCMonth() + 1 !== parts.month
    || roundTrip.getUTCDate() !== parts.day
    || roundTrip.getUTCHours() !== parts.hour
    || roundTrip.getUTCMinutes() !== parts.minute
    || roundTrip.getUTCSeconds() !== parts.second
  ) throw new LocalDateTimeError('invalid_local_datetime');
  return parts;
}

function getFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    throw new LocalDateTimeError('invalid_timezone');
  }
}

function zonedParts(value, formatter) {
  const values = new Map(
    formatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get('year') || 0, month: values.get('month') || 0,
    day: values.get('day') || 0, hour: values.get('hour') || 0,
    minute: values.get('minute') || 0, second: values.get('second') || 0,
  };
}

function sameParts(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

export function resolveIanaLocalDateTime(localValue, timeZone) {
  const desired = parseLocal(localValue);
  const formatter = getFormatter(timeZone);
  const naiveUtc = Date.UTC(
    desired.year, desired.month - 1, desired.day,
    desired.hour, desired.minute, desired.second,
  );
  const offsets = new Set();
  for (const deltaHours of [-36, -12, 0, 12, 36]) {
    const sampleMs = naiveUtc + deltaHours * 60 * 60 * 1000;
    const local = zonedParts(new Date(sampleMs), formatter);
    offsets.add(Date.UTC(
      local.year, local.month - 1, local.day,
      local.hour, local.minute, local.second,
    ) - sampleMs);
  }
  const candidates = [...offsets]
    .map((offset) => naiveUtc - offset)
    .filter((candidate) => sameParts(zonedParts(new Date(candidate), formatter), desired))
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .sort((left, right) => left - right);
  if (candidates.length === 0) throw new LocalDateTimeError('nonexistent_local_time');
  const instant = candidates[candidates.length - 1];
  return { instantIso: new Date(instant).toISOString(), ambiguous: candidates.length > 1 };
}

export function formatInIanaTimezone(instantIso, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short',
  }).format(new Date(instantIso));
}
