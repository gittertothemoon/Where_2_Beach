import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { track } from "../lib/analytics";
import { loadAttribution } from "../lib/attribution";
import type { AppAccount } from "../lib/account";
import { submitSharedReport } from "../lib/reports";
import { getReporterHash } from "../lib/storage";
import type {
  BeachLevel,
  CrowdLevel,
  Report,
  WaterLevel,
} from "../lib/types";
import {
  createReportAccountRequiredState,
  type AccountRequiredState,
} from "./accountRequiredUtils";

type SelectedBeachForReport = {
  id: string;
  name: string;
} | undefined;

type SubmitReportExtraOptions = {
  hasJellyfish?: boolean;
  hasAlgae?: boolean;
  hasRoughSea?: boolean;
  hasStrongWind?: boolean;
};

type UseReportSubmissionInput = {
  account: AppAccount | null;
  selectedBeach: SelectedBeachForReport;
  allowRemoteReports: boolean;
  reportDistanceM: number | null;
  reportRadiusM: number;
  tooSoonMessage: string;
  submitFailedMessage: string;
  applyAccountRequiredState: (nextState: AccountRequiredState) => void;
  setAccount: Dispatch<SetStateAction<AppAccount | null>>;
  setReports: Dispatch<SetStateAction<Report[]>>;
  setNow: Dispatch<SetStateAction<number>>;
  setReportOpen: Dispatch<SetStateAction<boolean>>;
  setReportThanksOpen: Dispatch<SetStateAction<boolean>>;
  onReportSubmitted?: (result: {
    awardedPoints: number;
    pointsBalance: number | null;
    reportId: string;
  }) => void;
};

type UseReportSubmissionOutput = {
  reportError: string | null;
  submittingReport: boolean;
  clearReportError: () => void;
  handleSubmitReport: (
    level: CrowdLevel,
    waterCondition?: WaterLevel,
    beachCondition?: BeachLevel,
    options?: SubmitReportExtraOptions,
  ) => void;
};

export const useReportSubmission = ({
  account,
  selectedBeach,
  allowRemoteReports,
  reportDistanceM,
  reportRadiusM,
  tooSoonMessage,
  submitFailedMessage,
  applyAccountRequiredState,
  setAccount,
  setReports,
  setNow,
  setReportOpen,
  setReportThanksOpen,
  onReportSubmitted,
}: UseReportSubmissionInput): UseReportSubmissionOutput => {
  const [reportError, setReportError] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  const clearReportError = useCallback(() => {
    setReportError(null);
  }, []);

  const handleSubmitReport = useCallback(
    (
      level: CrowdLevel,
      waterCondition?: WaterLevel,
      beachCondition?: BeachLevel,
      options?: SubmitReportExtraOptions,
    ) => {
      if (!selectedBeach || submittingReport) return;
      if (!account) {
        applyAccountRequiredState(
          createReportAccountRequiredState(selectedBeach.name),
        );
        setReportOpen(false);
        return;
      }
      if (
        !allowRemoteReports &&
        reportDistanceM !== null &&
        reportDistanceM > reportRadiusM
      ) {
        track("report_submit_blocked_geofence", { beachId: selectedBeach.id });
        return;
      }

      const reporterHash = getReporterHash();
      const attribution = loadAttribution() ?? undefined;
      setSubmittingReport(true);

      void submitSharedReport({
        beachId: selectedBeach.id,
        crowdLevel: level,
        waterCondition,
        beachCondition,
        hasJellyfish: options?.hasJellyfish,
        hasAlgae: options?.hasAlgae,
        hasRoughSea: options?.hasRoughSea,
        hasStrongWind: options?.hasStrongWind,
        reporterHash,
        attribution,
      })
        .then((result) => {
          if (result.ok) {
            setReports((prev) => {
              const deduped = prev.filter((report) => report.id !== result.report.id);
              return [result.report, ...deduped];
            });
            setNow(Date.now);
            setReportError(null);
            setReportOpen(false);
            setReportThanksOpen(true);
            track("report_submit_success", {
              beachId: selectedBeach.id,
              level,
            });
            if (result.rewards) {
              onReportSubmitted?.({
                ...result.rewards,
                reportId: result.report.id,
              });
            }
            return;
          }

          if (result.code === "too_soon") {
            setReportError(tooSoonMessage);
            track("report_submit_blocked_rate_limit", {
              beachId: selectedBeach.id,
            });
            return;
          }

          if (result.code === "account_required") {
            setAccount(null);
            setReportOpen(false);
            setReportError(null);
            applyAccountRequiredState(
              createReportAccountRequiredState(selectedBeach.name),
            );
            return;
          }

          setReportError(submitFailedMessage);
        })
        .finally(() => {
          setSubmittingReport(false);
        });
    },
    [
      account,
      allowRemoteReports,
      applyAccountRequiredState,
      reportDistanceM,
      reportRadiusM,
      selectedBeach,
      setAccount,
      setNow,
      setReportOpen,
      setReportThanksOpen,
      setReports,
      submitFailedMessage,
      submittingReport,
      tooSoonMessage,
      onReportSubmitted,
    ],
  );

  return {
    reportError,
    submittingReport,
    clearReportError,
    handleSubmitReport,
  };
};
