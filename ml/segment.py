"""Stage 2 — vertebra segmentation.

Runs the trained YOLO11 segmentation model over a lateral lumbar X-ray and
writes the vertebra polygons the diagnostic scripts consume.

    python3 ml/segment.py --image <x-ray> --output <mask.json> [--weights <best.pt>]

Writes ``mask.json`` in COCO form — the same shape as the hand-annotated masks
in the dataset, so a predicted mask and an annotated one are interchangeable
everywhere downstream:

    {"images": [{"id": 1, "file_name": ..., "width": w, "height": h}],
     "annotations": [{"id": 1, "image_id": 1, "category_id": 1,
                      "segmentation": [[x, y, x, y, ...]], "bbox": [...],
                      "area": ..., "score": 0.91, "iscrowd": 0}],
     "categories": [{"id": 1, "name": "L1"}, ... {"id": 5, "name": "L5"}]}

Coordinates are absolute pixels. Category ids are 1-indexed (1=L1 … 5=L5) while
YOLO classes are 0-indexed, so they are shifted on the way out.
"""

import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils import io_helpers as io  # noqa: E402

# Levels the model was trained on, in class-index order (see dataset/lumbar.yaml).
CLASS_LEVELS = ["L1", "L2", "L3", "L4", "L5"]

# Kept inside the project so the checkout is self-contained. Git-ignored, since
# weights are tens of megabytes and are distributed separately.
DEFAULT_WEIGHTS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "models", "best.pt"
)

# Below this the detection is noise rather than a vertebra.
DEFAULT_CONFIDENCE = 0.35


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="Path to the source X-ray")
    parser.add_argument("--output", required=True, help="Path to write mask.json")
    parser.add_argument("--weights", default=DEFAULT_WEIGHTS, help="Path to the .pt weights")
    parser.add_argument("--conf", type=float, default=DEFAULT_CONFIDENCE,
                        help="Minimum detection confidence")
    args = parser.parse_args()

    if not os.path.exists(args.weights):
        raise FileNotFoundError(f"Segmentation weights not found: {args.weights}")

    # Imported here, not at module scope: loading ultralytics pulls in torch,
    # which costs seconds even when the run is going to fail on its arguments.
    from ultralytics import YOLO

    image = io.load_image(args.image)
    height, width = image.shape[:2]

    model = YOLO(args.weights)
    # verbose=False keeps ultralytics' banner off stdout, which carries only the
    # result JSON. No device is pinned: ultralytics picks CUDA, MPS or CPU.
    results = model.predict(source=args.image, conf=args.conf, verbose=False)[0]

    detections = extract_vertebrae(results, model.names)
    # Superior to inferior, so annotation order matches anatomic order.
    detections.sort(key=lambda d: float(d["points"][:, 1].mean()))

    mask = {
        "images": [{
            "id": 1,
            "file_name": os.path.basename(args.image),
            "width": width,
            "height": height,
        }],
        "annotations": [to_annotation(index, d) for index, d in enumerate(detections)],
        "categories": [
            {"id": index + 1, "name": level} for index, level in enumerate(CLASS_LEVELS)
        ],
        "model": os.path.basename(args.weights),
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
    with open(args.output, "w") as handle:
        json.dump(mask, handle)

    io.log(f"[segment] {len(detections)} vertebrae -> {args.output}")
    io.emit({
        "maskPath": args.output,
        "vertebraeFound": len(detections),
        "levels": [d["label"] for d in detections],
        "model": os.path.basename(args.weights),
    })


def to_annotation(index, detection):
    """One COCO annotation from a detected polygon."""
    points = detection["points"]
    x_min, y_min = float(points[:, 0].min()), float(points[:, 1].min())
    x_max, y_max = float(points[:, 0].max()), float(points[:, 1].max())

    return {
        "id": index + 1,
        "image_id": 1,
        # COCO categories are 1-indexed; YOLO classes are 0-indexed.
        "category_id": detection["class_id"] + 1,
        "segmentation": [[float(value) for point in points for value in point]],
        "bbox": [x_min, y_min, x_max - x_min, y_max - y_min],
        "area": float(cv2.contourArea(points.astype(np.float32))),
        "score": round(detection["confidence"], 4),
        "iscrowd": 0,
    }


def extract_vertebrae(results, names):
    """Detected polygons in image pixels, one per vertebral level.

    Keeps the highest-confidence detection per level: the model predicts L1-L5
    as distinct classes, so two boxes for the same level means one of them is
    wrong. Emitting both would give the diagnostic scripts six vertebrae and
    corrupt the superior-to-inferior ordering they rely on.
    """
    if results.masks is None or len(results.masks) == 0:
        return []

    best = {}
    boxes = results.boxes

    for index, polygon in enumerate(results.masks.xy):
        # A COCO polygon needs three points to have an area.
        if len(polygon) < 3:
            continue

        class_id = int(boxes.cls[index].item())
        confidence = float(boxes.conf[index].item())
        label = names.get(class_id, "") if isinstance(names, dict) else ""
        if not label:
            label = CLASS_LEVELS[class_id] if class_id < len(CLASS_LEVELS) else f"V{class_id + 1}"

        if label not in best or confidence > best[label]["confidence"]:
            best[label] = {
                "label": label,
                "class_id": class_id,
                "points": np.asarray(polygon, dtype=np.float32),
                "confidence": confidence,
            }

    return list(best.values())


if __name__ == "__main__":
    main()
