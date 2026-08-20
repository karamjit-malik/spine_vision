# ml/ — Python diagnostic layer

Called by the Node backend through `child_process.execFile()`. Nothing here is
served independently.

## Model weights

The segmentation checkpoint lives at `ml/models/best.pt` — the name ultralytics
writes. It is git-ignored (tens of megabytes) and supplied separately. Override
the location with `SEGMENTATION_WEIGHTS` in `backend/.env`, relative to `ML_DIR`.

```bash
python3 ml/segment.py --image <x-ray> --output mask.json [--weights <path>] [--conf 0.25]
```

Emits `{"vertebrae": [{"label": "L1", "polygon": [[x, y], ...], "confidence": …}],
"imageWidth": …, "imageHeight": …, "model": "best.pt"}` — the Spine Vision mask
format the diagnostic scripts read directly.

## Setup

```bash
cd ml
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt   # includes ultralytics + torch for segment.py
deactivate
```

Then set `ML_ENABLED=true` in `backend/.env`.

## The contract every diagnostic script follows

```bash
python3 ml/scripts/<script>.py \
  --image  <path to X-ray> \
  --mask   <path to mask JSON> \
  --output <path to write the overlay PNG> \
  [--mask-inner <path>] [--mask-outer <path>]
```

- **stdout** — exactly one line of JSON, the result (below).
- **stderr** — logging, captured by Node and never parsed.
- **exit 0** on success. A measurement that could not be made still exits 0 with
  `"measurable": false`, so one unusable script cannot fail the whole scan.

### Result JSON

```jsonc
{
  "condition": "compression_fracture",
  "imagePath": "/…/compression_fracture.png",  // the overlay that was written
  "severity": "moderate",                      // normal | mild | moderate | severe
  "confidence": 0.875,                         // MEASUREMENT QUALITY, not probability
  "measurable": true,
  "metrics": { … },        // structured numbers, incl. "perLevel" where applicable
  "summary": "…",          // one plain-language paragraph of the measured result
  "caveats": ["…"]         // how the measurement can mislead — the LLM must repeat these
}
```

`summary`, `metrics` and `caveats` are what `llmReportService.js` builds its
prompt from. The model is instructed to use no number that does not appear
there, so anything a script does not report cannot end up in the report.

**`confidence` is not a probability.** These scripts are geometric — there is no
classifier. The value scores how much the measurement can be trusted: how many
vertebrae were segmented, how well-formed their polygons were, how well the
curve fitted. The dashboard labels it "measurement quality" for that reason.

## Mask formats

`utils/io_helpers.load_vertebrae()` accepts either:

- **COCO** — `{"annotations": [{"segmentation": [[x, y, x, y, …]]}]}`, i.e. what
  a labelling tool exports.
- **Spine Vision** — `{"vertebrae": [{"label": "L1", "polygon": [[x, y], …]}]}`,
  which is what `segment.py` will emit. Coordinates may be normalised to 0–1.

Polygons are ordered superior → inferior and, when unlabelled, named `L1`–`L5`
if exactly five were found, otherwise `V1`…`Vn`.

Some measurements assume the vertebral body outline and others the full
vertebra. If both contour sets exist as `mask.inner.json` / `mask.outer.json`
next to the upload, the pipeline passes them and each script takes the one it
wants; otherwise everything falls back to `mask.json`.

## Scripts

| Script | Condition | Measures |
| --- | --- | --- |
| `scripts/diagnose_lordosis.py` | `lordosis` | Tangent difference of a quadratic fitted through vertebral centroids — a Cobb-like curvature index. Prefers the outer contours. |
| `scripts/diagnose_spondylolisthesis.py` | `spondylolisthesis` | Horizontal centroid offset between adjacent bodies as a % of the upper body's width, graded on Meyerding. Prefers inner. |
| `scripts/diagnose_compression_fracture.py` | `compression_fracture` | Anterior/posterior height ratio from the polygon's corner points. Prefers inner. |

Adding a fourth is a new file here plus one entry in
`backend/services/diagnosisBridge.js` → `DIAGNOSTIC_SCRIPTS`.

## Still to come

`segment.py` works and is verified against the trained checkpoint, but it is not
yet wired into the pipeline — `SEGMENTATION_ENABLED=false`, and every upload
still carries its own mask. See CLAUDE.md section 9.
