# Spine Vision

**AI-Powered Lumbar Spine Diagnostic Assistant**

A web platform that takes a lateral-view lumbar X-ray, segments vertebrae L1–L5
with a trained YOLO11 model, measures three spinal conditions geometrically, and
writes the measurements up as a guard-railed medical report with an interactive
assistant.

> **Educational tool.** Not a substitute for professional medical diagnosis.

---

## Table of Contents

1. [What the System Does](#1-what-the-system-does)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Data Model](#5-data-model)
6. [REST API Reference](#6-rest-api-reference)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [The Processing Pipeline](#8-the-processing-pipeline)
9. [ML Layer — Segmentation](#9-ml-layer--segmentation)
10. [ML Layer — Diagnostics](#10-ml-layer--diagnostics)
11. [LLM Layer & Guard Rails](#11-llm-layer--guard-rails)
12. [Frontend — Pages & Components](#12-frontend--pages--components)
13. [State Management](#13-state-management)
14. [Configuration Reference](#14-configuration-reference)
15. [Running the System](#15-running-the-system)
16. [Diagram Source Material](#16-diagram-source-material)
17. [Known Limitations](#17-known-limitations)
18. [Glossary](#18-glossary)

---

## 1. What the System Does

### 1.1 Problem Statement

Reading a lumbar spine radiograph for alignment abnormalities is manual,
subjective, and time-consuming. Measurements such as vertebral slip and
anterior/posterior height ratio are geometric and therefore automatable, but the
automation must be **auditable** — a clinician has to be able to see how every
number was derived.

### 1.2 Solution

Spine Vision separates *measuring* from *describing*:

- **Python scripts measure.** All numbers come from explicit geometry on the
  segmented vertebra polygons. Nothing is estimated by a neural network.
- **An LLM only writes them up.** The model never sees the X-ray. It receives
  the measurements, the grading scale each was read against, and each script's
  own caveats, and is constrained to those.

This is the central design decision of the project: **every number in the report
is traceable to a specific geometric computation**, and the guard rails exist to
keep the language layer from inventing anything.

### 1.3 Conditions Detected

| Condition | What is measured | Method |
|---|---|---|
| **Lordosis** | Sagittal curvature index (degrees) | Quadratic fitted to vertebral centroids; angle between tangents at the top and bottom of the fitted curve |
| **Spondylolisthesis** | Slip as % of vertebral body width | Horizontal centroid offset between adjacent bodies, graded on the Meyerding scale |
| **Compression fracture** | Anterior/posterior height ratio | Corner points of each body found in its own rotated frame; anterior edge length ÷ posterior edge length |

### 1.4 Actors

| Actor | Capabilities |
|---|---|
| **Guest** | Register, log in |
| **Authenticated user** | Upload X-ray, run analysis, view results, read/switch report, ask questions, request overlay explanations, download PDF |
| **Developer** (same user, UI switch) | Additionally upload a hand-made mask, bypassing segmentation |
| **System (background job)** | Segment, diagnose, generate report, update scan status |

---

## 2. Architecture

### 2.1 High-Level View

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSER (React SPA, Vite dev server :5173)                      │
│  Pages: /login  /register  /dashboard                            │
│  State: Zustand (session, UI) + TanStack Query (server cache)     │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTPS/JSON + multipart + SSE
                            │ Authorization: Bearer <access_token>
┌───────────────────────────▼──────────────────────────────────────┐
│  API SERVER (Node 20 / Express, :5001)                           │
│                                                                   │
│  routes → middleware → controllers → services                     │
│                                                                   │
│  middleware: cors, morgan, requireAuth, validate(Joi),            │
│              multer upload, rateLimit, errorHandler               │
└──────┬───────────────────────┬──────────────────┬────────────────┘
       │                       │                  │
       │ Mongoose              │ execFile()       │ HTTPS
┌──────▼────────┐   ┌──────────▼──────────┐  ┌────▼──────────────┐
│   MongoDB     │   │  PYTHON ML LAYER    │  │  LLM PROVIDER     │
│  users        │   │  segment.py (YOLO)  │  │  OpenAI-compatible│
│  scans        │   │  3 diagnostic       │  │  /v1/chat/        │
│               │   │  scripts (OpenCV)   │  │  completions      │
└───────────────┘   └─────────────────────┘  └───────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  FILE SYSTEM     │
                    │  uploads/{user}/ │
                    │       {scan}/    │
                    │   original.jpg   │
                    │   mask.json      │
                    │   *.png overlays │
                    └──────────────────┘
```

### 2.2 Layering Rules

| Layer | Responsibility | May call |
|---|---|---|
| **Routes** | URL → middleware chain → controller. No logic. | Controllers, middleware |
| **Middleware** | Auth, validation, upload, rate limiting, error shaping | Services (auth only) |
| **Controllers** | HTTP concerns: read request, call service, shape response | Services, models |
| **Services** | Business logic, orchestration, external processes | Models, bridges, other services |
| **Bridges** | Spawn Python via `execFile`, parse stdout JSON | Python scripts |
| **Models** | Mongoose schemas and instance methods | — |

### 2.3 Process Model

The API server is a **single Node process**. The pipeline is *fire-and-forget*:
`POST /api/scan/upload` returns `202` immediately and the pipeline continues in
the background, spawning short-lived Python child processes.

**Consequence:** pipeline state lives only in that process's memory. A restart
orphans any in-flight scan, so `failInterruptedScans()` runs at boot and marks
non-terminal scans as `failed` with an actionable reason.

---

## 3. Technology Stack

### 3.1 Frontend

| Concern | Choice | Version |
|---|---|---|
| Framework | React (JavaScript, `.jsx`) | ^18.3.1 |
| Build tool | Vite | ^5.3.5 |
| Routing | React Router (`createBrowserRouter`) | ^6.25.1 |
| Server state | TanStack Query | ^5.51.1 |
| Client state | Zustand | ^4.5.4 |
| HTTP | Axios (instance + interceptors) | ^1.7.2 |
| Styling | Tailwind CSS | ^3.4.7 |
| Forms | React Hook Form | ^7.52.1 |
| File upload | react-dropzone | ^14.2.3 |
| Image viewer | react-zoom-pan-pinch | ^3.6.1 |
| Markdown | react-markdown + remark-gfm | ^9.0.1 / ^4.0.0 |
| PDF export | html2pdf.js | ^0.10.2 |
| Toasts | Sonner | ^1.5.0 |
| Icons | lucide-react | ^0.427.0 |
| Class merging | clsx + tailwind-merge | ^2.1.1 / ^2.4.0 |

### 3.2 Backend

| Concern | Choice | Version |
|---|---|---|
| Runtime | Node.js 20 LTS (ES modules) | — |
| Framework | Express | ^4.19.2 |
| ODM | Mongoose | ^8.5.2 |
| Auth | jsonwebtoken | ^9.0.2 |
| Hashing | bcryptjs (12 rounds) | ^2.4.3 |
| Uploads | Multer | ^1.4.5-lts.1 |
| Validation | Joi | ^17.13.3 |
| LLM SDK | openai | ^7.5.0 |
| Logging | morgan | ^1.10.0 |
| CORS | cors | ^2.8.5 |
| Config | dotenv | ^16.4.5 |
| Dev reload | nodemon | ^3.1.4 |
| Embedded DB | mongodb-memory-server | ^10.0.0 |

### 3.3 ML Layer

| Concern | Choice |
|---|---|
| Runtime | Python 3.11+ in a local venv (`ml/venv`) |
| Segmentation | Ultralytics YOLO11m-seg (`ultralytics>=8.3`, `torch>=2.2`) |
| Image processing | OpenCV (`opencv-python-headless>=4.8`), NumPy, Pillow |
| Model file | `ml/models/best.pt` (~45 MB, git-ignored) |

---

## 4. Directory Structure

```
capstone/
├── README.md                          ← this document
├── CLAUDE.md                          Architecture spec / source of truth
│
├── backend/
│   ├── server.js                      Express app: CORS, routes, boot sequence
│   ├── nodemon.json                   Watch config (ignores uploads/, .mongo-data/)
│   ├── .env / .env.example            Configuration
│   ├── config/
│   │   ├── db.js                      Mongo connect + embedded mongod fallback
│   │   └── env.js                     Typed, validated env access
│   ├── models/
│   │   ├── User.js                    name, email, passwordHash + toPublic()
│   │   └── Scan.js                    Scan aggregate + embedded heatmapSchema
│   ├── routes/
│   │   ├── auth.js                    4 auth endpoints
│   │   └── scan.js                    8 scan endpoints
│   ├── controllers/
│   │   ├── authController.js          register / login / refresh / me
│   │   └── scanController.js          upload / status / result / history /
│   │                                  image / report / ask / explain
│   ├── middleware/
│   │   ├── authMiddleware.js          requireAuth — verifies Bearer token
│   │   ├── validate.js                Joi factory (body | params | query)
│   │   ├── upload.js                  Multer: file + mask fields
│   │   ├── rateLimit.js               Per-user fixed window for LLM routes
│   │   └── errorHandler.js            notFound + global error shaper
│   ├── services/
│   │   ├── authService.js             Hash, sign, verify, register, login
│   │   ├── pipelineRunner.js          Stage orchestration + restart recovery
│   │   ├── segmentationBridge.js      Spawns segment.py
│   │   ├── diagnosisBridge.js         Spawns the 3 diagnostic scripts
│   │   ├── llmReportService.js        Report generation + streaming + template
│   │   ├── llmAssistService.js        Grounded Q&A + overlay explanations
│   │   └── llm/
│   │       ├── client.js              OpenAI-compatible wrapper (chat, stream)
│   │       └── prompts.js             ALL prompts + guard rails + findings block
│   ├── validators/
│   │   ├── authValidator.js           register / login / refresh schemas
│   │   └── scanValidator.js           scanId / explain params / ask body / history
│   ├── utils/
│   │   ├── ApiError.js                Error class with HTTP status factories
│   │   ├── asyncHandler.js            Async route wrapper
│   │   └── fileUtils.js               scanDir, isInsideUploads, extensionOf
│   ├── scripts/seed.js                Creates the demo account
│   └── uploads/{userId}/{scanId}/     original.*, mask.json, *.png (git-ignored)
│
├── frontend/
│   ├── index.html, vite.config.js, tailwind.config.js, jsconfig.json
│   ├── .env                           VITE_API_BASE_URL, VITE_USE_MOCK
│   └── src/
│       ├── main.jsx                   Providers: ErrorBoundary → Query → Router
│       ├── App.jsx                    Route table
│       ├── api/
│       │   ├── axios.js               Instance + request/response interceptors
│       │   ├── auth.js                login, register, me
│       │   ├── diagnosis.js           upload, status, result, history, report,
│       │   │                          streamReport (SSE), ask, explain
│       │   └── mockServer.js          In-browser fake backend (VITE_USE_MOCK)
│       ├── stores/
│       │   ├── authStore.js           user, tokens, setSession, logout
│       │   └── diagnosisStore.js      activeScanId, pending files, UI flags
│       ├── hooks/
│       │   ├── useAuth.js             login/register mutations + session
│       │   └── useDiagnosis.js        upload mutation, status poll, result, history
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   └── DashboardPage.jsx
│       ├── components/
│       │   ├── layout/                Navbar, ProtectedRoute, Disclaimer
│       │   ├── auth/                  LoginForm, RegisterForm
│       │   ├── upload/                UploadZone, UploadPreview
│       │   ├── dashboard/             OriginalXray, HeatmapGallery, ReportPanel,
│       │   │                          AskDock, ScanHistory, DiagnosisStepper
│       │   ├── common/                AuthedImage, Loader, ErrorBoundary,
│       │   │                          SpineBackdrop, VideoPanel
│       │   └── ui/                    Badge, Button, Card, Input, Modal
│       ├── lib/
│       │   ├── constants.js           Stages, severities, file types, flags
│       │   ├── mask.js                COCO/Spine-Vision mask parser for canvas
│       │   └── utils.js               cn(), formatBytes, formatDate, titleize
│       └── styles/globals.css         Tailwind layers + base font size
│
└── ml/
    ├── README.md                      Script contract
    ├── requirements.txt
    ├── venv/                          (git-ignored)
    ├── models/best.pt                 YOLO11m-seg checkpoint (git-ignored)
    ├── segment.py                     Stage 2 — image → COCO mask.json
    ├── scripts/
    │   ├── diagnose_lordosis.py
    │   ├── diagnose_spondylolisthesis.py
    │   └── diagnose_compression_fracture.py
    └── utils/io_helpers.py            CLI, mask loading, geometry, drawing
```

**Total application source: ~6,400 lines** across JavaScript, JSX and Python.

---

## 5. Data Model

### 5.1 Entity-Relationship

```
┌────────────────────┐              ┌──────────────────────────────┐
│       User         │ 1          * │            Scan              │
├────────────────────┤──────────────├──────────────────────────────┤
│ _id      ObjectId  │   userId     │ _id            ObjectId      │
│ name     String    │  (indexed)   │ userId         ObjectId (FK) │
│ email    String U  │              │ status         Enum          │
│ passwordHash String│              │ originalPath   String        │
│ createdAt Date     │              │ originalName   String        │
│ updatedAt Date     │              │ maskJson       Mixed         │
└────────────────────┘              │ maskSource     Enum          │
                                    │ maskName       String        │
                                    │ heatmaps       [Heatmap]     │
                                    │ reportMarkdown String        │
                                    │ reports        Mixed         │
                                    │ explanations   Mixed         │
                                    │ failureReason  String        │
                                    │ createdAt/updatedAt Date     │
                                    └───────────┬──────────────────┘
                                                │ 1
                                                │ * (embedded, _id: false)
                                    ┌───────────▼──────────────────┐
                                    │         Heatmap              │
                                    ├──────────────────────────────┤
                                    │ condition   String (req)     │
                                    │ imagePath   String (req)     │
                                    │ severity    Enum             │
                                    │ confidence  Number 0..1      │
                                    │ metrics     Mixed            │
                                    │ summary     String           │
                                    │ caveats     [String]         │
                                    └──────────────────────────────┘
```

### 5.2 Enumerations

| Field | Values |
|---|---|
| `Scan.status` | `uploaded`, `segmenting`, `diagnosing`, `generating_report`, `complete`, `failed` |
| `Scan.maskSource` | `user` (uploaded by hand), `model` (produced by `segment.py`) |
| `Heatmap.severity` | `normal`, `mild`, `moderate`, `severe` |

### 5.3 Field Notes

- **`User.email`** — unique index, lowercased on write.
- **`User.toPublic()`** — instance method returning `{_id, name, email}`; the
  password hash never leaves the model layer.
- **`Scan._id`** — minted by Multer *before* the document is created, so the
  upload directory `uploads/{userId}/{scanId}/` matches the document id.
- **`Scan.maskJson`** — the full mask, stored so the dashboard can draw the
  overlay without re-reading disk.
- **`Heatmap.confidence`** — **measurement quality, not diagnostic probability.**
  The scripts are geometric; there is no classifier. It scores how far the
  geometry can be trusted (vertebrae found, polygon density, curve-fit residual).
- **`Scan.reports` / `Scan.explanations`** — caches keyed by `audience` and
  `condition:audience`. Each LLM call costs credits, so switching views must not
  re-bill.

### 5.4 State Machine — `Scan.status`

```
                    ┌──────────┐
                    │ uploaded │  ← created by POST /api/scan/upload
                    └────┬─────┘
                         │ pipelineRunner.run()
                    ┌────▼───────┐
          ┌─────────┤ segmenting │  mask supplied → no-op
          │         └────┬───────┘  else → segment.py
          │              │
          │         ┌────▼──────┐
   error  ├─────────┤ diagnosing│  3 scripts, failures skipped individually
          │         └────┬──────┘
          │              │
          │    ┌─────────▼──────────┐
          ├────┤ generating_report  │  LLM or deterministic template
          │    └─────────┬──────────┘
          │              │
     ┌────▼───┐    ┌─────▼────┐
     │ failed │    │ complete │
     └────────┘    └──────────┘

Also: any non-terminal status → failed, on server restart
      (failInterruptedScans() at boot)
```

---

## 6. REST API Reference

Base URL: `http://localhost:5001/api`
Success: `{ "success": true, "data": { … } }`
Error: `{ "success": false, "message": "Human-readable error" }`

### 6.1 Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/health` | none | `200 {status:"ok", mlEnabled}` |

### 6.2 Authentication

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | none | `{name, email, password}` | `201 {user:{_id,name,email}}` | `400` validation, `409` email exists |
| POST | `/api/auth/login` | none | `{email, password}` | `200 {access_token, refresh_token, user}` | `400`, `401` invalid credentials |
| POST | `/api/auth/refresh` | none | `{refresh_token}` | `200 {access_token, refresh_token}` | `401` invalid/expired |
| GET | `/api/auth/me` | Bearer | — | `200 {user:{userId,email}}` | `401` |

**Validation:** name 2–80 chars; email RFC-valid, lowercased; password 8–128 chars.

### 6.3 Scans

| Method | Path | Auth | Input | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/scan/upload` | Bearer | multipart: `file` (image, required), `mask` (JSON, optional) | `202 {scanId, status}` | `400` no image / bad mask / mask required, `401` |
| GET | `/api/scan/:id/status` | Bearer | — | `200 {scanId, status, currentStep}` | `401`, `403` not owner, `404` |
| GET | `/api/scan/:id/result` | Bearer | — | `200` full result (below) | `401`, `403`, `404` |
| GET | `/api/scan/history` | Bearer | `?page=1&limit=10` | `200 {scans[], total, page}` | `401` |
| GET | `/api/scan/image/:scanId/:filename` | Bearer | — | `200` image stream | `401`, `403`, `404` |

**`GET /api/scan/:id/result` response shape:**

```jsonc
{
  "scanId": "6a85…",
  "status": "complete",
  "originalUrl": "/api/scan/image/6a85…/original.jpg",
  "fileName": "0066-F-019Y1.jpg",
  "createdAt": "2026-08-19T…",
  "maskJson": { "images": […], "annotations": […], "categories": […] },
  "heatmaps": [
    {
      "condition": "spondylolisthesis",
      "severity": "moderate",
      "confidence": 0.958,
      "summary": "3 of 4 adjacent pairs measured above the 5% slip threshold…",
      "metrics": { "worstLevel": "L1-L2", "perLevel": [ … ], … },
      "caveats": ["Slip is measured centroid-to-centroid…", …],
      "imageUrl": "/api/scan/image/6a85…/spondylolisthesis.png"
    }
  ],
  "reportMarkdown": "## Summary\n\n…",
  "failureReason": null
}
```

### 6.4 AI Assistance

All three cost API credits: **rate limited to 12 requests / minute / user**
(`429` when exceeded) and cached server-side.

| Method | Path | Auth | Input | Success |
|---|---|---|---|---|
| GET | `/api/scan/:id/report` | Bearer | `?audience=patient\|clinician` `&stream=1` | `200 {audience, markdown, cached}` — or `text/event-stream` when streaming |
| POST | `/api/scan/:id/ask` | Bearer | `{question, audience?}` | `200 {answer, grounded}` |
| GET | `/api/scan/:id/explain/:condition` | Bearer | `?audience=` | `200 {condition, explanation, cached}` |

**Streaming frames** (`Content-Type: text/event-stream`):

```
data: {"type":"delta","text":"## Sum"}
data: {"type":"delta","text":"mary\n\n"}
data: {"type":"done","audience":"clinician"}
data: {"type":"error","message":"The report stream was interrupted"}
```

**Additional errors:** `400` scan not complete / empty question / invalid
condition slug; `503` no LLM key configured.

### 6.5 HTTP Status Codes Used

| Code | Meaning in this system |
|---|---|
| 200 | Success |
| 201 | User created |
| 202 | Upload accepted, pipeline started asynchronously |
| 400 | Validation failure, malformed mask, scan not ready |
| 401 | Missing/invalid/expired token, bad credentials |
| 403 | Authenticated but not the owner of the scan |
| 404 | Scan or file not found, unknown route |
| 409 | Email already registered |
| 429 | LLM rate limit exceeded |
| 503 | LLM not configured or returned nothing |

---

## 7. Authentication & Authorization

### 7.1 Token Design

| Token | Secret | Lifetime | Storage (client) |
|---|---|---|---|
| Access | `JWT_SECRET` | 15 min | Zustand, **memory only** |
| Refresh | `JWT_REFRESH_SECRET` | 7 days | `localStorage` (dev fallback) |

Payload for both: `{ userId, email }`.

### 7.2 Registration Sequence

```
Client            API              authService         MongoDB
  │                │                    │                 │
  ├─ POST /register┤                    │                 │
  │                ├─ validate(Joi) ────┤                 │
  │                ├─ registerUser() ──►│                 │
  │                │                    ├─ findOne(email)►│
  │                │                    │◄── null ────────┤
  │                │                    ├─ bcrypt.hash(12)│
  │                │                    ├─ create() ─────►│
  │                │                    │◄── user ────────┤
  │                │◄── toPublic() ─────┤                 │
  │◄─ 201 {user} ──┤                    │                 │
```

If the email exists, `409 Conflict` is returned instead.

### 7.3 Login Sequence

```
Client            API              authService         MongoDB
  │                │                    │                 │
  ├─ POST /login ──┤                    │                 │
  │                ├─ validate(Joi) ────┤                 │
  │                ├─ loginUser() ─────►│                 │
  │                │                    ├─ findOne(email)►│
  │                │                    │◄── user ────────┤
  │                │                    ├─ bcrypt.compare │
  │                │                    ├─ signTokens()   │
  │                │◄─ {tokens, user} ──┤                 │
  │◄─ 200 ─────────┤                    │                 │
  │
  └─ store: access token → memory, refresh → localStorage
     navigate → /dashboard
```

**Security note:** unknown email and wrong password both raise the *same*
`401 Invalid email or password`. The client repeats this rather than
distinguishing fields.

### 7.4 Silent Refresh (Axios interceptor)

```
Client                    API
  │  GET /scan/:id/result  │
  ├───────────────────────►│
  │◄──── 401 ──────────────┤   access token expired
  │                        │
  ├─ POST /auth/refresh ──►│   (parallel 401s collapse into ONE refresh)
  │◄──── 200 {tokens} ─────┤
  ├─ retry original ──────►│   with new Authorization header
  │◄──── 200 ──────────────┤
```

If refresh fails, the store is cleared and the user is sent to `/login`.
Requests to `/auth/*` are excluded so a failed login cannot trigger a loop.

### 7.5 Authorization Rule

Every scan route calls `findOwnedScan(id, userId)`, which returns `403` when
`scan.userId !== req.user.userId`. **Uploads are never served statically** — the
`uploads/` directory is not exposed; images go through the authenticated
`/api/scan/image/:scanId/:filename` route, with a `isInsideUploads()` traversal
guard on the resolved path.

---

## 8. The Processing Pipeline

### 8.1 Upload Sequence (auto-segmentation path)

```
User    Browser        API          pipelineRunner    Python        LLM      Mongo
 │        │             │                  │            │            │         │
 ├ drop ─►│             │                  │            │            │         │
 ├ Proceed│             │                  │            │            │         │
 │        ├ POST upload►│                  │            │            │         │
 │        │             ├ multer → disk    │            │            │         │
 │        │             ├ Scan.create ─────┼────────────┼────────────┼────────►│
 │        │◄─ 202 ──────┤                  │            │            │         │
 │        │             ├ run(scanId) ────►│  (not awaited)          │         │
 │        │             │                  ├ status=segmenting ──────┼────────►│
 │        │             │                  ├ segment.py ───────────► │         │
 │        │             │                  │◄─ mask.json ─────────── │         │
 │        │◄ poll 3s ──►│                  ├ status=diagnosing ──────┼────────►│
 │        │             │                  ├ 3 scripts ────────────► │         │
 │        │             │                  │◄─ overlays + metrics ── │         │
 │        │             │                  ├ status=generating_report┼────────►│
 │        │             │                  ├ generateReport() ───────┼───────► │
 │        │             │                  │◄─ markdown ─────────────┼──────── │
 │        │             │                  ├ status=complete ────────┼────────►│
 │        │◄ complete ──┤                  │            │            │         │
 │        ├ GET result ►│                  │            │            │         │
 │◄ render│◄─ 200 ──────┤                  │            │            │         │
```

Typical timing: segmentation ≈ 4–6 s (dominated by loading torch), diagnostics
< 1 s, report generation ≈ 20 s (LLM). Status polling is every 3 s and continues
in background tabs (`refetchIntervalInBackground: true`).

### 8.2 Stage Detail

| Stage | Status | Actor | Input | Output |
|---|---|---|---|---|
| 1 Upload | `uploaded` | Multer + controller | multipart | files on disk, Scan document |
| 2 Segmentation | `segmenting` | `segmentationBridge` → `segment.py` | X-ray | `mask.json` (COCO) |
| 3 Diagnosis | `diagnosing` | `diagnosisBridge` → 3 scripts | X-ray + mask | 3 PNG overlays + metrics |
| 4 Report | `generating_report` | `llmReportService` | metrics + caveats | markdown |
| 5 Done | `complete` | — | — | full result available |

### 8.3 Two Mask Paths

```
                    ┌──────────────────┐
                    │ POST scan/upload │
                    └────────┬─────────┘
                             │
                 ┌───────────▼────────────┐
                 │ mask file in request?  │
                 └───┬────────────────┬───┘
                 yes │                │ no
        ┌────────────▼──────┐  ┌──────▼─────────────────┐
        │ maskSource="user" │  │ SEGMENTATION_ENABLED?  │
        │ validate JSON     │  └───┬────────────────┬───┘
        │ → stage 2 no-op   │  yes │                │ no
        └───────────────────┘  ┌───▼──────────┐  ┌──▼────────────┐
                               │ segment.py   │  │ 400 rejection │
                               │ maskSource=  │  │ "mask required"│
                               │   "model"    │  └───────────────┘
                               └──────────────┘
```

### 8.4 Failure Handling

| Failure | Behaviour |
|---|---|
| One diagnostic script fails | Logged, that condition is skipped; scan continues |
| A script cannot measure (too few vertebrae) | Exits 0 with `measurable: false`; a captioned placeholder overlay is written so the finding still appears, marked *not assessed* |
| Segmentation fails / times out (180 s) | Scan → `failed` with reason |
| LLM unavailable | Falls back to a deterministic template built from the same metrics |
| Server restarts mid-scan | `failInterruptedScans()` marks it `failed` at next boot |

---

## 9. ML Layer — Segmentation

### 9.1 Model

| Property | Value |
|---|---|
| Architecture | YOLO11m-seg (Ultralytics) |
| Task | Instance segmentation |
| Classes | 5 — `L1`, `L2`, `L3`, `L4`, `L5` (0-indexed) |
| Checkpoint | `ml/models/best.pt` (~45 MB, git-ignored) |
| Input | Lateral lumbar radiograph (JPG/PNG) |
| Confidence threshold | 0.35 (`--conf`) |
| Device | Auto-selected (CUDA / MPS / CPU) |

### 9.2 Contract

```bash
python3 ml/segment.py --image <x-ray> --output <mask.json> \
                      [--weights <path>] [--conf 0.35]
```

- **stdout** — exactly one JSON line: `{maskPath, vertebraeFound, levels, model}`
- **stderr** — logging (captured by Node, never parsed)
- **exit 0** on success

### 9.3 Output Format (COCO)

Deliberately identical in shape to the hand-annotated dataset masks, so a
predicted mask and an annotated one are interchangeable everywhere downstream:

```jsonc
{
  "images":     [{ "id": 1, "file_name": "…", "width": 1196, "height": 2066 }],
  "annotations":[{ "id": 1, "image_id": 1, "category_id": 1,
                   "segmentation": [[x, y, x, y, …]],
                   "bbox": [x, y, w, h], "area": 37165,
                   "score": 0.9123, "iscrowd": 0 }],
  "categories": [{ "id": 1, "name": "L1" }, … { "id": 5, "name": "L5" }],
  "model": "best.pt"
}
```

**Category ids are 1-indexed** (COCO convention) while YOLO classes are
0-indexed; the shift happens on output.

### 9.4 Post-Processing

**Highest-confidence detection per level is kept.** The model predicts L1–L5 as
distinct classes, so two boxes for one level means one is wrong. Emitting both
would give the diagnostic scripts six vertebrae and corrupt the
superior→inferior ordering they depend on.

Detections are then sorted top→bottom by mean polygon *y*.

### 9.5 Measured Agreement vs Hand Annotation

Same image (`0066-F-019Y1`), model mask vs hand-annotated mask:

| Condition | Model mask | Hand annotation | Δ |
|---|---|---|---|
| Lordosis | 42.86° normal | 42.83° normal | 0.03° |
| Spondylolisthesis | −28.0% moderate | −27.0% moderate | 1.0 pp |
| Compression fracture | 0.945 normal | 0.957 normal | 0.012 |

Severity bands identical in all three. Typical detection confidences 0.75–0.91,
polygon density 84–205 points per vertebra.

---

## 10. ML Layer — Diagnostics

### 10.1 Shared Contract

```bash
python3 ml/scripts/<script>.py --image <x-ray> --mask <mask.json> \
                               --output <overlay.png> \
                               [--mask-inner <path>] [--mask-outer <path>]
```

Every script emits **one** JSON line on stdout:

```jsonc
{
  "condition": "compression_fracture",
  "imagePath": "/…/compression_fracture.png",
  "severity": "moderate",          // normal | mild | moderate | severe
  "confidence": 0.875,             // MEASUREMENT QUALITY, not probability
  "measurable": true,
  "metrics": { … },                // structured numbers, may include perLevel
  "summary": "…",                  // one plain-language paragraph
  "caveats": ["…"]                 // how this measurement can mislead
}
```

Adding a fourth condition = a new file in `ml/scripts/` plus one entry in
`DIAGNOSTIC_SCRIPTS` in `diagnosisBridge.js`. No other code changes.

### 10.2 Mask Loading (`io_helpers.load_vertebrae`)

Accepts **both** formats and normalises them:

| Format | Shape |
|---|---|
| COCO | `{"annotations":[{"segmentation":[[x,y,…]]}], "categories":[…]}` |
| Spine Vision | `{"vertebrae":[{"label":"L1","polygon":[[x,y],…]}]}` |

Processing: coordinates normalised to pixels (0–1 values scaled by image size),
polygons sorted superior→inferior, labels taken from categories (`l1` → `L1`) or
assigned positionally (`L1`–`L5` if exactly five, else `V1`…`Vn`), and each
polygon flagged if it touches the image border (a clipped outline cannot be
trusted).

### 10.3 Lordosis — `diagnose_lordosis.py`

**Prefers the outer contour set.** Requires ≥ 3 vertebrae.

1. Compute the area centroid of each vertebra.
2. Fit a quadratic `x = f(y)` through the centroids (`np.polyfit(y, x, 2)`).
3. Take the derivative at the topmost and bottommost centroid.
4. `angle = |atan(slope_bottom) − atan(slope_top)|`, in degrees.

**This is a single whole-segment measurement.** There is no per-vertebra
lordosis value; the angle is between the tangents at the two ends of the fitted
curve.

| Band | Range (degrees) |
|---|---|
| normal | 35 – 65 |
| mild | 20 – 35 or 65 – 80 |
| moderate | 5 – 20 or 80 – 95 |
| severe | < 5 or > 95 |

**Overlay:** red centroid dots with level labels, blue fitted curve, green
superior tangent, magenta inferior tangent, caption with angle and band.

**Quality score:** `0.45 + 0.3 × coverage + 0.25 × fit_quality`, where coverage
is vertebrae found ÷ 5 and fit quality derives from the RMS residual of the fit
relative to the horizontal span.

### 10.4 Spondylolisthesis — `diagnose_spondylolisthesis.py`

**Prefers the inner contour set.** Requires ≥ 2 vertebrae.

For each adjacent pair (upper, lower):

```
slip_px       = lower.centroid.x − upper.centroid.x
slip_percent  = slip_px / upper.width × 100
```

Positive = the upper body sits anterior to the one below (anterolisthesis);
negative = retrolisthesis.

| Meyerding grade | Slip (absolute) | Severity |
|---|---|---|
| Normal | < 5 % | normal |
| G1 | 5 – 25 % | mild |
| G2 | 25 – 50 % | moderate |
| G3 | 50 – 75 % | severe |
| G4 | > 75 % | severe |

Scan-level severity = the worst level. **Overlay:** red centroids, blue
connectors, cyan horizontal slip arrows, green per-level `%` + grade labels.

**Quality score:** coverage plus width consistency — a wildly varying vertebral
width usually indicates a mis-segmentation, which distorts the percentage
directly.

### 10.5 Compression Fracture — `diagnose_compression_fracture.py`

**Prefers the inner contour set.**

For each vertebral body:

1. Compute the body's tilt from the minimum-area rectangle (the endplate
   direction), normalised to (−45°, 45°].
2. Rotate the polygon into that frame.
3. Take the leftmost 25 % band (anterior) and rightmost 25 % band (posterior).
4. In each band, the topmost and bottommost points are that border's corners.
5. `ratio = anterior_height / posterior_height` (Euclidean, on original points).

| Ratio | Status | Severity |
|---|---|---|
| > 0.90 | Normal | normal |
| 0.80 – 0.90 | Mild | mild |
| 0.60 – 0.80 | Fracture | moderate |
| < 0.60 | Fracture | severe |

A level is excluded as **unmeasurable** when its polygon is clipped by the image
border, or the ratio falls outside 0.40–1.40 (anatomically impossible → the
outline is wrong, not the vertebra).

**Overlay:** cyan anterior edge, magenta posterior edge, coloured centroid dot,
per-level ratio + status label, caption naming the worst level.

> **Design note.** The rotated frame matters. Taking the two globally highest
> and two globally lowest points works only for a 4-corner polygon; on a real
> traced contour of a tilted vertebra both "top" points land on the same corner,
> the two borders collapse onto one diagonal, and every ratio reads ≈ 1.00 — the
> measurement silently stops working. A band on *unrotated* x fails differently,
> losing the lower corner of a steeply tilted body and inflating the ratio.

---

## 11. LLM Layer & Guard Rails

### 11.1 Principle

**The scripts measure; the model only writes the measurements up.** The LLM
never sees the X-ray for report generation. It receives a deterministic
*findings block* built from the stored metrics, and is constrained to it.

### 11.2 Core Rules (`services/llm/prompts.js`)

Defined once and inherited by all three features:

1. **Use only the supplied numbers.** Every value must appear verbatim in the
   findings block. Nothing invented.
2. **No diagnosis.** Describe the measurement against its reference range; never
   "the patient has"; never a prognosis.
3. **No treatment advice.** No drugs, procedures, exercises, or further imaging.
4. **Confidence is measurement quality**, not diagnostic certainty — and must be
   described as such wherever mentioned.
5. **Normal is a result.** Don't manufacture concern.
6. **No patient details.** No age, sex, history or symptoms exist. Don't invent any.
7. **Don't break a measurement down further than it was made.** Some
   measurements describe a whole segment and have no per-vertebra value.
8. **Respect the caveats.** Never present a measurement as more certain than its
   caveats allow.

### 11.3 The Three Features

| Feature | Endpoint | Grounding | Cache key |
|---|---|---|---|
| **Audience toggle** | `GET /report?audience=` | Same findings, different register | `scan.reports[audience]` |
| **Ask about this scan** | `POST /ask` | Only that scan's findings; unmeasured → "that wasn't measured" | not cached (rate limited) |
| **Explain this overlay** | `GET /explain/:condition` | Scoped to one condition's metrics | `scan.explanations[condition:audience]` |

**Audience registers:**

- *Patient* — plain language, every piece of jargon expanded on first use,
  calm and matter-of-fact.
- *Clinician* — standard radiological terminology unexpanded, terse and
  information-dense, method stated precisely.

**Q&A boundary:** explaining what a term *means* in general is allowed and
encouraged; asserting anything about this patient beyond the measurements is
not. This is what keeps the feature useful instead of refusing everything.

### 11.4 Report Structure

Fixed sections: **Summary → Measurements → What This Means → Measurement
Limitations → Next Steps**, followed by the educational-tool disclaimer.
The *Measurement Limitations* section is mandatory and reproduces every caveat.

### 11.5 Streaming

`?stream=1` returns server-sent events. The client uses `fetch` rather than
`EventSource` — `EventSource` cannot send an `Authorization` header — and
retries once against a refreshed token. Headers are sent before the first token,
so a mid-stream failure is reported as an `error` frame, not a status code.

### 11.6 Fallback

With no `OPENAI_API_KEY`, `templateReport()` renders the same sections directly
from the measured values: deterministic, number-accurate, and never a fabricated
finding. The Q&A and explanation endpoints return `503` rather than degrading.

### 11.7 Cost Control

- **Cached** — report variants and explanations stored on the Scan; the pipeline
  writes its report to `reports.patient` so the default view is a cache hit.
- **Metered** — 12 requests / minute / user, in-memory fixed window.
- **On demand** — overlay explanations only generated when the user clicks.

---

## 12. Frontend — Pages & Components

### 12.1 Route Table (`App.jsx`)

| Path | Element | Guard |
|---|---|---|
| `/` | Redirect → `/dashboard` | — |
| `/login` | `LoginPage` | — |
| `/register` | `RegisterPage` | — |
| `/dashboard` | `DashboardPage` | `ProtectedRoute` |
| `*` | Redirect → `/dashboard` | — |

`ProtectedRoute` renders `<Outlet/>` when `authStore.user` exists, else
`<Navigate to="/login" state={{from}} replace/>`.

**Provider tree** (`main.jsx`):
`ErrorBoundary → QueryClientProvider → RouterProvider` + `Toaster`.
Query defaults: `retry: 1`, `refetchOnWindowFocus: false`.

### 12.2 Page 1 — Login (`/login`)

```
┌──────────────────────────────────────────┐
│              🦴 SPINE VISION             │
│         AI LUMBAR DIAGNOSTICS            │
│   ┌────────────────────────────────┐     │
│   │ Email          [____________]  │     │
│   │ Password       [____________]  │     │
│   │        [    Sign in    ]       │     │
│   │  Don't have an account? Register│    │
│   └────────────────────────────────┘     │
│  "Spine Vision is an educational tool…"  │
└──────────────────────────────────────────┘
```

- Full-viewport centred card on a dark gradient with an animated spine backdrop.
- React Hook Form validation: email pattern, password ≥ 8 characters.
- On success → tokens to store → `navigate("/dashboard")`.
- On `401` → toast *"Invalid email or password"* — never reveals which field.
- A request with **no response** is reported as *"Cannot reach the server"*
  rather than a credential error, so connectivity problems aren't misdiagnosed.

### 12.3 Page 2 — Register (`/register`)

Same layout plus **Name** and **Confirm password**. On success the user is sent
to `/login` with a toast; registration does not auto-authenticate.

### 12.4 Page 3 — Dashboard (`/dashboard`)

```
┌────────────────────────────────────────────────────────────────────┐
│ 🦴 SPINE VISION                            [User] [Logout]         │  Navbar
├────────────────────────────────────────────────┬───────────────────┤
│                                                │                   │
│   ┌──────────────────────────────────┐         │  ASK ABOUT THIS   │
│   │ ① LUMBAR X-RAY                   │         │  SCAN         [×] │
│   │   ┌──────────────────────────┐   │         │                   │
│   │   │  Drop X-ray / browse     │   │         │  ┌─────────────┐  │
│   │   └──────────────────────────┘   │         │  │ suggestion  │  │
│   │ ② SEGMENTATION MASK              │         │  └─────────────┘  │
│   │   ✨ Generated automatically      │         │                   │
│   │   — or (Developer only) —        │         │  user message     │
│   │   ┌──────────────────────────┐   │         │  assistant reply  │
│   │   │  Upload mask JSON        │   │         │                   │
│   │   └──────────────────────────┘   │         │                   │
│   │  SUPPORTED  PNG JPG DICOM        │         │                   │
│   │  </> DEVELOPER ONLY  [off]       │         │  ┌─────────────┐  │
│   │  AI WILL ANALYZE …               │         │  │ ask…    [↵] │  │
│   │  ┌──────────────────────────┐    │         │  └─────────────┘  │
│   │  │ thumb  file.jpg  363 KB  │    │         │                   │
│   │  │      [ ✨ Proceed ]       │    │        │                   │
│   │  └──────────────────────────┘    │         │                   │
│   └──────────────────────────────────┘         │                   │
│                                                │                   │
│ ┌────────────────────────────────────────────┐ │                   │
│ │ ORIGINAL X-RAY      [mask] [−][+][reset]   │ │                   │
│ │        (zoom/pan canvas + polygon overlay) │ │                   │
│ └────────────────────────────────────────────┘ │                   │
│ ┌────────────────────────────────────────────┐ │                   │
│ │ DIAGNOSTIC HEATMAPS           3 conditions │ │                   │
│ │  [overlay] [overlay] [overlay]             │ │                   │
│ └────────────────────────────────────────────┘ │                   │
│ ┌────────────────────────────────────────────┐ │                   │
│ │ MEDICAL REPORT                             │ │                   │
│ │ [Patient|Clinician]        [Download PDF]  │ │                   │
│ │ ## Summary … ## Measurements … tables …    │ │                   │
│ └────────────────────────────────────────────┘ │                   │
├────────────────────────────────────────────────┴───────────────────┤
│ Spine Vision is an educational tool…                               │  Footer
└────────────────────────────────────────────────────────────────────┘
```

Sections below the upload card render only when `activeScanId` is set.

### 12.5 Component Catalogue

#### Upload

| Component | Responsibility |
|---|---|
| `UploadZone` | Two-step upload UI. Step 1 X-ray dropzone (PNG/JPG/DICOM, ≤ 10 MB). Step 2 either *"Generated automatically"* or, in developer mode, a mask-JSON dropzone. Hosts the **Developer only** switch. |
| `UploadPreview` | Thumbnail + filename + size, remove button, and the action button: **Proceed** (normal) or **Analyze** (developer, disabled until a mask is staged). |

**The two paths are mutually exclusive by construction:** the presence of an
uploaded mask sets `maskSource: "user"`, which is what makes the pipeline skip
stage 2. Leaving developer mode clears any staged mask.

#### Dashboard

| Component | Responsibility |
|---|---|
| `OriginalXray` | Zoom/pan viewer (`react-zoom-pan-pinch`) with a canvas overlay drawing the mask polygons and level labels. Toggle button, zoom in/out/reset. |
| `HeatmapGallery` | Responsive grid (1/2/3 cols) of diagnostic overlays with severity badge, quality figure and truncated summary. Click → modal with full-size overlay, per-level table, grading scale, collapsible caveats, and an on-demand **"What am I looking at?"** explanation. |
| `ReportPanel` | Markdown report with custom dark renderers. Patient/Clinician toggle, streaming with a blinking cursor, client-side PDF export via `html2pdf.js`. |
| `AskDock` | Right-hand assistant dock. Collapsed = floating launcher; open = full-height panel with suggestions, thread, and input. Escape closes; below `lg` it overlays with a dismissable backdrop. Thread resets when the scan changes. |
| `ScanHistory` | Past scans beneath the upload card — thumbnail, filename, date and status badge. Clicking one sets `activeScanId`, the same state a fresh upload sets, so history and upload reach the result panels by one path. |
| `DiagnosisStepper` | Pipeline progress at the top of the results panel: Upload → Segment → Diagnose → Report. Completed stages show a check, the active one pulses. Driven by the 3s status poll. |

#### Layout, Common & UI

| Component | Responsibility |
|---|---|
| `Navbar` | Sticky header (`h-14`, `z-30`) with brand, user name and logout |
| `ProtectedRoute` | Session guard |
| `Disclaimer` | Educational-tool notice in the footer |
| `AuthedImage` | Fetches images with the Bearer header and renders them as blob URLs — required because `<img src>` cannot send auth headers |
| `SpineBackdrop` / `VideoPanel` | Decorative animated background (`fixed`, `pointer-events-none`) |
| `ErrorBoundary` | Catches render errors at the root |
| `Loader` / `Skeleton` | Loading placeholders |
| `Badge` | Severity pill, styled per level |
| `Button`, `Card`, `Input`, `Modal` | Design-system primitives |

### 12.6 Mask Rendering (`lib/mask.js`)

A browser-side mirror of the Python `load_vertebrae`. Accepts both COCO and
Spine Vision formats, flat or paired coordinates, normalises to 0–1 using the
mask's own recorded dimensions (or the image's natural size), sorts
superior→inferior, and normalises labels (`l1` → `L1`).

---

## 13. State Management

### 13.1 Division of Responsibility

| Concern | Owner | Rationale |
|---|---|---|
| Session, tokens | Zustand `authStore` | Client state, needed synchronously by interceptors |
| Selected scan, staged files, UI flags | Zustand `diagnosisStore` | Pure client state |
| Scan status, result, history | TanStack Query | Server state — caching, polling, invalidation |

**Server-fetched data is never stored in Zustand.**

### 13.2 `authStore`

| Field / action | Notes |
|---|---|
| `user` | Rehydrated from `localStorage` on load |
| `accessToken` | **Memory only** — never persisted |
| `refreshToken` | `localStorage` (dev fallback) |
| `setSession`, `setTokens`, `logout` | Logout clears both storage keys |

### 13.3 `diagnosisStore`

| Field | Purpose |
|---|---|
| `activeScanId` | Scan rendered in the results panel |
| `pendingFile` / `pendingMask` | Staged uploads (clearing the X-ray clears the mask) |
| `showMask` | Mask overlay toggle |
| `audience` | `patient` \| `clinician` — shared by report, Q&A and explanations so all three speak in one register |
| `askOpen` | Assistant dock open state |
| `devMode` | Developer path; toggling off drops the staged mask |

### 13.4 Query Keys & Polling

| Key | Source | Behaviour |
|---|---|---|
| `["scan-status", scanId]` | `/status` | `refetchInterval: 3000` until terminal; `refetchIntervalInBackground: true` |
| `["scan-result", scanId]` | `/result` | Enabled only when status is `complete`; `staleTime: Infinity` |
| `["scan-history"]` | `/history` | `staleTime: 10s`; invalidated after upload and on completion |

---

## 14. Configuration Reference

### 14.1 Backend (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5001` | API port (**not 5000** — macOS AirPlay holds it) |
| `NODE_ENV` | `development` | Controls error verbosity |
| `MONGODB_URI` | `mongodb://localhost:27017/spinevision` | Primary DB target |
| `USE_EMBEDDED_MONGO` | `true` | Start an embedded `mongod` if the URI is unreachable |
| `EMBEDDED_MONGO_PORT` | `27018` | Embedded instance port |
| `EMBEDDED_MONGO_DBPATH` | `./.mongo-data` | Persistent data path |
| `JWT_SECRET` | — | Access token secret (256-bit hex) |
| `JWT_REFRESH_SECRET` | — | Refresh token secret (**different**) |
| `ACCESS_TOKEN_EXPIRY` | `15m` | |
| `REFRESH_TOKEN_EXPIRY` | `7d` | |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allow-list |
| `UPLOAD_DIR` | `./uploads` | Upload root |
| `MAX_UPLOAD_BYTES` | `10485760` | 10 MB |
| `PYTHON_PATH` | `../ml/venv/bin/python3` | Resolved against `backend/` |
| `ML_DIR` | `../ml` | Resolved against `backend/` |
| `ML_ENABLED` | `true` | Run the real diagnostic scripts (stage 3) |
| `SEGMENTATION_ENABLED` | `true` | Run `segment.py` when no mask is uploaded (stage 2) |
| `SEGMENTATION_WEIGHTS` | `models/best.pt` | Checkpoint, relative to `ML_DIR` |
| `SEGMENTATION_TIMEOUT_MS` | `180000` | |
| `ML_SCRIPT_TIMEOUT_MS` | `120000` | Per diagnostic script |
| `OPENAI_API_KEY` | — | Unset → template report, `503` for Q&A |
| `OPENAI_MODEL` | `gpt-4o` | |
| `OPENAI_BASE_URL` | — | Any OpenAI-compatible endpoint (reseller/gateway) |
| `LLM_INCLUDE_IMAGES` | `false` | Attach overlays for a multimodal model |
| `LLM_TIMEOUT_MS` | `60000` | |

### 14.2 Frontend (`frontend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5001` | API origin |
| `VITE_USE_MOCK` | `false` | `"true"` serves an in-browser fake backend (no server needed) |

Two frontend constants gate features alongside the server:
`SEGMENTATION_AVAILABLE` and `SEGMENTATION_ENABLED` are checked
**independently**, so flipping only the UI flag cannot bypass the backend rule.

### 14.3 Notable Configuration Decisions

- **Port 5001** — macOS AirPlay Receiver occupies 5000.
- **Embedded MongoDB** — `config/db.js` tries `MONGODB_URI`, then joins an
  existing embedded instance, then starts one on 27018 with persistent storage.
- **`nodemon.json` ignores `uploads/`** — without it, writing `mask.json` into
  the watched tree restarts the server mid-pipeline and orphans the scan.
- **Base font 25px** (`globals.css`) — every size is in rem, so type, spacing,
  max-widths and the assistant dock all scale from this one value.

---

## 15. Running the System

### 15.1 One-Time Setup

```bash
# Python environment
cd ml
python3 -m venv venv
venv/bin/pip install -r requirements.txt
# place the checkpoint at ml/models/best.pt (git-ignored, supplied separately)

# Node dependencies
cd ../backend  && npm install
cd ../frontend && npm install

# Configuration
cd ../backend && cp .env.example .env    # then fill in the secrets
```

### 15.2 Running

```bash
# Terminal 1 — API on http://localhost:5001
cd backend && npm run dev

# Terminal 2 — UI on http://localhost:5173
cd frontend && npm run dev
```

MongoDB needs no separate step: if `MONGODB_URI` is unreachable the server
starts its own `mongod` on port 27018 with data in `backend/.mongo-data/`.

### 15.3 Demo Account

```bash
cd backend && npm run seed
# demo@spinevision.dev / spinevision
```

Safe to run while the server is up — it joins the same embedded instance.

### 15.4 Running the ML Scripts Directly

```bash
# Segmentation
ml/venv/bin/python ml/segment.py \
  --image path/to/xray.jpg --output /tmp/mask.json

# One diagnostic
ml/venv/bin/python ml/scripts/diagnose_compression_fracture.py \
  --image path/to/xray.jpg --mask /tmp/mask.json --output /tmp/out.png
```

### 15.5 npm Scripts

| Location | Script | Effect |
|---|---|---|
| backend | `npm run dev` | nodemon with `nodemon.json` |
| backend | `npm start` | plain `node server.js` |
| backend | `npm run seed` | create the demo account |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run build` | production build to `dist/` |
| frontend | `npm run preview` | serve the built bundle |

---

## 16. Diagram Source Material

Condensed inputs for UML work.

### 16.1 Use Case Diagram

**Actors:** Guest · Registered User · Developer (specialised User) ·
Segmentation Model · Diagnostic Engine · LLM Provider (external systems)

| Use case | Primary actor | Includes / Extends |
|---|---|---|
| Register account | Guest | — |
| Log in | Guest | — |
| Refresh session | System | «include» in every authenticated use case |
| Upload X-ray | User | «include» Validate file |
| Generate mask automatically | User | «include» Run segmentation |
| Upload mask manually | Developer | «extend» Upload X-ray |
| Run diagnostic analysis | System | «include» Run 3 scripts |
| Generate report | System | «include» Call LLM; «extend» Fall back to template |
| View results | User | «include» View overlays, View report |
| Switch report audience | User | «extend» View results |
| Ask about scan | User | «extend» View results |
| Explain overlay | User | «extend» View overlays |
| Download PDF | User | «extend» View report |
| View scan history | User | «extend» View results |

### 16.2 Class Diagram — Backend

```
«entity» User                    «entity» Scan
─────────────────                ────────────────────────────
- _id: ObjectId                  - _id: ObjectId
- name: String                   - userId: ObjectId
- email: String                  - status: StatusEnum
- passwordHash: String           - originalPath: String
─────────────────                - maskJson: Object
+ toPublic(): PublicUser         - maskSource: SourceEnum
                                 - heatmaps: Heatmap[]
                                 - reportMarkdown: String
                                 - reports: Map
                                 - explanations: Map
                                 - failureReason: String

«value» Heatmap                  «service» AuthService
──────────────────               ─────────────────────────────
- condition: String              + hashPassword(pw)
- imagePath: String              + signTokens(user)
- severity: SeverityEnum         + verifyAccessToken(t)
- confidence: Number             + registerUser(dto)
- metrics: Object                + loginUser(dto)
- summary: String                + refreshSession(token)
- caveats: String[]

«service» PipelineRunner         «service» LlmReportService
─────────────────────────        ──────────────────────────────
+ run(scanId): void              + generateReport(scan, opts)
+ failInterruptedScans()         + streamReport(scan, opts)
- setStatus(id, status)          + templateReport(findings)

«bridge» SegmentationBridge      «bridge» DiagnosisBridge
──────────────────────────       ─────────────────────────────
+ runSegmentation(opts)          + runAll(opts): Heatmap[]
                                 - DIAGNOSTIC_SCRIPTS: Config[]

«service» LlmAssistService       «adapter» LlmClient
──────────────────────────       ─────────────────────────
+ answerQuestion(scan, q)        + chat(opts): string
+ explainOverlay(scan, cond)     + chatStream(opts): AsyncGen
                                 + llmConfigured(): boolean
```

**Relationships:** `User 1 ──< * Scan` · `Scan 1 ──<> * Heatmap` (composition) ·
`PipelineRunner → SegmentationBridge, DiagnosisBridge, LlmReportService` ·
`LlmReportService, LlmAssistService → LlmClient` ·
`Controllers → Services → Models`.

### 16.3 Sequence Diagrams to Draw

1. **Registration** — §7.2
2. **Login** — §7.3
3. **Token refresh on 401** — §7.4
4. **Upload with auto-segmentation** — §8.1 (the main one)
5. **Upload with manual mask** — as §8.1 minus the `segment.py` call
6. **Report streaming (SSE)** — Client → `GET /report?stream=1` → controller →
   `streamReport` → `chatStream` → provider; deltas flow back frame by frame;
   the finished text is cached on the Scan
7. **Grounded Q&A** — Client → `POST /ask` → rate limiter → `findOwnedScan` →
   `buildFindingsBlock` → `chat` → answer
8. **Restart recovery** — boot → `connectDb` → `failInterruptedScans` → update

### 16.4 Activity / Flowchart Candidates

- Two mask paths decision — §8.3
- Scan status state machine — §5.4
- Compression-fracture corner detection (rotate → band → corners → ratio → band)
- LLM fallback (key present? → stream/chat; else → template)

### 16.5 Component / Deployment Diagram

**Nodes:** Browser · Node process (:5001) · MongoDB (:27018 embedded) ·
Python subprocesses (short-lived) · File system · External LLM (HTTPS)

**Interfaces:** REST/JSON · multipart/form-data · `text/event-stream` ·
`execFile` + stdout JSON · Mongoose wire protocol · HTTPS

### 16.6 Key Numbers for the Report

| Metric | Value |
|---|---|
| Application source | ~6,400 lines |
| Backend modules | 28 |
| Frontend modules | 39 |
| Python modules | 5 |
| REST endpoints | 13 (4 auth, 5 scan, 3 AI, 1 health) — see §6 |
| Mongo collections | 2 |
| Pipeline stages | 4 |
| Conditions measured | 3 |
| Segmentation classes | 5 (L1–L5) |
| Model size | ~45 MB |
| Segmentation time | ≈ 4–6 s |
| Diagnostic time | < 1 s |
| Report generation | ≈ 20 s |
| Rate limit | 12 AI req/min/user |

---

## 17. Known Limitations

Stated plainly, because an honest report needs them.

### 17.1 DICOM Is Accepted but Cannot Be Processed

`.dcm` passes upload validation on both sides — `ACCEPTED_FILES` in
`lib/constants.js` lists it, and `ALLOWED_IMAGE` in `middleware/upload.js`
accepts `application/dicom` — but **nothing downstream can read one**. There is
no DICOM decoder in the ML layer, so the file is stored, the Scan document is
created, and the pipeline then fails at `io_helpers.load_image()`, where
`cv2.imread` returns `None` and raises `Could not read image: …`.

The user sees a scan that failed for an opaque reason several seconds after an
upload the UI told them was fine. Validation should reject the format outright
until a decoder (`pydicom` → array → the existing path) is wired in, which would
also be the natural place to add the magic-byte check that extension/MIME
filtering does not give.

### 17.2 Measurement Method Caveats

- **Spondylolisthesis is measured centroid-to-centroid**, not from the posterior
  vertebral corners as in a manual Meyerding grading. Normal lumbar lordosis
  shifts centroids horizontally on its own, so part of any measured offset
  reflects the spinal curve rather than a true slip. **This produces G1/G2
  findings on anatomically normal spines** and is the most significant accuracy
  limitation in the system.
- **Lordosis** is a tangent difference on a curve fitted through centroids, not
  an endplate-to-endplate Cobb angle; it will not match a radiologist's number.
- **Compression fracture** assumes a lateral projection with the patient facing
  image left. A flipped or AP radiograph inverts the anterior/posterior
  assignment and makes the ratio meaningless.
- **All measurements are in image pixels** with no DICOM spacing applied, so
  radiographic magnification and positioning are uncorrected.
- A wedged vertebra is not specific to acute fracture — old healed fractures,
  congenital variants and osteoporotic remodelling all produce it.

### 17.3 Architectural

- **Single-process pipeline.** No job queue; concurrency is bounded by the box.
  A restart fails in-flight scans rather than resuming them.
- **In-memory rate limiting.** Resets on restart, does not span instances.
- **Refresh token in `localStorage`.** A development convenience; production
  should use an httpOnly cookie.
- **Upload validation is by extension and MIME type only** — no magic-byte
  check, so a renamed file is caught by the decoder rather than the filter
  (see 17.1).
- **No automated test suite.** Verification to date has been manual and
  browser-driven.

### 17.4 Model

The checkpoint measured well against hand annotations on the validation image
used during development, but **no systematic evaluation across the full test
split has been run** through this pipeline. `runs/segment/*/results.csv` from
earlier training attempts recorded very few epochs; the shipped `best.pt`
performs substantially better than those logs suggest.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Lordosis** | The natural inward curve of the lumbar spine |
| **Spondylolisthesis** | Forward or backward slip of one vertebra relative to the one below |
| **Anterolisthesis** | Slip in the forward (anterior) direction |
| **Retrolisthesis** | Slip in the backward (posterior) direction |
| **Meyerding grade** | Standard 1–4 scale for slip severity, by percentage displacement |
| **Compression fracture** | Collapse of a vertebral body, typically anteriorly (wedging) |
| **Cobb angle** | Standard radiographic spinal curvature measurement, endplate to endplate |
| **Sagittal** | The side-view plane — what a lateral X-ray shows |
| **Lateral (LA) view** | Radiograph taken from the side |
| **Endplate** | The flat top/bottom surface of a vertebral body |
| **Centroid** | Geometric centre of a polygon |
| **COCO format** | Common Objects in Context — standard JSON annotation schema |
| **Segmentation mask** | Per-object pixel outline, here one polygon per vertebra |
| **IoU / mAP** | Standard detection/segmentation accuracy metrics |
| **SSE** | Server-Sent Events — one-way server→client streaming over HTTP |
| **JWT** | JSON Web Token — signed, self-contained auth credential |

---

*Spine Vision is an educational tool. It is not a substitute for professional
medical diagnosis.*
