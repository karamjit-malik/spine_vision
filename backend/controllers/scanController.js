import fs from "fs";
import path from "path";
import { Scan } from "../models/Scan.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { isInsideUploads } from "../utils/fileUtils.js";
import { env } from "../config/env.js";
import * as pipelineRunner from "../services/pipelineRunner.js";
import { generateReport, streamReport } from "../services/llmReportService.js";
import { answerQuestion, explainOverlay } from "../services/llmAssistService.js";
import { DEFAULT_AUDIENCE, isAudience } from "../services/llm/prompts.js";

/** Public URL for a file belonging to a scan. */
const imageUrl = (scanId, filePath) =>
  `/api/scan/image/${scanId}/${path.basename(filePath)}`;

export const uploadScan = asyncHandler(async (req, res) => {
  const image = req.files?.file?.[0];
  const mask = req.files?.mask?.[0];

  if (!image) throw ApiError.badRequest("No image file received");

  // Automatic segmentation is not available yet, so a mask has to come with the
  // X-ray. Rejecting here — rather than letting the pipeline fail — means the
  // user finds out before a Scan document and a spinning stepper exist.
  if (!mask && !env.segmentationEnabled) {
    throw ApiError.badRequest(
      "A segmentation mask is required. Automatic mask generation is coming soon — " +
        "for now, upload the mask JSON alongside the X-ray."
    );
  }

  const maskJson = mask ? readMask(mask.path) : null;

  const scan = await Scan.create({
    // Multer already minted this id to build the upload path; reusing it keeps
    // uploads/{userId}/{scanId}/ matching the document rather than being one
    // ObjectId off, which makes the directories traceable by eye.
    _id: req.scanId,
    userId: req.user.userId,
    status: "uploaded",
    originalPath: image.path,
    originalName: image.originalname,
    maskJson,
    maskSource: mask ? "user" : "model",
    maskName: mask?.originalname ?? null,
  });

  // Fire-and-forget: the request returns immediately, the client polls status.
  pipelineRunner.run(scan._id).catch((error) =>
    console.error("[pipeline] unhandled", error)
  );

  res.status(202).json({
    success: true,
    data: { scanId: scan._id, status: scan.status },
  });
});

export const getStatus = asyncHandler(async (req, res) => {
  const scan = await findOwnedScan(req.params.id, req.user.userId, "status");
  res.status(200).json({
    success: true,
    data: { scanId: scan._id, status: scan.status, currentStep: scan.status },
  });
});

export const getResult = asyncHandler(async (req, res) => {
  const scan = await findOwnedScan(req.params.id, req.user.userId);

  res.status(200).json({
    success: true,
    data: {
      scanId: scan._id,
      status: scan.status,
      originalUrl: imageUrl(scan._id, scan.originalPath),
      fileName: scan.originalName,
      createdAt: scan.createdAt,
      maskJson: scan.maskJson ?? null,
      heatmaps: (scan.heatmaps ?? []).map((heatmap) => ({
        condition: heatmap.condition,
        severity: heatmap.severity,
        confidence: heatmap.confidence,
        summary: heatmap.summary ?? null,
        metrics: heatmap.metrics ?? null,
        caveats: heatmap.caveats ?? [],
        // Stub runs produce no overlay file — fall back to the original X-ray.
        imageUrl: heatmap.imagePath
          ? imageUrl(scan._id, heatmap.imagePath)
          : imageUrl(scan._id, scan.originalPath),
      })),
      reportMarkdown: scan.reportMarkdown,
      failureReason: scan.failureReason,
    },
  });
});

/**
 * The report for one audience, generated on demand and cached.
 *
 * `?stream=1` streams it as server-sent events so the panel fills in as the
 * model writes; anything else returns it whole. Either way the finished text is
 * stored, so switching audiences back and forth costs one call each, not one
 * call per switch.
 */
export const getReport = asyncHandler(async (req, res) => {
  const audience = audienceOf(req.query.audience);
  const scan = await findOwnedScan(req.params.id, req.user.userId);

  if (scan.status !== "complete") {
    throw ApiError.badRequest("The report is available once the scan completes");
  }

  const cached = scan.reports?.[audience];
  if (cached) {
    if (req.query.stream !== "1") {
      return res.status(200).json({ success: true, data: { audience, markdown: cached, cached: true } });
    }
    return sendEventStream(res, [cached], { audience, cached: true });
  }

  if (req.query.stream !== "1") {
    const markdown = await generateReport(scan, { audience });
    await cacheReport(scan._id, audience, markdown);
    return res.status(200).json({ success: true, data: { audience, markdown, cached: false } });
  }

  // Headers must go out before the first token, so failures after this point
  // are reported inside the stream rather than as a status code.
  openEventStream(res);
  let full = "";
  try {
    for await (const piece of streamReport(scan, { audience })) {
      full += piece;
      writeEvent(res, { type: "delta", text: piece });
    }
    await cacheReport(scan._id, audience, full);
    writeEvent(res, { type: "done", audience });
  } catch (error) {
    console.error("[report] stream failed", error.message);
    writeEvent(res, { type: "error", message: "The report stream was interrupted" });
  } finally {
    res.end();
  }
});

/** Answer a question about this scan, grounded in its measurements. */
export const askScan = asyncHandler(async (req, res) => {
  const scan = await findOwnedScan(req.params.id, req.user.userId);
  const result = await answerQuestion(scan, req.body?.question, {
    audience: audienceOf(req.body?.audience),
  });
  res.status(200).json({ success: true, data: result });
});

/** Explain what one diagnostic overlay is showing. Cached per condition. */
export const explainCondition = asyncHandler(async (req, res) => {
  const { condition } = req.params;
  const audience = audienceOf(req.query.audience);
  const scan = await findOwnedScan(req.params.id, req.user.userId);

  const key = `${condition}:${audience}`;
  const cached = scan.explanations?.[key];
  if (cached) {
    return res.status(200).json({ success: true, data: { condition, explanation: cached, cached: true } });
  }

  const { explanation } = await explainOverlay(scan, condition, { audience });
  await Scan.findByIdAndUpdate(scan._id, { [`explanations.${key}`]: explanation });
  res.status(200).json({ success: true, data: { condition, explanation, cached: false } });
});

export const getHistory = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const filter = { userId: req.user.userId };

  const [scans, total] = await Promise.all([
    Scan.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("status originalPath originalName createdAt")
      .lean(),
    Scan.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      scans: scans.map((scan) => ({
        scanId: scan._id,
        status: scan.status,
        fileName: scan.originalName,
        createdAt: scan.createdAt,
        originalUrl: imageUrl(scan._id, scan.originalPath),
      })),
      total,
      page,
    },
  });
});

/** Streams an image, but only to the user who owns the scan. */
export const getImage = asyncHandler(async (req, res) => {
  const scan = await findOwnedScan(req.params.scanId, req.user.userId, "originalPath");
  const filePath = path.join(path.dirname(scan.originalPath), req.params.filename);

  if (!isInsideUploads(filePath) || !fs.existsSync(filePath)) {
    throw ApiError.notFound("Image not found");
  }

  res.sendFile(path.resolve(filePath));
});

/**
 * Parse and sanity-check a user-supplied mask before any scan is created.
 *
 * Only the shape is checked here — that it holds at least one vertebra polygon.
 * The Python side does the real interpretation, but a mask that cannot possibly
 * work should fail as a 400 on upload, not as a failed scan two stages later.
 */
function readMask(maskPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(maskPath, "utf8"));
  } catch {
    throw ApiError.badRequest("The mask file is not valid JSON");
  }

  const polygons = parsed?.annotations?.length
    ? parsed.annotations.filter((entry) => entry?.segmentation?.[0]?.length >= 6)
    : (parsed?.vertebrae ?? []).filter((entry) => entry?.polygon?.length >= 3);

  if (!polygons.length) {
    throw ApiError.badRequest(
      "No vertebra outlines found in the mask. Expected COCO " +
        '{"annotations":[{"segmentation":[[...]]}]} or {"vertebrae":[{"polygon":[[x,y]...]}]}.'
    );
  }

  return parsed;
}

const audienceOf = (value) => (isAudience(value) ? value : DEFAULT_AUDIENCE);

const cacheReport = (scanId, audience, markdown) =>
  Scan.findByIdAndUpdate(scanId, { [`reports.${audience}`]: markdown }).catch((error) =>
    console.error("[report] could not cache", error.message)
  );

/* Server-sent events. Text/event-stream rather than a socket: one direction,
 * one request, and it survives the proxy in front of a deployed server. */

function openEventStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Without this an nginx in front of the app buffers the whole stream and
    // the point of streaming is lost.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}

const writeEvent = (res, payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

function sendEventStream(res, pieces, done) {
  openEventStream(res);
  for (const text of pieces) writeEvent(res, { type: "delta", text });
  writeEvent(res, { type: "done", ...done });
  res.end();
}

async function findOwnedScan(id, userId, select) {
  const query = Scan.findById(id);
  if (select) query.select(`${select} userId`);

  const scan = await query.lean();
  if (!scan) throw ApiError.notFound("Scan not found");
  if (String(scan.userId) !== String(userId)) throw ApiError.forbidden("Not your scan");
  return scan;
}
