"""Lumbar lordosis / sagittal alignment from vertebral centroids.

A quadratic is fitted to the vertebral body centroids as x = f(y). The tangent
directions at the topmost and bottommost centroid are differenced, which gives a
Cobb-like curvature index for the segmented span.

Prefers the outer (full-vertebra) contour set, matching how the measurement was
prototyped, and falls back to whatever --mask provides.
"""

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils import io_helpers as io  # noqa: E402

CONDITION = "lordosis"

# Adult lumbar lordosis sits around 40–60 deg. Bands are symmetric about that
# range: distance from normal drives severity in either direction.
THRESHOLDS = [
    (5.0, "severe"),      # <5   — flat back / loss of lordosis
    (20.0, "moderate"),   # 5–20  — marked hypolordosis
    (35.0, "mild"),       # 20–35 — reduced
    (65.0, "normal"),     # 35–65 — within the usual adult range
    (80.0, "mild"),       # 65–80 — increased
    (95.0, "moderate"),   # 80–95 — marked hyperlordosis
    (None, "severe"),     # >95
]

TANGENT_LENGTH = 200  # px, half-length of each drawn tangent


def main():
    args = io.build_parser(__doc__).parse_args()
    mask_path = io.resolve_mask(args, prefer="outer")

    image = io.load_image(args.image)
    vertebrae = io.load_vertebrae(mask_path, image.shape)

    # polyfit(deg=2) needs three points; a curvature index needs more than that
    # to mean anything.
    if len(vertebrae) < 3:
        io.fail(CONDITION, args,
                f"only {len(vertebrae)} vertebra(e) segmented, at least 3 are needed "
                "to fit a spinal curve")

    centroids, labels, clipped = [], [], []
    for vertebra in vertebrae:
        point = io.centroid(vertebra["points"])
        if point is None:
            continue
        centroids.append(point)
        labels.append(vertebra["label"])
        if vertebra["truncated"]:
            clipped.append(vertebra["label"])

    if len(centroids) < 3:
        io.fail(CONDITION, args,
                "fewer than 3 vertebrae produced a usable centroid")

    centroids = np.array(centroids, dtype=np.float32)

    # --- measurement ------------------------------------------------------- #
    x = centroids[:, 0]
    y = centroids[:, 1]

    coeffs = np.polyfit(y, x, deg=2)
    curve = np.poly1d(coeffs)
    derivative = np.polyder(curve)

    y_top, y_bottom = y[0], y[-1]
    slope_top = float(derivative(y_top))
    slope_bottom = float(derivative(y_bottom))

    angle_top = np.arctan(slope_top)
    angle_bottom = np.arctan(slope_bottom)
    lordosis_angle = float(np.degrees(abs(angle_bottom - angle_top)))

    severity = io.grade(lordosis_angle, THRESHOLDS)

    # Residual of the fit, as a fraction of the curve's horizontal span: how
    # well a quadratic actually describes these centroids.
    residual = float(np.sqrt(np.mean((curve(y) - x) ** 2)))
    span = max(float(x.max() - x.min()), 1.0)
    fit_error = residual / span

    # --- overlay ----------------------------------------------------------- #
    overlay = image.copy()
    scale = io.scale_for(image)
    radius = max(int(round(9 * scale)), 3)
    line = max(int(round(2.5 * scale)), 2)

    for (cx, cy), label in zip(centroids, labels):
        cv2.circle(overlay, (int(cx), int(cy)), radius, (255, 0, 0), -1)
        io.draw_label(overlay, label, (cx + radius + 6, cy), (255, 120, 120), scale)

    y_samples = np.linspace(y.min(), y.max(), 300)
    curve_points = np.array(
        [[int(curve(value)), int(value)] for value in y_samples], dtype=np.int32
    )
    cv2.polylines(overlay, [curve_points], False, (0, 0, 255), line, cv2.LINE_AA)

    draw_tangent(overlay, curve, y_top, slope_top, (0, 255, 0), line + 1, scale)
    draw_tangent(overlay, curve, y_bottom, slope_bottom, (255, 0, 255), line + 1, scale)

    io.draw_title(overlay, f"Lordosis: {lordosis_angle:.2f} deg ({severity})", scale)
    io.save_overlay(overlay, args.output)

    # --- report ------------------------------------------------------------ #
    io.emit({
        "condition": CONDITION,
        "imagePath": args.output,
        "severity": severity,
        "confidence": round(confidence(len(centroids), fit_error), 3),
        "measurable": True,
        "metrics": {
            "measurement": "Sagittal curvature index (tangent difference of a "
                           "quadratic fitted to vertebral centroids)",
            "units": "degrees",
            "lordosisAngleDeg": round(lordosis_angle, 2),
            "referenceRangeDeg": "35-65",
            "scope": "Whole-segment measurement — a single angle for the "
                     "segmented span. There is no per-vertebra lordosis value.",
            "vertebraeMeasured": len(centroids),
            "levelsIncludedInFit": labels,
            "segment": f"{labels[0]}-{labels[-1]}",
            "superiorTangentSlope": round(slope_top, 4),
            "inferiorTangentSlope": round(slope_bottom, 4),
            "curveFitErrorRatio": round(fit_error, 4),
            "unreliableLevels": clipped,
            "gradingScale": describe_thresholds(),
        },
        "summary": (
            f"A quadratic fitted to the {len(centroids)} vertebral centroids "
            f"({labels[0]}-{labels[-1]}) gives a single sagittal curvature index of "
            f"{lordosis_angle:.1f} degrees between the tangents at the superior and "
            f"inferior ends, against a typical adult lumbar range of 35-65 degrees. "
            f"This falls in the {severity} band."
        ),
        "caveats": ([
            f"{', '.join(clipped)} {'is' if len(clipped) == 1 else 'are'} clipped by "
            "the edge of the image; a clipped outline shifts the centroid the curve "
            "is fitted through, so the angle is less reliable than it looks."
        ] if clipped else []) + [
            "This is one angle for the whole segmented span, measured between the "
            "tangents at its top and bottom ends. It cannot be broken down per "
            "vertebra, and no single vertebra has its own lordosis value.",
            "The angle is measured between tangents to a curve fitted through "
            "vertebral centroids, not between vertebral endplates as in a manual "
            "Cobb measurement, so it will not match a radiologist's number exactly.",
            "The measurement covers only the segmented span "
            f"({labels[0]}-{labels[-1]}); it is not a whole-spine sagittal balance "
            "assessment and says nothing about pelvic incidence or sacral slope.",
            "Values are in image pixels with no DICOM spacing, so patient "
            "positioning and radiographic magnification are uncorrected.",
        ],
    })


def draw_tangent(image, curve, y_point, slope, color, thickness, scale):
    """Tangent to the fitted curve at one end, drawn through that centroid."""
    x_point = int(curve(y_point))
    y_point = int(y_point)
    length = int(TANGENT_LENGTH * scale)

    y1, y2 = y_point - length, y_point + length
    x1 = int(x_point + slope * (y1 - y_point))
    x2 = int(x_point + slope * (y2 - y_point))

    cv2.line(image, (x1, y1), (x2, y2), color, thickness, cv2.LINE_AA)


def confidence(count, fit_error):
    """Measurement quality, not model probability.

    These scripts are geometric — there is no classifier emitting a probability.
    The score reflects how much the measurement can be trusted: how many
    vertebrae fed the fit, and how well a quadratic described them.
    """
    coverage = min(count / 5.0, 1.0)
    fit_quality = max(0.0, 1.0 - min(fit_error / 0.25, 1.0))
    return 0.45 + 0.3 * coverage + 0.25 * fit_quality


def describe_thresholds():
    return {
        "normal": "35-65 deg",
        "mild": "20-35 or 65-80 deg",
        "moderate": "5-20 or 80-95 deg",
        "severe": "<5 or >95 deg",
    }


if __name__ == "__main__":
    main()
