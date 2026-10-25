import { COLORCET_RAMPS } from './colorcet-ramps.js';
import { cogClassRampColors } from './cog-classes.js';

export const COG_DEFAULT_RAMP = 'CET rainbow4';
export const COG_DEFAULT_QUANTILE_STOPS = 256;
const COG_RANGE_SAMPLE_SIZE = 256;

export const COG_RAMP_COLORS = Object.freeze({
  Spectrum: ['#5e4fa2', '#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#fee08b', '#fdae61', '#f46d43', '#d53e4f'],
  Viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
  Cividis: ['#00204c', '#414d6b', '#68777d', '#8c9986', '#b6b85c', '#fee838'],
  Plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
  Inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fbb61a', '#fcffa4'],
  Magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  Spectral: ['#d53e4f', '#fc8d59', '#fee08b', '#e6f598', '#99d594', '#3288bd'],
  ...COLORCET_RAMPS
});

function sampleCoordinates(bbox) {
  const [west, south, east, north] = bbox;
  return Array.from({ length: COG_RANGE_SAMPLE_SIZE ** 2 }, (_, index) => {
    const column = index % COG_RANGE_SAMPLE_SIZE;
    const row = Math.floor(index / COG_RANGE_SAMPLE_SIZE);
    return {
      longitude: west + (column + 0.5) * (east - west) / COG_RANGE_SAMPLE_SIZE,
      latitude: south + (row + 0.5) * (north - south) / COG_RANGE_SAMPLE_SIZE
    };
  });
}

export async function sampleCogValueRange(url, metadata, protocol, shouldContinue = () => true) {
  if (!Array.isArray(metadata.bbox) || metadata.bbox.length !== 4 || !metadata.bbox.every(Number.isFinite)) {
    throw new Error('The COG does not provide a geographic bounding box.');
  }
  if (!protocol || typeof protocol.locationValues !== 'function') {
    throw new Error('The COG sampling protocol is unavailable.');
  }
  const zooms = (metadata.images || []).filter(image => !image.isMask)
    .map(image => Math.round(image.zoom)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!zooms.length) throw new Error('The COG does not provide a readable raster overview.');

  const coordinates = sampleCoordinates(metadata.bbox);
  for (const zoom of zooms) {
    const values = [];
    for (let start = 0; start < coordinates.length; start += 32) {
      if (!shouldContinue()) return null;
      const batch = await Promise.all(coordinates.slice(start, start + 32).map(point =>
        protocol.locationValues(url, point, zoom)));
      if (!shouldContinue()) return null;
      values.push(...batch.flat().filter(Number.isFinite));
    }
    if (values.length) {
      const { min, max } = values.reduce((range, value) => ({
        min: Math.min(range.min, value),
        max: Math.max(range.max, value)
      }), { min: Infinity, max: -Infinity });
      if (min < max) return { min, max, values };
    }
  }
  throw new Error('Could not find a varying, valid raster value in the COG.');
}

export function cogQuantileBounds(values, stopCount = COG_DEFAULT_QUANTILE_STOPS) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) throw new Error('COG quantile styling requires finite raster values.');
  const bounds = [sorted[0]];
  for (let index = 1; index < stopCount; index++) {
    const sampleIndex = Math.ceil(index * sorted.length / stopCount);
    const lower = sorted[sampleIndex - 1];
    const upper = sorted[Math.min(sampleIndex, sorted.length - 1)];
    const boundary = lower + (upper - lower) / 2;
    if (boundary > bounds[bounds.length - 1] && boundary < sorted[sorted.length - 1]) {
      bounds.push(boundary);
    }
  }
  bounds.push(sorted[sorted.length - 1]);
  return bounds;
}

function quantileFraction(value, bounds) {
  let low = 0;
  let high = bounds.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (value < bounds[middle]) high = middle;
    else low = middle;
  }
  const lower = bounds[low], upper = bounds[low + 1];
  const withinClass = upper > lower ? (value - lower) / (upper - lower) : 0;
  return (low + Math.max(0, Math.min(1, withinClass))) / (bounds.length - 1);
}

function rampColorAt(colors, fraction) {
  const colorPosition = fraction * (colors.length - 1);
  const colorIndex = Math.min(Math.floor(colorPosition), colors.length - 2);
  const blend = colorPosition - colorIndex;
  const start = colors[colorIndex].slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
  const end = colors[colorIndex + 1].slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
  return `#${start.map((value, index) =>
    Math.round(value + (end[index] - value) * blend).toString(16).padStart(2, '0')).join('')}`;
}

export function cogQuantileRampColors(colors, bounds, stopCount = COG_DEFAULT_QUANTILE_STOPS) {
  return Array.from({ length: stopCount }, (_, index) => {
    const value = bounds[0] + (bounds[bounds.length - 1] - bounds[0]) * index / (stopCount - 1);
    return rampColorAt(colors, quantileFraction(value, bounds));
  });
}

export function cogQgisColorStops({
  colors,
  mode,
  classes = [],
  quantileBounds = [],
  minimum,
  maximum,
  stopCount = COG_DEFAULT_QUANTILE_STOPS,
  formatValue = value => Number(value.toPrecision(7)).toString()
}) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    throw new Error('A varying finite COG value range is required for the color style.');
  }
  if (mode === 'classes' && classes.length) {
    const classColors = cogClassRampColors(colors, classes);
    return {
      minimum,
      maximum,
      discrete: true,
      colorStops: classes.map((item, index) => ({
        value: item.max,
        color: classColors[index],
        label: item.label || (index === 0
          ? `≤ ${formatValue(item.max)}`
          : `> ${formatValue(classes[index - 1].max)} to ≤ ${formatValue(item.max)}`)
      })).concat(classes.at(-1).max < maximum
        ? [{ value: maximum, color: classColors.at(-1), label: `> ${formatValue(classes.at(-1).max)}` }]
        : [])
    };
  }

  const rampColors = mode === 'quantile' && quantileBounds.length > 1
    ? cogQuantileRampColors(colors, quantileBounds, stopCount)
    : colors;
  return {
    minimum,
    maximum,
    discrete: false,
    colorStops: rampColors.map((color, index) => ({
      value: minimum + (maximum - minimum) * index / (rampColors.length - 1),
      color,
      label: formatValue(minimum + (maximum - minimum) * index / (rampColors.length - 1))
    }))
  };
}
