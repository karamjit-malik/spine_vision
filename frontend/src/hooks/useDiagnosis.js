import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getScanHistory,
  getScanResult,
  getScanStatus,
  uploadXray,
} from "@/api/diagnosis";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { TERMINAL_STATUSES } from "@/lib/constants";

/** Upload mutation — returns a scanId and makes that scan active. */
export function useUploadScan() {
  const queryClient = useQueryClient();
  const { setActiveScanId, clearPendingFile } = useDiagnosisStore();

  return useMutation({
    mutationFn: ({ file, mask }) => uploadXray(file, mask),
    onSuccess: (data, variables) => {
      setActiveScanId(data.scanId);
      clearPendingFile();
      queryClient.invalidateQueries({ queryKey: ["scan-history"] });
      toast.success(
        variables.mask
          ? "X-ray and mask uploaded — analysis started"
          : "X-ray uploaded — generating the mask, then analysing"
      );
    },
    onError: (error) => {
      toast.error(error.response?.data?.message ?? "Upload failed");
    },
  });
}

/** Poll status every 3s until the pipeline reaches a terminal state. */
export function useScanStatus(scanId) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["scan-status", scanId],
    queryFn: () => getScanStatus(scanId),
    enabled: Boolean(scanId),
    refetchInterval: (q) =>
      TERMINAL_STATUSES.includes(q.state.data?.status) ? false : 3000,
    // A scan takes longer than a user's attention span. Without this, polling
    // pauses whenever the tab loses focus and the stepper sits frozen on the
    // stage it had reached when they switched away.
    refetchIntervalInBackground: true,
  });

  const status = query.data?.status;

  useEffect(() => {
    if (!status || !TERMINAL_STATUSES.includes(status)) return;
    // Pipeline finished: pull the result and refresh the history badge.
    queryClient.invalidateQueries({ queryKey: ["scan-result", scanId] });
    queryClient.invalidateQueries({ queryKey: ["scan-history"] });
  }, [status, scanId, queryClient]);

  return query;
}

/** Full result — only fetched once the scan is complete. */
export function useScanResult(scanId, status) {
  return useQuery({
    queryKey: ["scan-result", scanId],
    queryFn: () => getScanResult(scanId),
    enabled: Boolean(scanId) && status === "complete",
    staleTime: Infinity,
  });
}

export function useScanHistory() {
  return useQuery({
    queryKey: ["scan-history"],
    queryFn: () => getScanHistory(),
    staleTime: 10_000,
  });
}
