/**
 * Normalise a segmentation mask for rendering, whichever shape it arrived in.
 *
 * The mirror of `load_vertebrae` in ml/utils/io_helpers.py, and it accepts the
 * same two formats:
 *
 *   COCO           {"annotations": [{"segmentation": [[x, y, x, y, ...]]}]}
 *   Spine Vision   {"vertebrae": [{"label": "L1", "polygon": [[x, y], ...]}]}
 *
 * Coordinates come back normalised to 0–1 so the canvas can scale them to
 * whatever size the image is displayed at. Source pixel dimensions are taken
 * from the mask when it records them, and otherwise from the rendered image.
 *
 * @param {object} maskJson
 * @param {{ width: number, height: number }} [fallbackSize] natural image size
 * @returns {Array<{ label: string, polygon: Array<[number, number]> }>}
 */
export function parseMaskVertebrae(maskJson, fallbackSize) {
  if (!maskJson) return [];

  const source = sourceSize(maskJson, fallbackSize);
  const raw = extractPolygons(maskJson);

  const vertebrae = raw
    .map(({ label, points }) => ({ label, polygon: toPairs(points) }))
    .filter((entry) => entry.polygon.length >= 3)
    .map((entry) => ({ ...entry, polygon: normalise(entry.polygon, source) }));

  // Superior to inferior, so unlabelled masks can be named by position.
  vertebrae.sort((a, b) => meanY(a.polygon) - meanY(b.polygon));

  const levels = ["L1", "L2", "L3", "L4", "L5"];
  return vertebrae.map((entry, index) => ({
    ...entry,
    label:
      entry.label ||
      (vertebrae.length === levels.length ? levels[index] : `V${index + 1}`),
  }));
}

function extractPolygons(maskJson) {
  if (maskJson.annotations?.length) {
    const categories = Object.fromEntries(
      (maskJson.categories ?? []).map((category) => [category.id, category.name ?? ""])
    );
    return maskJson.annotations
      .filter((annotation) => annotation?.segmentation?.[0]?.length >= 6)
      .map((annotation) => ({
        label: cleanLabel(annotation.label || categories[annotation.category_id]),
        points: annotation.segmentation[0],
      }));
  }

  if (maskJson.vertebrae?.length) {
    return maskJson.vertebrae.map((vertebra) => ({
      label: cleanLabel(vertebra.label),
      points: vertebra.polygon ?? [],
    }));
  }

  return [];
}

/** A category named "vertebra" is not a level; "l3" is, but wants upper case. */
function cleanLabel(label) {
  const value = String(label ?? "").trim();
  if (!value || ["vertebra", "vertebrae", "spine"].includes(value.toLowerCase())) {
    return "";
  }
  return /^[lts]\d+$/i.test(value) ? value.toUpperCase() : value;
}

/** Accepts both [[x, y], ...] and the COCO flat [x, y, x, y, ...]. */
function toPairs(points) {
  if (!Array.isArray(points) || !points.length) return [];
  if (Array.isArray(points[0])) return points.filter((p) => p?.length >= 2);

  const pairs = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push([points[i], points[i + 1]]);
  return pairs;
}

function sourceSize(maskJson, fallbackSize) {
  const image = maskJson.images?.[0];
  const width = maskJson.imageWidth ?? image?.width ?? fallbackSize?.width ?? 0;
  const height = maskJson.imageHeight ?? image?.height ?? fallbackSize?.height ?? 0;
  return { width, height };
}

function normalise(polygon, source) {
  // Already 0–1: every coordinate inside the unit square.
  const isNormalised = polygon.every(([x, y]) => x <= 1 && y <= 1);
  if (isNormalised || !source.width || !source.height) return polygon;
  return polygon.map(([x, y]) => [x / source.width, y / source.height]);
}

const meanY = (polygon) =>
  polygon.reduce((total, [, y]) => total + y, 0) / polygon.length;
