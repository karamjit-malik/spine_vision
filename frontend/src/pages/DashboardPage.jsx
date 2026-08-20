import { AlertTriangle } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { UploadZone } from "@/components/upload/UploadZone";
import { UploadPreview } from "@/components/upload/UploadPreview";
import { OriginalXray } from "@/components/dashboard/OriginalXray";
import { HeatmapGallery } from "@/components/dashboard/HeatmapGallery";
import { ReportPanel } from "@/components/dashboard/ReportPanel";
import { AskDock } from "@/components/dashboard/AskDock";
import { ScanHistory } from "@/components/dashboard/ScanHistory";
import { DiagnosisStepper } from "@/components/dashboard/DiagnosisStepper";
import { SpineBackdrop } from "@/components/common/SpineBackdrop";
import { Skeleton } from "@/components/common/Loader";
import { useScanResult, useScanStatus } from "@/hooks/useDiagnosis";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const activeScanId = useDiagnosisStore((state) => state.activeScanId);
  const askOpen = useDiagnosisStore((state) => state.askOpen);
  const { data: statusData } = useScanStatus(activeScanId);
  const status = statusData?.status;
  const { data: result, isLoading: loadingResult } = useScanResult(activeScanId, status);

  return (
    <div className="relative min-h-screen">
      <SpineBackdrop src="/media/Spin.mp4" />

      <div className="relative z-10">
        <Navbar />

        {/* The dock is fixed, so on wide screens the page is inset to sit
            beside it rather than underneath. Below lg it overlays instead.
            The inset lives on an inner wrapper, not on <main>: putting it on
            the same element as px-6 makes two rules fight over padding-right,
            and the shorthand wins. Separate elements, no conflict. */}
        <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
          <div
            className={cn(
              "transition-[padding] duration-200",
              askOpen && "lg:pr-[25rem]"
            )}
          >
          <section className="flex min-h-[calc(100vh-16rem)] items-center justify-center">
            <div className="w-full max-w-lg space-y-4">
              <Card>
                <CardBody className="space-y-3">
                  <UploadZone />
                  <UploadPreview />
                </CardBody>
              </Card>

              {/* Past scans. Clicking one sets activeScanId, which is the same
                  state the upload flow sets, so a history entry and a fresh
                  upload land in the panels below by exactly the same path. */}
              <Card>
                <CardHeader title="Scan History" />
                <CardBody>
                  <ScanHistory />
                </CardBody>
              </Card>
            </div>
          </section>

          {activeScanId && (
            <div className="space-y-4 pb-4">
              {/* Defaults to "uploaded" so the first stage is lit while the
                  first status poll is still in flight, rather than the stepper
                  appearing blank for its first three seconds. */}
              <Card>
                <CardBody>
                  <DiagnosisStepper status={status ?? "uploaded"} />
                </CardBody>
              </Card>

              {status === "failed" && (
                <Card>
                  <CardBody className="flex items-center gap-2 text-xs text-ash-300">
                    <AlertTriangle size={14} />
                    The pipeline failed. Try re-uploading the image.
                  </CardBody>
                </Card>
              )}

              <Card>
                <CardHeader title="Original X-ray" />
                <CardBody>
                  {loadingResult || !result ? (
                    <Skeleton className="h-72 w-full" />
                  ) : (
                    <OriginalXray src={result.originalUrl} maskJson={result.maskJson} />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Diagnostic Heatmaps"
                  action={
                    <span className="text-xs text-ash-500">
                      {result?.heatmaps?.length ?? 0} conditions
                    </span>
                  }
                />
                <CardBody>
                  <HeatmapGallery heatmaps={result?.heatmaps ?? []} scanId={activeScanId} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Medical Report" />
                <CardBody>
                  <ReportPanel markdown={result?.reportMarkdown} scanId={activeScanId} />
                </CardBody>
              </Card>
            </div>
          )}
          </div>
        </main>

        <footer className="border-t border-ink-700 px-4 py-5">
          <div
            className={cn(
              "transition-[padding] duration-200",
              askOpen && "lg:pr-[25rem]"
            )}
          >
            <Disclaimer />
          </div>
        </footer>
      </div>

      {/* Only offered once there are measurements to ground answers in. */}
      {activeScanId && status === "complete" && <AskDock scanId={activeScanId} />}
    </div>
  );
}
