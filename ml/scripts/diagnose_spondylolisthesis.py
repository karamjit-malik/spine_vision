"""Vertebral slip (spondylolisthesis) from centroid displacement.

For each adjacent pair, the horizontal offset between the two vertebral body
centroids is expressed as a percentage of the upper vertebra's width and graded
on the Meyerding bands.

Prefers the inner (vertebral body) contour set, matching how the measurement was
prototyped, and falls back to whatever --mask provides.
"""

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils import io_helpers as io  # noqa: E402

CONDITION = "spondylolisthesis"

# Meyerding grades by percentage slip, and the severity each maps to.
GRADES = [
    (5.0, "Normal", "normal"),
    (25.0, "G1", "mild"),
    (50.0, "G2", "moderate"),
    (75.0, "G3", "severe"),
    (None, "G4", "severe"),
]


def main():
    args = io.build_parser(__doc__).parse_args()
    mask_path = io.resolve_mask(args, prefer="inner")

    image = io.load_image(args.image)
    vertebrae = io.load_vertebrae(mask_path, image.shape)

    if len(vertebrae) < 2:
        io.fail(CONDITION, args,
                f"only {len(vertebrae)} vertebra(e) segmented, at least 2 adjacent "
                "bodies are needed to measure a slip")

    measured = []
    for vertebra in vertebrae:
        point = io.centroid(vertebra["points"])
        if point is None:
            continue
        measured.append({
            "label": vertebra["label"],
            "centroid": point,
            "width": io.polygon_width(vertebra["points"]),
            "truncated": vertebra["truncated"],
        })

    if len(measured) < 2:
        io.fail(CONDITION, args,
                "fewer than 2 vertebrae produced a usable centroid")

    overlay = image.copy()
    scale = io.scale_for(image)
    radius = max(int(round(7 * scale)), 3)
    line = max(int(round(2.5 * scale)), 2)

    for entry in measured:
        cx, cy = entry["centroid"]
        cv2.circle(overlay, (int(cx), int(cy)), radius, (255, 0, 0), -1)

    # --- measurement ------------------------------------------------------- #
    levels = []
    for upper, lower in zip(measured, measured[1:]):
        width = upper["width"]
        if width <= 0:
            continue

        # Positive = the upper body sits anterior to the one below it.
        slip_px = float(lower["centroid"][0] - upper["centroid"][0])
        slip_percent = slip_px / width * 100.0

        grade, severity = classify(abs(slip_percent))
        direction = (
            "anterolisthesis" if slip_percent > 0
            else "retrolisthesis" if slip_percent < 0
            else "none"
        )
        level = f"{upper['label']}-{lower['label']}"

        entry = {
            "level": level,
            "slipPercent": round(slip_percent, 1),
            "slipPixels": round(slip_px, 1),
            "referenceWidthPx": round(width, 1),
            "meyerdingGrade": grade,
            "direction": direction if grade != "Normal" else "none",
            "severity": severity,
        }
        # Only carried when true, so the column stays out of the report table
        # for the ordinary case where every level is measurable.
        if upper["truncated"] or lower["truncated"]:
            entry["unreliable"] = True
        levels.append(entry)

        draw_slip(overlay, upper, lower, f"{slip_percent:.1f}% {grade}", scale, line)

    if not levels:
        io.fail(CONDITION, args, "no adjacent pair had a measurable width")

    worst_level = max(levels, key=lambda entry: abs(entry["slipPercent"]))
    severity = io.worst([entry["severity"] for entry in levels])

    io.draw_title(
        overlay,
        f"Max slip: {abs(worst_level['slipPercent']):.1f}% "
        f"{worst_level['meyerdingGrade']} at {worst_level['level']}",
        scale,
    )
    io.save_overlay(overlay, args.output)

    # --- report ------------------------------------------------------------ #
    abnormal = [entry for entry in levels if entry["meyerdingGrade"] != "Normal"]
    clipped = [entry["level"] for entry in levels if entry.get("unreliable")]

    caveats = [
        "Slip is measured centroid-to-centroid, not from the posterior "
        "vertebral corners as in a manual Meyerding measurement, so the "
        "percentage is an approximation of the clinical grade.",
        "Normal lumbar lordosis shifts centroids horizontally on its own; "
        "part of any measured offset reflects the spinal curve rather than a "
        "true slip, and this is most pronounced at the lower levels.",
        "The slip is normalised by the upper vertebra's width; the Meyerding "
        "convention uses the inferior vertebra's endplate width.",
        "Direction assumes a lateral projection with the patient facing image "
        "left. If the radiograph is flipped, anterolisthesis and "
        "retrolisthesis are reversed.",
    ]
    if clipped:
        caveats.append(
            f"{', '.join(clipped)} involve a vertebra clipped by the edge of the "
            "image. A clipped outline shifts the centroid the slip is measured "
            "from, so those percentages are unreliable and may be spurious."
        )

    io.emit({
        "condition": CONDITION,
        "imagePath": args.output,
        "severity": severity,
        "confidence": round(confidence(measured), 3),
        "measurable": True,
        "metrics": {
            "measurement": "Horizontal centroid offset between adjacent vertebral "
                           "bodies, as a percentage of the upper body's width",
            "units": "percent of vertebral body width",
            "gradingScale": "Meyerding: <5% Normal, 5-25% G1, 25-50% G2, "
                            "50-75% G3, >75% G4",
            "levelsMeasured": len(levels),
            "worstLevel": worst_level["level"],
            "worstSlipPercent": worst_level["slipPercent"],
            "worstGrade": worst_level["meyerdingGrade"],
            "abnormalLevels": [entry["level"] for entry in abnormal],
            "unreliableLevels": clipped,
            "perLevel": levels,
        },
        "summary": summarize(levels, abnormal, worst_level),
        "caveats": caveats,
    })


def classify(slip_percent):
    for limit, grade, severity in GRADES[:-1]:
        if slip_percent < limit:
            return grade, severity
    return GRADES[-1][1], GRADES[-1][2]


def draw_slip(image, upper, lower, text, scale, line):
    """Horizontal offset arrow between two centroids, plus the connector."""
    x1, y1 = int(upper["centroid"][0]), int(upper["centroid"][1])
    x2, y2 = int(lower["centroid"][0]), int(lower["centroid"][1])
    mid_y = (y1 + y2) // 2

    cv2.line(image, (x1, y1), (x2, y2), (0, 0, 255), max(line - 1, 1), cv2.LINE_AA)
    if x1 != x2:
        cv2.arrowedLine(
            image, (x1, mid_y), (x2, mid_y), (0, 255, 255), line, cv2.LINE_AA,
            tipLength=0.3,
        )
    io.draw_label(image, text, (max(x1, x2) + int(20 * scale), mid_y), (0, 255, 0), scale)


def summarize(levels, abnormal, worst_level):
    if not abnormal:
        return (
            f"All {len(levels)} adjacent vertebral pairs measured under the 5% "
            f"threshold for a slip. The largest offset was "
            f"{abs(worst_level['slipPercent']):.1f}% of vertebral body width at "
            f"{worst_level['level']}, graded Normal on the Meyerding scale."
        )

    described = ", ".join(
        f"{entry['level']} {abs(entry['slipPercent']):.1f}% "
        f"({entry['meyerdingGrade']}, {entry['direction']})"
        for entry in abnormal
    )
    return (
        f"{len(abnormal)} of {len(levels)} adjacent pairs measured above the 5% "
        f"slip threshold: {described}. The largest is "
        f"{abs(worst_level['slipPercent']):.1f}% at {worst_level['level']}, "
        f"Meyerding {worst_level['meyerdingGrade']}."
    )


def confidence(measured):
    """Measurement quality, not model probability.

    Driven by how many levels were available and how consistent their widths
    are — a wildly varying width usually means a mis-segmented body, which
    directly distorts the percentage.
    """
    coverage = min(len(measured) / 5.0, 1.0)
    widths = np.array([entry["width"] for entry in measured], dtype=np.float64)
    spread = float(widths.std() / widths.mean()) if widths.mean() > 0 else 1.0
    consistency = max(0.0, 1.0 - min(spread / 0.3, 1.0))
    return 0.45 + 0.3 * coverage + 0.25 * consistency


if __name__ == "__main__":
    main()
