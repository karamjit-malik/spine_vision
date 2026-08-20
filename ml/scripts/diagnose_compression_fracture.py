"""Vertebral compression fracture from anterior/posterior height ratio.

For each vertebral body the anterior and posterior edge heights are measured
from the true corner points of the polygon, and their ratio is graded. A wedged
body — anterior height markedly shorter than posterior — is the classic sign of
an anterior compression fracture.

Prefers the inner (vertebral body) contour set, matching how the measurement was
prototyped, and falls back to whatever --mask provides.
"""

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils import io_helpers as io  # noqa: E402

CONDITION = "compression_fracture"

# Anterior/posterior height ratio bands. The status strings are the prototype's
# three labels; "Fracture" is split at Genant's 40% height-loss cut-off so the
# dashboard badge can distinguish a moderate wedge from a severe collapse.
BANDS = [
    (0.90, "Normal", "normal", (0, 255, 0)),
    (0.80, "Mild", "mild", (255, 255, 0)),
    (0.60, "Fracture", "moderate", (255, 140, 0)),
    (None, "Fracture", "severe", (255, 0, 0)),
]


def main():
    args = io.build_parser(__doc__).parse_args()
    mask_path = io.resolve_mask(args, prefer="inner")

    image = io.load_image(args.image)
    vertebrae = io.load_vertebrae(mask_path, image.shape)

    if not vertebrae:
        io.fail(CONDITION, args, "no vertebrae found in the segmentation mask")

    overlay = image.copy()
    scale = io.scale_for(image)
    radius = max(int(round(6 * scale)), 3)
    line = max(int(round(2.5 * scale)), 2)

    levels, unmeasurable = [], []
    # Raw ratios kept alongside the rounded ones that go into metrics: the
    # caption and the per-vertebra labels must round the same value once, or a
    # ratio like 0.9452 reads as 0.95 on the body and 0.94 in the caption.
    raw_ratios = {}

    for vertebra in vertebrae:
        points = vertebra["points"]
        label = vertebra["label"]

        centre = io.centroid(points)
        if centre is None:
            unmeasurable.append(label)
            continue

        # A body clipped by the edge of the frame has no complete anterior or
        # posterior border to measure, so its ratio describes the crop.
        if vertebra["truncated"]:
            unmeasurable.append(label)
            io.draw_label(overlay, f"{label} clipped", centre + np.array([15, 0]),
                          (180, 180, 180), scale)
            continue

        edges = corner_heights(points)
        if edges is None:
            # The corner picks collapsed onto one side — the polygon is too
            # sparse or too irregular to give a real anterior/posterior pair.
            # Reported as unmeasurable rather than graded, since a zero-height
            # posterior edge would otherwise read as a total collapse.
            unmeasurable.append(label)
            io.draw_label(overlay, f"{label} n/a", centre + np.array([15, 0]),
                          (180, 180, 180), scale)
            continue

        ant_height, post_height, left_top, left_bottom, right_top, right_bottom = edges
        ratio = ant_height / post_height

        if not PLAUSIBLE_RATIO[0] <= ratio <= PLAUSIBLE_RATIO[1]:
            # Outside anatomic range: the outline is wrong, not the vertebra.
            unmeasurable.append(label)
            io.draw_label(overlay, f"{label} n/a", centre + np.array([15, 0]),
                          (180, 180, 180), scale)
            continue

        status, severity, color = classify(ratio)
        height_loss = max(0.0, (1.0 - ratio) * 100.0)

        raw_ratios[label] = ratio
        levels.append({
            "level": label,
            "heightRatio": round(float(ratio), 3),
            "anteriorHeightPx": round(float(ant_height), 1),
            "posteriorHeightPx": round(float(post_height), 1),
            "anteriorHeightLossPercent": round(float(height_loss), 1),
            "status": status,
            "severity": severity,
        })

        cv2.line(overlay, tuple(left_top.astype(int)), tuple(left_bottom.astype(int)),
                 (0, 255, 255), line, cv2.LINE_AA)   # anterior edge
        cv2.line(overlay, tuple(right_top.astype(int)), tuple(right_bottom.astype(int)),
                 (255, 0, 255), line, cv2.LINE_AA)   # posterior edge
        cv2.circle(overlay, (int(centre[0]), int(centre[1])), radius, color, -1)
        io.draw_label(overlay, f"{label} {ratio:.2f} ({status})",
                      centre + np.array([radius + 10, 0]), color, scale)

    if not levels:
        io.fail(CONDITION, args,
                "no vertebra produced a usable anterior/posterior edge pair")

    worst_level = min(levels, key=lambda entry: entry["heightRatio"])
    severity = io.worst([entry["severity"] for entry in levels])

    io.draw_title(
        overlay,
        f"Min A/P ratio: {raw_ratios[worst_level['level']]:.2f} at {worst_level['level']} "
        f"({worst_level['status']})",
        scale,
    )
    io.save_overlay(overlay, args.output)

    # --- report ------------------------------------------------------------ #
    abnormal = [entry for entry in levels if entry["status"] != "Normal"]
    caveats = [
        "Heights are measured between the corner points of the segmented "
        "polygon, so an imprecise segmentation shifts the ratio directly.",
        "The anterior edge is taken as the left side of the image. This assumes "
        "a lateral projection with the patient facing image left; a flipped or "
        "AP radiograph would invert the anterior/posterior assignment and make "
        "the ratio meaningless.",
        "A wedged vertebra is not specific to acute fracture — it also occurs "
        "with old healed fractures, congenital variants and osteoporotic "
        "remodelling, none of which this measurement can distinguish.",
        "Ratios are computed in image pixels with no DICOM spacing applied.",
    ]
    if unmeasurable:
        caveats.append(
            f"{len(unmeasurable)} vertebra(e) ({', '.join(unmeasurable)}) could not "
            "be measured — clipped by the edge of the image, or the outline gave an "
            "anatomically impossible ratio — and are excluded. They have NOT been "
            "assessed for fracture."
        )

    io.emit({
        "condition": CONDITION,
        "imagePath": args.output,
        "severity": severity,
        "confidence": round(confidence(vertebrae, levels), 3),
        "measurable": True,
        "metrics": {
            "measurement": "Anterior/posterior vertebral body height ratio, from "
                           "the polygon's corner points",
            "units": "ratio (anterior height / posterior height)",
            "gradingScale": ">0.90 Normal, 0.80-0.90 Mild, 0.60-0.80 Fracture "
                            "(moderate wedging), <0.60 Fracture (severe wedging)",
            "levelsMeasured": len(levels),
            "levelsUnmeasurable": unmeasurable,
            "worstLevel": worst_level["level"],
            "worstHeightRatio": worst_level["heightRatio"],
            "worstHeightLossPercent": worst_level["anteriorHeightLossPercent"],
            "abnormalLevels": [entry["level"] for entry in abnormal],
            "perLevel": levels,
        },
        "summary": summarize(levels, abnormal, worst_level),
        "caveats": caveats,
    })


# Fraction of the body's width treated as the anterior and posterior edge bands.
EDGE_BAND = 0.25

# A real vertebral body stays within these ratios even when badly wedged.
# Anything outside means the outline is not describing a whole vertebra.
PLAUSIBLE_RATIO = (0.40, 1.40)


def corner_heights(points):
    """Anterior and posterior edge heights from the polygon's corner points.

    Vertebrae are tilted by the lordotic curve, so the anterior and posterior
    borders are not vertical in image space. The polygon is first rotated into
    its own frame — the axis of its minimum-area rectangle, i.e. the endplate
    direction — and the leftmost and rightmost bands are taken there. Each
    band's topmost and bottommost points are that border's corners.

    Two simpler rules both fail on real traced contours:

    * The two globally highest and two globally lowest points (correct only for
      a 4-corner polygon) land next to each other on the same corner, so both
      borders collapse onto the same diagonal and every ratio reads near 1.00.
    * A band taken on unrotated x loses the lower corner of a steeply tilted
      body, which shortens one border and inflates the ratio.

    Distances are Euclidean on the original points, so the rotation only decides
    which corners are picked. Returns ``None`` if a band is too sparse.
    """
    centre = points.mean(axis=0)
    angle = np.radians(_endplate_angle(points))
    cos, sin = np.cos(-angle), np.sin(-angle)
    centred = points - centre
    # x along the endplate (anterior-posterior), y along the body's height.
    local_x = centred[:, 0] * cos - centred[:, 1] * sin
    local_y = centred[:, 0] * sin + centred[:, 1] * cos

    x_min, x_max = local_x.min(), local_x.max()
    width = x_max - x_min
    if width <= 0:
        return None

    band = width * EDGE_BAND
    anterior = np.flatnonzero(local_x <= x_min + band)
    posterior = np.flatnonzero(local_x >= x_max - band)
    if len(anterior) < 2 or len(posterior) < 2:
        return None

    left_top = points[anterior[np.argmin(local_y[anterior])]]
    left_bottom = points[anterior[np.argmax(local_y[anterior])]]
    right_top = points[posterior[np.argmin(local_y[posterior])]]
    right_bottom = points[posterior[np.argmax(local_y[posterior])]]

    ant_height = float(np.linalg.norm(left_top - left_bottom))
    post_height = float(np.linalg.norm(right_top - right_bottom))
    if ant_height == 0 or post_height == 0:
        return None

    return ant_height, post_height, left_top, left_bottom, right_top, right_bottom


def _endplate_angle(points):
    """Tilt of the vertebral body, in degrees, from its minimum-area rectangle.

    Normalised to (-45, 45]: of the rectangle's two edge directions this picks
    the one nearer horizontal, which on a lateral view is the endplate.
    """
    angle = cv2.minAreaRect(points.astype(np.float32))[2]
    angle = (angle + 45.0) % 90.0 - 45.0
    return angle


def classify(ratio):
    for limit, status, severity, color in BANDS[:-1]:
        if ratio > limit:
            return status, severity, color
    _, status, severity, color = BANDS[-1]
    return status, severity, color


def summarize(levels, abnormal, worst_level):
    if not abnormal:
        return (
            f"All {len(levels)} measured vertebral bodies had an anterior/posterior "
            f"height ratio above 0.90. The lowest was "
            f"{worst_level['heightRatio']:.2f} at {worst_level['level']}, within the "
            "normal band, with no wedging detected."
        )

    described = ", ".join(
        f"{entry['level']} ratio {entry['heightRatio']:.2f} "
        f"({entry['anteriorHeightLossPercent']:.0f}% anterior height loss, "
        f"{entry['status']})"
        for entry in abnormal
    )
    return (
        f"{len(abnormal)} of {len(levels)} measured vertebral bodies fell below the "
        f"0.90 height-ratio threshold: {described}. The most wedged is "
        f"{worst_level['level']} at a ratio of {worst_level['heightRatio']:.2f}, "
        f"i.e. {worst_level['anteriorHeightLossPercent']:.0f}% less anterior height "
        "than posterior."
    )


def confidence(vertebrae, levels):
    """Measurement quality, not model probability.

    Corner picking needs a reasonably dense polygon, and the score drops when
    vertebrae had to be skipped.
    """
    coverage = len(levels) / max(len(vertebrae), 1)
    density = np.mean([min(len(v["points"]) / 8.0, 1.0) for v in vertebrae])
    return 0.4 + 0.35 * coverage + 0.25 * float(density)


if __name__ == "__main__":
    main()
