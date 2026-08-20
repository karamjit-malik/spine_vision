"""Shared I/O for the diagnostic scripts.

Every diagnostic script takes the same CLI shape (--image, --mask, --output),
loads vertebra polygons through :func:`load_vertebrae`, draws its overlay, and
reports through :func:`emit`. Keeping that here means adding a fourth or fifth
condition is a new file in ``scripts/`` and one line in ``diagnosisBridge.js``.
"""

import argparse
import json
import re
import sys

import cv2
import numpy as np

# Lumbar levels, superior to inferior. Used when the mask carries no labels.
LUMBAR_LEVELS = ["L1", "L2", "L3", "L4", "L5"]

SEVERITIES = ["normal", "mild", "moderate", "severe"]


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_parser(description):
    """Argument parser shared by every diagnostic script.

    ``--mask`` is the mask the pipeline produces. ``--mask-inner`` and
    ``--mask-outer`` let a script be pointed at a specific contour set when both
    were annotated separately (the vertebral body outline vs. the full vertebra
    including posterior elements); each script picks the one its measurement
    assumes and falls back to ``--mask``.
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--image", required=True, help="Path to the source X-ray")
    parser.add_argument("--mask", required=True, help="Path to the segmentation mask JSON")
    parser.add_argument("--mask-inner", help="Optional inner/vertebral-body mask override")
    parser.add_argument("--mask-outer", help="Optional outer/full-vertebra mask override")
    parser.add_argument("--output", required=True, help="Path to write the overlay PNG")
    return parser


def resolve_mask(args, prefer):
    """Pick the mask this script's measurement assumes, falling back to --mask.

    :param prefer: ``"inner"`` or ``"outer"``.
    """
    override = args.mask_inner if prefer == "inner" else args.mask_outer
    return override or args.mask


def log(message):
    """Diagnostics go to stderr — stdout carries the JSON result only."""
    print(message, file=sys.stderr)


def emit(payload):
    """Print the single stdout JSON line that ``diagnosisBridge.js`` parses."""
    print(json.dumps(payload))


def fail(condition, args, message):
    """Report a measurement that could not be made, without crashing the scan.

    An overlay is still written — a captioned copy of the X-ray. The bridge drops
    any finding whose image is missing, so without this the condition would
    disappear from the report altogether rather than saying it could not be read.
    """
    label = condition.replace("_", " ").capitalize()
    try:
        image = load_image(args.image)
        draw_title(image, f"{label}: not measurable", scale_for(image))
        save_overlay(image, args.output)
    except Exception as error:  # noqa: BLE001 - the reason below matters more
        log(f"[{condition}] could not write placeholder overlay: {error}")

    emit({
        "condition": condition,
        "imagePath": args.output,
        "severity": "normal",
        "confidence": 0.0,
        "measurable": False,
        "metrics": {"measurement": f"{label} — not measurable", "reason": message},
        "summary": f"{label} could not be measured: {message}",
        "caveats": [
            f"This condition was not assessed: {message}",
            "A severity of 'normal' here means no measurement was made — it does "
            "not mean the condition was ruled out.",
        ],
    })
    sys.exit(0)


# --------------------------------------------------------------------------- #
# Mask loading
# --------------------------------------------------------------------------- #

def load_vertebrae(mask_path, image_shape):
    """Load vertebra polygons from a mask JSON, ordered superior to inferior.

    Two shapes are accepted so the scripts work against hand-annotated masks and
    against the segmentation model's own output:

    * **COCO** — ``{"annotations": [{"segmentation": [[x, y, x, y, ...]]}]}``
    * **Spine Vision** — ``{"vertebrae": [{"label": "L1", "polygon": [[x, y], ...]}]}``,
      where coordinates may be normalised to 0–1.

    :returns: list of ``{"label": str, "points": (N, 2) float32 ndarray}``.
    """
    with open(mask_path, "r") as handle:
        data = json.load(handle)

    height, width = image_shape[:2]
    raw = _extract_polygons(data)

    vertebrae = []
    for label, points in raw:
        points = np.asarray(points, dtype=np.float32).reshape(-1, 2)
        if len(points) < 3:
            continue
        # Normalised coordinates (every value within 0–1) are scaled to pixels.
        if points.max() <= 1.0:
            points = points * np.array([width, height], dtype=np.float32)
        vertebrae.append({
            "label": label,
            "points": points,
            "truncated": _touches_border(points, width, height),
        })

    # Superior to inferior, by polygon centre.
    vertebrae.sort(key=lambda v: float(v["points"][:, 1].mean()))

    unlabelled = sum(1 for v in vertebrae if not v["label"])
    if unlabelled:
        for index, vertebra in enumerate(vertebrae):
            if vertebra["label"]:
                continue
            vertebra["label"] = (
                LUMBAR_LEVELS[index]
                if len(vertebrae) == len(LUMBAR_LEVELS)
                else f"V{index + 1}"
            )

    return vertebrae


def _touches_border(points, width, height, margin=2.0):
    """Whether a polygon runs into the edge of the frame.

    A vertebra only partly inside the radiograph has a clipped outline, so any
    height, width or centroid taken from it describes the crop rather than the
    bone. Scripts decide for themselves whether that is fatal to their
    measurement, but none of them should trust it silently.
    """
    return bool(
        points[:, 0].min() <= margin
        or points[:, 1].min() <= margin
        or points[:, 0].max() >= width - margin
        or points[:, 1].max() >= height - margin
    )


def _extract_polygons(data):
    """Yield ``(label, flat_or_paired_coords)`` pairs from either mask shape."""
    if isinstance(data, dict) and data.get("annotations"):
        categories = {
            category["id"]: category.get("name", "")
            for category in data.get("categories", [])
        }
        pairs = []
        for annotation in data["annotations"]:
            segmentation = annotation.get("segmentation") or []
            if not segmentation:
                continue
            label = annotation.get("label") or categories.get(annotation.get("category_id"), "")
            # A COCO category is often just "vertebra" — not a usable level name.
            if label.lower() in {"vertebra", "vertebrae", "spine", ""}:
                label = ""
            # Category names are often lowercase ("l1"); report anatomic levels
            # in their conventional form.
            elif re.fullmatch(r"[lts]\d+", label.lower()):
                label = label.upper()
            pairs.append((label, segmentation[0]))
        return pairs

    if isinstance(data, dict) and data.get("vertebrae"):
        return [(v.get("label", ""), v.get("polygon", [])) for v in data["vertebrae"]]

    return []


# --------------------------------------------------------------------------- #
# Geometry
# --------------------------------------------------------------------------- #

def centroid(points):
    """Area centroid of a polygon, or ``None`` for a degenerate one."""
    moments = cv2.moments(points.astype(np.float32))
    if moments["m00"] == 0:
        return None
    return np.array(
        [moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]],
        dtype=np.float32,
    )


def polygon_width(points):
    """Horizontal extent of a polygon in pixels."""
    return float(points[:, 0].max() - points[:, 0].min())


def grade(value, thresholds):
    """Map a measurement to a severity using ``[(limit, severity), ...]``.

    The first entry whose ``limit`` the value falls under wins; the final entry's
    severity is the fallback. Thresholds live in the calling script so each
    condition's cut-offs are readable in one place next to its measurement.
    """
    for limit, severity in thresholds[:-1]:
        if value < limit:
            return severity
    return thresholds[-1][1]


def worst(severities):
    """The most severe entry in a list — a scan is graded by its worst level."""
    if not severities:
        return "normal"
    return max(severities, key=SEVERITIES.index)


# --------------------------------------------------------------------------- #
# Drawing
# --------------------------------------------------------------------------- #

def load_image(image_path):
    """Read an X-ray as RGB. Overlays are drawn in RGB and saved as BGR."""
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def scale_for(image):
    """Line/marker/text scale so overlays read the same on any image size."""
    reference = max(image.shape[:2]) / 1000.0
    return max(reference, 0.45)


def draw_title(image, text, scale):
    """Caption strip along the top of the overlay."""
    font_scale = 0.9 * scale
    thickness = max(int(round(2 * scale)), 1)
    (text_width, text_height), _ = cv2.getTextSize(
        text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
    )
    pad = int(round(12 * scale))
    cv2.rectangle(
        image,
        (0, 0),
        (min(text_width + 2 * pad, image.shape[1]), text_height + 2 * pad),
        (0, 0, 0),
        -1,
    )
    cv2.putText(
        image,
        text,
        (pad, text_height + pad),
        cv2.FONT_HERSHEY_SIMPLEX,
        font_scale,
        (255, 255, 0),
        thickness,
        cv2.LINE_AA,
    )


def draw_label(image, text, position, color, scale):
    """Measurement label with a dark plate behind it, so it stays legible."""
    font_scale = 0.6 * scale
    thickness = max(int(round(1.4 * scale)), 1)
    (text_width, text_height), _ = cv2.getTextSize(
        text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
    )
    x, y = int(position[0]), int(position[1])
    # Keep the plate inside the frame.
    x = min(max(x, 2), max(image.shape[1] - text_width - 6, 2))
    y = min(max(y, text_height + 4), image.shape[0] - 4)
    cv2.rectangle(
        image,
        (x - 3, y - text_height - 4),
        (x + text_width + 3, y + 4),
        (0, 0, 0),
        -1,
    )
    cv2.putText(
        image,
        text,
        (x, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        font_scale,
        color,
        thickness,
        cv2.LINE_AA,
    )


def save_overlay(image_rgb, output_path):
    """Write the RGB overlay to disk as a PNG."""
    if not cv2.imwrite(output_path, cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)):
        raise IOError(f"Could not write overlay: {output_path}")
