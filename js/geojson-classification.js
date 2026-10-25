function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function geojsonFieldStats(features) {
  const fields = new Map();
  (features || []).forEach(feature => {
    const properties = feature?.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return;
    Object.entries(properties).forEach(([name, value]) => {
      if (value === null || value === undefined || value === '') return;
      const field = fields.get(name) || { values: [], unique: new Map(), numeric: true };
      field.values.push(value);
      const key = `${typeof value}:${String(value)}`;
      if (!field.unique.has(key)) field.unique.set(key, value);
      if (numericValue(value) === null) field.numeric = false;
      fields.set(name, field);
    });
  });
  return [...fields].map(([name, field]) => {
    const uniqueValues = [...field.unique.values()];
    const numericValues = field.numeric ? field.values.map(numericValue) : [];
    if (field.numeric) uniqueValues.sort((a, b) => numericValue(a) - numericValue(b));
    else uniqueValues.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const min = numericValues.reduce((value, number) => Math.min(value, number), Infinity);
    const max = numericValues.reduce((value, number) => Math.max(value, number), -Infinity);
    return {
      name,
      numeric: field.numeric,
      values: numericValues,
      uniqueValues,
      min: numericValues.length ? min : null,
      max: numericValues.length ? max : null
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function sortedFiniteValues(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) throw new Error('This field has no numeric values to classify.');
  return sorted;
}

const TELLUS_PERCENTILE_RANKS = [1, 2, 5, 10, 15, 20, 25, 40, 50, 60, 75, 85, 90, 95, 98, 99, 100];

function percentileOrdinal(percentile) {
  const remainder = percentile % 100;
  const suffix = remainder >= 11 && remainder <= 13
    ? 'th'
    : percentile % 10 === 1 ? 'st' : percentile % 10 === 2 ? 'nd' : percentile % 10 === 3 ? 'rd' : 'th';
  return `${percentile}${suffix}`;
}

export function tellusPercentileClassification(values) {
  const sorted = sortedFiniteValues(values);
  const min = sorted[0], max = sorted[sorted.length - 1];
  const boundaries = [];
  TELLUS_PERCENTILE_RANKS.slice(0, -1).forEach(percentile => {
    const position = (sorted.length - 1) * percentile / 100;
    const lower = Math.floor(position);
    const fraction = position - lower;
    const value = sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
    if (value <= min || value >= max) return;
    const previous = boundaries[boundaries.length - 1];
    if (previous?.value === value) previous.percentile = percentile;
    else boundaries.push({ value, percentile });
  });

  const labels = boundaries.length
    ? [
      ...boundaries.map(boundary => `${boundary.value.toFixed(2)} (${percentileOrdinal(boundary.percentile)})`),
      `${max.toFixed(2)} (${percentileOrdinal(100)})`
    ]
    : ['All values'];
  return { breaks: boundaries.map(boundary => boundary.value), labels };
}

export function quantileBreaks(values, classCount) {
  const sorted = sortedFiniteValues(values);
  const breaks = [];
  for (let index = 1; index < classCount; index++) {
    const position = (sorted.length - 1) * index / classCount;
    const lower = Math.floor(position);
    const fraction = position - lower;
    const value = sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
    if (value > sorted[0] && value < sorted[sorted.length - 1] &&
        (breaks.length === 0 || value > breaks[breaks.length - 1])) breaks.push(value);
  }
  return breaks;
}

export function equalIntervalBreaks(values, classCount) {
  const sorted = sortedFiniteValues(values);
  const min = sorted[0], max = sorted[sorted.length - 1];
  if (min === max) return [];
  return Array.from({ length: classCount - 1 }, (_, index) => min + (max - min) * (index + 1) / classCount);
}

export function parseManualBreaks(value, min, max) {
  const breaks = String(value).split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!breaks.length || breaks.some(number => !Number.isFinite(number))) {
    throw new Error('Enter one or more finite numeric break values.');
  }
  if (breaks.some((number, index) =>
    number <= min || number >= max || (index > 0 && number <= breaks[index - 1]))) {
    throw new Error('Breaks must be strictly increasing and inside the field’s data range.');
  }
  return breaks;
}

export function stepColorExpression(field, breaks, colors) {
  if (!colors.length || colors.length !== breaks.length + 1) {
    throw new Error('Each numeric range needs a color.');
  }
  const expression = ['step', ['to-number', ['get', field], 0], colors[0]];
  breaks.forEach((value, index) => expression.push(value, colors[index + 1]));
  return expression;
}

export function matchColorExpression(field, values, colors, fallbackColor = '#808080') {
  if (!values.length || values.length !== colors.length) {
    throw new Error('Each discrete value needs a color.');
  }
  const expression = ['match', ['get', field]];
  values.forEach((value, index) => expression.push(value, colors[index]));
  expression.push(fallbackColor);
  return expression;
}
