# CLAUDE.md — Spine Vision

> **AI-Powered Lumbar Spine Diagnostic Assistant**
> Capstone Project · React (JS) Frontend · Node.js/Express Backend · MongoDB

---

## 1. What This Project Is

Spine Vision is a medical-imaging web platform that lets authenticated users upload a **Lateral (LA) view lumbar X-ray**, runs it through a multi-stage AI diagnostic pipeline, and renders an interactive dashboard showing segmented vertebrae, disease heatmaps, and an LLM-generated medical report.

The pipeline has five stages:

1. **Auth & Upload** — JWT-based login (email + password), then image upload.
2. **AI Segmentation** — A pretrained deep-learning model (`.pth` file) isolates vertebrae L1–L5 and outputs a JSON spatial mask.
3. **Disease Diagnosis** — Three Python scripts consume the original X-ray + JSON mask, producing overlay/heatmap images for up to five spinal conditions.
4. **LLM Report** — Diagnostic images and/or structured text are sent to an LLM (via API credits), which returns a patient-friendly medical report.
5. **Dashboard** — Everything is consolidated into a single interactive view.

---

## 2. Tech Stack

### Frontend

| Concern            | Choice                                                           |
| ------------------- | ---------------------------------------------------------------- |
| Framework           | **React 18+** with **JavaScript** (`.jsx` files)                 |
| Build tool          | **Vite**                                                         |
| Routing             | **React Router v6** (`createBrowserRouter`)                      |
| State management    | **Zustand** for global auth/report state; **TanStack Query** (React Query) for server-state caching & polling |
| HTTP client         | **Axios** with a configured instance (base URL, interceptors)    |
| Styling             | **Tailwind CSS** + **shadcn/ui** component library               |
| Form handling       | **React Hook Form** (with manual validation helpers or Yup)      |
| Notifications       | **Sonner** (toast library from shadcn ecosystem)                 |
| Image viewer        | Custom canvas component or **react-zoom-pan-pinch** for X-ray zoom |
| Markdown rendering  | **react-markdown** + **remark-gfm** for LLM report display      |

### Backend

| Concern            | Choice                                                         |
| ------------------- | -------------------------------------------------------------- |
| Runtime             | **Node.js 20 LTS**                                            |
| Framework           | **Express.js**                                                 |
| Auth                | **JWT** (access + refresh tokens via `jsonwebtoken`)           |
| Password hashing    | **bcryptjs**                                                   |
| Database            | **MongoDB** (local instance) via **Mongoose 8**                |
| File uploads        | **Multer** (multipart/form-data handling)                      |
| Validation          | **Joi** for request body/param validation middleware           |
| ML bridge           | Python scripts invoked via **`child_process.execFile()`**      |
| LLM integration     | **OpenAI SDK** (`openai` npm package) — uses API credits       |
| CORS                | **`cors`** package, configured for `http://localhost:5173` in dev |
| Environment         | **dotenv** for `.env` loading                                  |

### ML / AI Layer (Python — called by Node, not served independently)

| Concern              | Choice                                            |
| ---------------------- | ------------------------------------------------- |
| Runtime                | **Python 3.11+** with a local venv                |
| Deep learning          | **PyTorch** (inference only, no training)          |
| Image processing       | **OpenCV** (`cv2`), **Pillow**                     |
| Segmentation model     | `.pth` weight files loaded by a Python entry script |
| Diagnostic scripts     | 3 standalone Python scripts (extensible to 5)      |

---

## 3. Directory Structure

```
spine-vision/
├── CLAUDE.md                        # ← this file
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── jsconfig.json                # path aliases (@/ → src/)
│   ├── postcss.config.js
│   ├── .env                         # VITE_API_BASE_URL
│   ├── public/
│   │   └── spine-vision-logo.svg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                   # Router setup
│       ├── api/
│       │   ├── axios.js              # Axios instance with interceptors
│       │   ├── auth.js               # login(), register(), refreshToken()
│       │   └── diagnosis.js          # uploadXray(), getScanStatus(), getScanResult(), getScanHistory()
│       ├── stores/
│       │   ├── authStore.js          # Zustand: user, tokens, login/logout actions
│       │   └── diagnosisStore.js     # Zustand: active scan state, selected history item
│       ├── hooks/
│       │   ├── useAuth.js
│       │   └── useDiagnosis.js       # Wraps TanStack Query polling + mutations
│       ├── components/
│       │   ├── ui/                   # shadcn/ui primitives (Button, Input, Card…)
│       │   ├── layout/
│       │   │   ├── Navbar.jsx
│       │   │   └── ProtectedRoute.jsx
│       │   ├── auth/
│       │   │   ├── LoginForm.jsx
│       │   │   └── RegisterForm.jsx
│       │   ├── upload/
│       │   │   ├── UploadZone.jsx        # Drag-and-drop + click-to-browse
│       │   │   └── UploadPreview.jsx     # Thumbnail + metadata before submit
│       │   ├── dashboard/
│       │   │   ├── OriginalXray.jsx      # Displays uploaded image with zoom/pan
│       │   │   ├── HeatmapGallery.jsx    # Grid of diagnostic overlay images
│       │   │   ├── ReportPanel.jsx       # Rendered LLM report (markdown → HTML)
│       │   │   └── DiagnosisStepper.jsx  # Visual pipeline progress indicator
│       │   └── common/
│       │       ├── Loader.jsx
│       │       └── ErrorBoundary.jsx
│       ├── pages/
│       │   ├── LoginPage.jsx             # Page 1
│       │   ├── RegisterPage.jsx
│       │   └── DashboardPage.jsx         # Page 2
│       ├── lib/
│       │   └── utils.js                  # cn() helper, formatters
│       └── styles/
│           └── globals.css               # Tailwind directives + custom tokens
│
├── backend/
│   ├── package.json
│   ├── .env                              # See section 10
│   ├── server.js                         # Express app entry — CORS, routes, DB connect, listen
│   ├── config/
│   │   └── db.js                         # Mongoose connection (mongodb://localhost:27017/spinevision)
│   ├── models/
│   │   ├── User.js                       # Mongoose schema: name, email, passwordHash, createdAt
│   │   └── Scan.js                       # Mongoose schema: userId, status, imagePath, maskJson, heatmaps[], reportMarkdown, timestamps
│   ├── routes/
│   │   ├── auth.js                       # POST /api/auth/register, /login, /refresh
│   │   └── scan.js                       # POST /api/scan/upload, GET /api/scan/:id/status, GET /api/scan/:id/result, GET /api/scan/history
│   ├── controllers/
│   │   ├── authController.js             # Handler logic for auth routes
│   │   └── scanController.js             # Handler logic for scan routes
│   ├── middleware/
│   │   ├── authMiddleware.js             # JWT verify, attach req.user
│   │   ├── validate.js                   # Joi schema validation middleware factory
│   │   └── errorHandler.js              # Global Express error handler
│   ├── services/
│   │   ├── authService.js                # Hash/verify passwords, sign/verify JWTs
│   │   ├── pipelineRunner.js             # Orchestrates the full ML pipeline (steps 2-4) as an async background job
│   │   ├── segmentationBridge.js         # Spawns Python segmentation script via child_process
│   │   ├── diagnosisBridge.js            # Spawns each diagnostic Python script via child_process
│   │   └── llmReportService.js           # Calls OpenAI API with diagnostic findings, returns markdown
│   ├── validators/
│   │   ├── authValidator.js              # Joi schemas for register/login bodies
│   │   └── scanValidator.js              # Joi schemas for scan params
│   ├── utils/
│   │   └── fileUtils.js                  # Save upload, generate paths, thumbnail compression
│   └── uploads/                          # Dev-only upload directory (git-ignored)
│
├── ml/                                   # Python ML layer — SEPARATE from Node backend
│   ├── requirements.txt                  # torch, opencv-python, pillow, numpy
│   ├── venv/                             # Python virtual environment (git-ignored)
│   ├── models/best.pt                    # YOLO11-seg checkpoint (git-ignored, supplied separately)
│   │   └── .gitkeep
│   ├── README.md                         # Script contract, result JSON, mask formats
│   ├── segment.py                        # Stage 2: YOLO11-seg → COCO mask.json
│   ├── scripts/                          # Diagnostic scripts
│   │   ├── diagnose_lordosis.py          # Sagittal curvature index from centroids
│   │   ├── diagnose_spondylolisthesis.py # Centroid slip %, Meyerding graded
│   │   └── diagnose_compression_fracture.py  # Anterior/posterior height ratio
│   └── utils/                            # Shared Python utilities (CLI, mask parsing, drawing)
│       └── io_helpers.py
│
└── docker-compose.yml                    # MongoDB container (optional, for those without local mongo)
```

---

## 4. Page-by-Page UI Specification

### Page 1 — Login (`/login`)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              🦴  SPINE VISION                   │
│         AI-Powered Spine Diagnostics            │
│                                                 │
│         ┌───────────────────────────┐           │
│         │  Email                    │           │
│         ├───────────────────────────┤           │
│         │  Password                 │           │
│         ├───────────────────────────┤           │
│         │      [ Login ]            │           │
│         │                           │           │
│         │  Don't have an account?   │           │
│         │  Register →               │           │
│         └───────────────────────────┘           │
│                                                 │
│  Footer: "For educational purposes only.        │
│   Not a substitute for professional diagnosis." │
└─────────────────────────────────────────────────┘
```

**Behaviour:**
- Full-viewport centered card on a dark/gradient background.
- Email validated on the client (regex or React Hook Form pattern rule).
- Password minimum 8 characters.
- On success → store JWT pair in Zustand (access token in memory, refresh token in localStorage as dev fallback) → redirect to `/dashboard`.
- On 401 → show inline error "Invalid email or password" — never reveal which field was wrong.
- "Register" link navigates to `/register` (same layout, adds a "Name" field and "Confirm password").

### Upload panel — two mutually exclusive paths

**Normal (default).** Upload the X-ray, press **Proceed**. The server runs
`ml/segment.py` to outline L1–L5, then diagnoses and reports. No mask upload
is shown.

**Developer only.** A switch at the bottom of the upload card reveals the mask
JSON dropzone and replaces Proceed with **Analyze**, which stays disabled until
a mask is staged. An uploaded mask is used exactly as given and segmentation
never runs — that is the point of the switch, so a hand-checked mask can be fed
in without the model overwriting it.

The two never combine: the presence of an uploaded mask is what tells the
pipeline to skip stage 2 (`maskSource: "user"`). The backend enforces this
independently of the UI flag.

### Page 2 — Dashboard (`/dashboard`)

Protected route — `ProtectedRoute.jsx` redirects to `/login` if no valid token.

```
┌──────────────────────────────────────────────────────────────┐
│  🦴 SPINE VISION                            [User ▾] [Logout]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐  ┌────────────────────────────────┐ │
│  │                     │  │                                │ │
│  │   UPLOAD SECTION    │  │       REPORT SECTION           │ │
│  │                     │  │                                │ │
│  │  ┌───────────────┐  │  │  ┌──────────────────────────┐  │ │
│  │  │  Drop X-ray   │  │  │  │  Pipeline Progress       │  │ │
│  │  │  here or      │  │  │  │  ● Upload  ○ Segment     │  │ │
│  │  │  click to     │  │  │  │  ○ Diagnose ○ Report     │  │ │
│  │  │  browse       │  │  │  └──────────────────────────┘  │ │
│  │  └───────────────┘  │  │                                │ │
│  │                     │  │  ┌──────────────────────────┐  │ │
│  │  After upload:      │  │  │  Original X-ray (zoomable)│  │ │
│  │  ┌───────────────┐  │  │  └──────────────────────────┘  │ │
│  │  │  X-ray thumb  │  │  │                                │ │
│  │  │  + file info  │  │  │  ┌──────────────────────────┐  │ │
│  │  │  [Analyze ▶]  │  │  │  │  Heatmap Gallery (grid)  │  │ │
│  │  └───────────────┘  │  │  │  (clickable to expand)   │  │ │
│  │                     │  │  └──────────────────────────┘  │ │
│  │  Scan History       │  │                                │ │
│  │  (list of past      │  │  ┌──────────────────────────┐  │ │
│  │   scans with dates) │  │  │  Medical Report           │  │ │
│  │                     │  │  │  (LLM-generated markdown) │  │ │
│  └─────────────────────┘  │  │  [Download PDF]           │  │ │
│                           │  └──────────────────────────┘  │ │
│                           └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Layout:** Two-column split — roughly **30% left (upload)** / **70% right (report)**.

**Left Panel — Upload Section:**
- Drag-and-drop zone accepting `.png`, `.jpg`, `.jpeg`, `.dicom` (max 10 MB).
- On file select → show thumbnail preview + file name + size.
- "Analyze" button triggers upload via `POST /api/scan/upload` (multipart/form-data).
- Below the upload zone: scrollable **Scan History** list. Each entry shows date, thumbnail, and status badge (Processing / Complete / Failed). Clicking loads that scan's results into the right panel.

**Right Panel — Report Section:**
- **DiagnosisStepper** at the top — four steps: Upload → Segment → Diagnose → Report. Active step pulses/animates, completed steps show checkmarks, pending steps are greyed out. Frontend polls `GET /api/scan/:id/status` every 3 seconds while status is not terminal.
- **Original X-ray Viewer** — rendered with zoom/pan. Overlay toggle to show the segmentation mask (JSON mask rendered as a semi-transparent polygon overlay on a canvas).
- **Heatmap Gallery** — grid of diagnostic images returned by the three scripts. Each image is labelled with the condition name and a severity badge (Normal / Mild / Moderate / Severe). Clicking an image opens a modal with full-size view.
- **Medical Report** — rendered from the LLM-generated markdown using `react-markdown`. Sections typically include: Patient Summary, Findings per Vertebra, Condition Assessments, Recommendations. A "Download PDF" button generates a client-side PDF using `html2pdf.js`.

---

## 5. Authentication Flow

```
Register:
  Client  →  POST /api/auth/register  { name, email, password }
  Server  →  check if email exists in MongoDB
          →  hash password (bcryptjs, 12 rounds)
          →  create User document
          →  return 201 { user: { _id, name, email } }

Login:
  Client  →  POST /api/auth/login  { email, password }
  Server  →  find user by email
          →  bcrypt.compare(password, user.passwordHash)
          →  sign access_token (15 min) + refresh_token (7 days) with jsonwebtoken
          →  return 200 { access_token, refresh_token, user: { _id, name, email } }

Protected Request:
  Client  →  GET /api/scan/:id/result
             Header: Authorization: Bearer <access_token>
  Server  →  authMiddleware decodes JWT, attaches req.user = { userId, email }
          →  controller proceeds

Token Refresh:
  Client  →  POST /api/auth/refresh  { refresh_token }
  Server  →  verify refresh_token, issue new pair

Axios Interceptor Logic (frontend):
  - Request interceptor:  attach access_token from Zustand store to Authorization header.
  - Response interceptor: on 401, attempt POST /api/auth/refresh silently.
                          If refresh succeeds → retry original request.
                          If refresh fails   → clear store, redirect to /login.
```

---

## 6. API Contract (REST)

All routes prefixed with `/api`.

### Auth

| Method | Path                | Body                          | Response                                         |
| ------ | ------------------- | ----------------------------- | ------------------------------------------------ |
| POST   | `/api/auth/register`| `{ name, email, password }`   | `201 { user: { _id, name, email } }`             |
| POST   | `/api/auth/login`   | `{ email, password }`         | `200 { access_token, refresh_token, user }`       |
| POST   | `/api/auth/refresh` | `{ refresh_token }`           | `200 { access_token, refresh_token }`             |

### Diagnosis

| Method | Path                       | Body / Params             | Response                                                                 |
| ------ | -------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| POST   | `/api/scan/upload`         | `multipart: file (image), mask (JSON)` | `202 { scanId, status: "uploaded" }`. `mask` is required while `SEGMENTATION_ENABLED=false`; without it, `400`. |
| GET    | `/api/scan/:id/status`     | —                         | `200 { scanId, status, currentStep }`                                    |
| GET    | `/api/scan/:id/result`     | —                         | `200 { scanId, status, originalUrl, maskJson, heatmaps: [{ condition, imageUrl, severity, confidence, summary, metrics, caveats }], reportMarkdown }` |
| GET    | `/api/scan/history`        | `?page=1&limit=10`       | `200 { scans: [...], total, page }`                                      |

### AI assistance

All three spend API credits, so all three are rate limited (12/min/user) and cached server-side.

| Method | Path                             | Body / Params                          | Response |
| ------ | -------------------------------- | -------------------------------------- | -------- |
| GET    | `/api/scan/:id/report`           | `?audience=patient\|clinician&stream=1` | `200 { audience, markdown, cached }`, or `text/event-stream` of `{type:"delta"\|"done"\|"error"}` frames when `stream=1` |
| POST   | `/api/scan/:id/ask`              | `{ question, audience? }`              | `200 { answer, grounded }` |
| GET    | `/api/scan/:id/explain/:condition` | `?audience=`                         | `200 { condition, explanation, cached }` |

### Serving Uploaded/Generated Images

| Method | Path                           | Auth     | Response          |
| ------ | ------------------------------ | -------- | ----------------- |
| GET    | `/api/scan/image/:scanId/:filename` | Bearer JWT | Image file (streamed). Only the owning user can access. |

### Status Values

`"uploaded"` → `"segmenting"` → `"diagnosing"` → `"generating_report"` → `"complete"` | `"failed"`

### Error Shape

All errors follow: `{ success: false, message: "Human-readable error" }`.

---

## 7. Mongoose Schemas

```javascript
// models/User.js
const userSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });


// models/Scan.js
const heatmapSchema = new mongoose.Schema({
  condition: { type: String, required: true },    // e.g. "compression_fracture"
  imagePath: { type: String, required: true },    // relative path inside uploads/
  severity:  { type: String, enum: ["normal", "mild", "moderate", "severe"], default: "normal" },
  confidence:{ type: Number, min: 0, max: 1 },    // measurement quality, not probability
  metrics:   { type: mongoose.Schema.Types.Mixed, default: null },  // structured numbers
  summary:   { type: String, default: null },     // plain-language measured result
  caveats:   { type: [String], default: [] },     // how the measurement can mislead
}, { _id: false });

const scanSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status:          { type: String, enum: ["uploaded","segmenting","diagnosing","generating_report","complete","failed"], default: "uploaded" },
  originalPath:    { type: String, required: true },         // path to uploaded X-ray
  maskJson:        { type: mongoose.Schema.Types.Mixed },    // vertebra polygon coordinates
  heatmaps:        [heatmapSchema],
  reportMarkdown:  { type: String, default: null },
  failureReason:   { type: String, default: null },
}, { timestamps: true });
```

---

## 8. Coding Conventions

### General
- **JavaScript only** — no TypeScript in this project. Use JSDoc comments for complex function signatures where clarity helps.
- Prefer **named exports** over default exports (except for pages if needed by router lazy loading).
- One component per file. File name matches component name (`PascalCase.jsx`).
- Use **absolute imports** via `@/` alias mapped to `src/` in `jsconfig.json` + `vite.config.js`.

### React (Frontend)
- All components are **functional** with hooks.
- Props documented with a JSDoc `@param` comment above the component when non-trivial.
- Use **early returns** for loading / error / empty states at the top of the component.
- No inline styles. **Tailwind classes only**. Use `cn()` from `lib/utils.js` for conditional classes.
- Forms use **React Hook Form** with manual validation rules (no Zod/Yup dependency required — use RHF's built-in `required`, `pattern`, `minLength` options).

### State (Frontend)
- **Zustand stores** are thin: state + actions in a single `create()` call, no classes.
- **TanStack Query** for all GET endpoints: `useQuery` with appropriate `staleTime` and `refetchInterval` for status polling.
- **Mutations** via `useMutation` with `onSuccess` invalidation of related queries.
- Never store server-fetched data in Zustand — that belongs in React Query's cache.

### API Layer (Frontend)
- All Axios calls live in `src/api/`. Each file exports plain async functions.
- Never call Axios directly from a component. Always go through `api/` → custom hook → component.

### Backend (Node/Express)
- Use **`async/await`** everywhere. No raw `.then()` chains.
- Route files only wire up `router.get/post(...)`. All logic lives in **controllers** (which call **services**).
- Mongoose queries use **lean()** for read operations where the full Mongoose document isn't needed.
- Every route that accepts a body goes through a **Joi validation middleware** before hitting the controller.
- **Error handling**: throw errors in services, catch them in controllers or let them propagate to the global `errorHandler.js` middleware.
- Return shape: `{ success: true, data: { ... } }` on success; `{ success: false, message: "..." }` on error.

### ML Bridge (Node → Python)
- `segmentationBridge.js` and `diagnosisBridge.js` use `child_process.execFile()` (never `exec()` — avoid shell injection).
- Each Python script communicates results via:
  - **stdout** for structured JSON output — exactly one line, the last line.
  - **File system** for generated images (written to a known path, path returned in stdout JSON).
  - **stderr** for logging (captured and logged by Node, not parsed).
- Scripts must exit with code 0 on success, non-zero on failure. A measurement
  that *could not be made* is still a success: exit 0 with `"measurable": false`,
  so one unusable script never fails the whole scan.
- Every diagnostic script emits `metrics`, `summary` and `caveats` alongside
  `severity`. See `ml/README.md` for the full result contract.
- `confidence` from a diagnostic script is **measurement quality, not a
  probability**. These scripts are geometric; there is no classifier. The field
  scores how much the geometry can be trusted, and the UI labels it as such.

---

## 9. Backend Processing Pipeline (Internal Detail)

When `POST /api/scan/upload` is called:

1. **Multer** saves the X-ray to `uploads/{userId}/{scanId}/original.{ext}` and,
   when supplied, the mask to `mask.json` in the same directory. The mask is
   parsed and rejected with a `400` if it holds no vertebra polygons — better a
   failed upload than a failed scan two stages later.
2. **Create Scan document** in MongoDB with status `"uploaded"`.
3. **Return 202** immediately with `{ scanId, status: "uploaded" }`.
4. **Fire-and-forget** — call `pipelineRunner.run(scanId)` without awaiting it in the request handler. The pipeline runner is an async function that:

   a. Update status → `"segmenting"`.
   b. **If the upload carried a mask** (`maskSource: "user"`), stage 2 is a no-op —
      `mask.json` is already on disk, and it is used exactly as given. Otherwise,
      with `SEGMENTATION_ENABLED=true`, call `segmentationBridge.run(imagePath)`:
      - Spawns `python3 ml/segment.py --image <imagePath> --output <maskOutputPath>`.
      - Script loads `.pth` model, runs inference, writes `mask.json`.
      - Bridge reads stdout JSON, parses mask, saves `maskJson` on the Scan document.
   c. Update status → `"diagnosing"`.
   d. Call `diagnosisBridge.runAll(imagePath, maskJsonPath)`:
      - Iterates over a **config array** of diagnostic scripts (not hardcoded — see Future Scope).
      - For each script: spawns `python3 ml/scripts/<script>.py --image <path> --mask <path> --output <heatmapOutputPath>`.
      - Each script writes an overlay image + prints one JSON line to stdout with
        `{ condition, imagePath, severity, confidence, metrics, summary, caveats }`.
      - Bridge verifies the overlay exists, collects results, pushes each into the
        Scan document's `heatmaps` array. A failing script is logged and skipped.
      - Scripts that measure the vertebral body outline vs. the full vertebra can be
        pointed at `mask.inner.json` / `mask.outer.json` when segmentation produces
        both; otherwise every script falls back to `mask.json`.
   e. Update status → `"generating_report"`.
   f. Call `llmReportService.generate(scan)`:
      - Builds a prompt from the structured findings — each script's `summary`,
        `metrics` and `caveats`, rendered deterministically.
      - Applies the report guard rails (section 15) as the system prompt.
      - Calls OpenAI API (or compatible) with the prompt.
      - Returns markdown string.
      - Saves `reportMarkdown` on the Scan document.
   g. Update status → `"complete"`.
   h. On any exception → status → `"failed"`, save error message to `failureReason`, log full stack trace.

The frontend polls `GET /api/scan/:id/status` every 3 seconds while `status` is not `"complete"` or `"failed"`.

---

## 10. Environment Variables

### Frontend (`frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:5001
```

### Backend (`backend/.env`)
```
PORT=5001
MONGODB_URI=mongodb://localhost:27017/spinevision
JWT_SECRET=<random-256-bit-hex>
JWT_REFRESH_SECRET=<different-random-256-bit-hex>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
UPLOAD_DIR=./uploads
OPENAI_API_KEY=<your-api-key>
OPENAI_MODEL=gpt-4o
PYTHON_PATH=../ml/venv/bin/python3
ML_DIR=../ml
```

---

## 11. Development Workflow

```bash
# 1. Start MongoDB (if not running as a system service)
mongod --dbpath ~/data/db

# 2. Set up Python ML environment (one-time)
cd ml
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Download .pth model files into ml/models/ (manual step, see README)
deactivate
cd ..

# 3. Backend
cd backend
npm install
cp .env.example .env          # fill in secrets
npm run dev                    # nodemon server.js → http://localhost:5001

# 4. Frontend
cd frontend
npm install
npm run dev                    # Vite → http://localhost:5173
```

---

## 12. Dependencies (Key Packages)

### Frontend (`frontend/package.json`)
```
react, react-dom, react-router-dom
@tanstack/react-query
zustand
axios
tailwindcss, postcss, autoprefixer
react-hook-form
react-markdown, remark-gfm
react-zoom-pan-pinch
react-dropzone
html2pdf.js
sonner
clsx, tailwind-merge              (for cn() utility)
```

### Backend (`backend/package.json`)
```
express
mongoose
jsonwebtoken
bcryptjs
multer
cors
dotenv
joi
openai
sharp                             (for thumbnail generation)
morgan                            (HTTP request logging)
nodemon (dev)
```

### ML (`ml/requirements.txt`)
```
torch
torchvision
opencv-python
Pillow
numpy
```

---

## 13. Future Scope Hooks (Do Not Implement Yet)

These are architectural placeholders. Code should be structured so adding them is a matter of plugging in, not refactoring.

- **Second segmentation model**: `segmentationBridge.js` should accept a model config object (path, script, output format) rather than a hardcoded path, so a second `.pth` can be added by config.
- **Two additional diagnostic scripts**: `diagnosisBridge.js` iterates over the
  `DIAGNOSTIC_SCRIPTS` config array. Today it has 3 entries; adding 2 more means
  adding 2 entries plus the Python files — zero code changes elsewhere.
- ~~**Multimodal LLM input**~~ — done. `llmReportService.js` attaches the overlays
  as base64 image parts when `LLM_INCLUDE_IMAGES=true`; text-only is the default.
- **OAuth / Google Sign-In**: Auth routes should be structured so adding a Passport.js Google strategy is an addition, not a rewrite.
- **DICOM support**: File upload validation should check magic bytes, not just extensions, to support `.dcm` files in the future.
- **WebSocket status updates**: Replace polling with Socket.io for real-time pipeline progress (the frontend already uses a polling pattern via TanStack Query's `refetchInterval`, so the migration is a backend concern + a hook change).

---

## 14. Non-Functional Requirements

- **Medical disclaimer**: Every page must display a footer or banner: *"Spine Vision is an educational tool. It is not a substitute for professional medical diagnosis."*
- **Image security**: Uploaded images are only accessible to the authenticated user who uploaded them. Serve via the `/api/scan/image/:scanId/:filename` authenticated endpoint — never expose the `uploads/` directory as a public static folder.
- **Responsive**: The dashboard should be usable on tablets (≥768px). Mobile is not a priority for this capstone but the layout should not break.
- **Accessibility**: All interactive elements must be keyboard-navigable. Images must have meaningful alt text.
- **Performance**: X-ray images can be large. Generate compressed thumbnails server-side using `sharp`. Lazy-load heatmap images in the gallery.
- **Logging**: Use `morgan` for HTTP logs. Use `console.error` (or a lightweight logger like `pino`) in services for pipeline errors.

---

---

## 15. AI Layer and Guard Rails

The LLM never reads the X-ray. The Python scripts measure; the LLM only writes
the measurements up. `llmReportService.js` hands it a deterministic findings
block built from the stored `summary` / `metrics` / `caveats`, under a system
prompt enforcing:

1. **Use only the supplied numbers.** Every value, level and grade in the report
   must appear verbatim in the findings block. Nothing invented.
2. **No diagnosis.** Describe the measurement against its reference range. Never
   "the patient has". Never a prognosis.
3. **No treatment plan.** No drugs, procedures, exercises, or further imaging.
4. **Carry the caveats.** Every script's caveats are reproduced in a mandatory
   "Measurement Limitations" section, unsoftened.
5. **Confidence is measurement quality**, not diagnostic certainty — and must be
   described as such wherever it appears.
6. **Normal is a result.** Don't manufacture concern over a normal band.
7. **No patient details.** No age, sex, history or symptoms exist. Don't invent them.
8. **Plain language**, jargon expanded on first use.

Output sections are fixed: Summary, Measurements, What This Means, Measurement
Limitations, Next Steps.

Without an `OPENAI_API_KEY`, `templateReport()` renders the same sections
directly from the measurements — deterministic and number-accurate, never a
fabricated finding.

### Where the rules live

`services/llm/prompts.js` holds the rules once and every feature inherits them,
rather than three copies drifting apart. `services/llm/client.js` wraps the
OpenAI-compatible API; `OPENAI_BASE_URL` points it at any compatible provider,
so switching is config, not code.

### The three AI features

| Feature | What it does | Grounding |
| --- | --- | --- |
| **Audience toggle** | Regenerates the report as *Patient* (plain language, jargon expanded) or *Clinician* (terse, standard terminology) | Same findings block; only the voice changes |
| **Ask about this scan** | Grounded Q&A in a dock on the right of the page — a launcher bottom-right, a full-height panel when open. Below `lg` it overlays with a dismissable backdrop; above it, the page insets to sit beside it | Answers only from that scan's findings. Anything unmeasured returns "that wasn't measured" rather than a guess. Explaining what a term *means* is allowed; asserting anything about the patient beyond the measurements is not |
| **Explain this overlay** | "What am I looking at?" in the heatmap modal | Scoped to one condition's measurements |

The audience lives in `diagnosisStore` (with the dock's open state), so all three
speak in the same register.

### Per-level tables

Only conditions that emit an explicit `perLevel` list are tabulated per level —
spondylolisthesis (per adjacent pair) and compression fracture (per body).
**Lordosis is a single whole-segment measurement**: one angle between the
tangents at the top and bottom of the fitted curve, with no per-vertebra value.
Its `levelsIncludedInFit` names the vertebrae that fed the curve, which is not
the same thing, and rule 7 forbids attributing a segment-level number to one
vertebra or listing levels with nothing against them.

### Cost control

Every call spends credits, so:

- **Cached.** Report variants are stored on `scan.reports[audience]`, explanations
  on `scan.explanations[condition:audience]`. Toggling back and forth re-bills nothing.
  The pipeline writes its report to `reports.patient` so the default view is a cache hit.
- **Metered.** `middleware/rateLimit.js` — 12 AI requests/min/user, in-memory.
- **On demand.** Overlay explanations are only generated when someone clicks.

### Streaming

`?stream=1` returns server-sent events. The client uses `fetch` rather than
`EventSource`, which cannot send an `Authorization` header, and retries once
against a refreshed token. Headers go out before the first token, so a mid-stream
failure is reported as an `error` frame rather than a status code.

---

*This document is the single source of truth for Spine Vision. Update it before starting any new feature.*
