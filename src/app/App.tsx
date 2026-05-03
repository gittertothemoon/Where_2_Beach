import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import MapView from "../components/MapView";
import TopSearch from "../components/TopSearch";
import BottomSheet, { type BottomSheetSection } from "../components/BottomSheet";
import WeatherWidget from "../components/WeatherWidget";
import logo from "../assets/logo.png";
import splashBg from "../assets/initial-bg.png";
import { SPOTS, hasFiniteCoords } from "../data/spots";
import { STRINGS, subscribeToLanguage, getCurrentLanguage } from "../i18n/strings";
import {
  aggregateBeachStatsFromIndex,
  buildReportsIndex,
} from "../lib/aggregate";
import { distanceInMeters } from "../lib/geo";
import {
  clearOverride,
  clearOverrides,
  loadOverrides,
  setOverride,
} from "../lib/overrides";
import {
  formatConfidence,
  formatMinutesAgo,
} from "../lib/format";
import {
  type AppAccount,
} from "../lib/account";
import { getDevMockAccount } from "../lib/devMockAuth";
import {
  fetchAccountRewards,
  redeemBadge,
  claimMissionReward,
  claimDailyMissionReward,
  awardMockPoints,
  getMockBalance,
  unlockMockAchievement,
  completeMockMission,
  completeMockDailyMission,
  type AccountRewardsSummary,
  type GamificationCelebrationEvent,
} from "../lib/rewards";
import {
  loadActiveBadge,
  saveActiveBadge,
  type ActiveBadge,
} from "../lib/activeBadge";
import {
  ANALYTICS_UPDATE_EVENT,
  type AnalyticsSource,
  clearEvents,
  loadEvents,
  track,
} from "../lib/analytics";
import {
  ATTRIBUTION_UPDATE_EVENT,
  clearAttribution,
  extractAttributionParams,
  loadAttribution,
  upsertAttribution,
} from "../lib/attribution";
import {
  clearPerfStats,
  getPerfSnapshot,
  subscribePerf,
  useRenderCounter,
} from "../lib/perf";
import { normalizeSearchText } from "../lib/search";
import { fetchBeachReviews, submitBeachReview } from "../lib/reviews";
import { confirmReport } from "../lib/reports";
import { loadOwnReportIds, rememberOwnReportId } from "../lib/ownReports";
import type {
  BeachWithStats,
  CrowdLevel,
  Report,
  Review,
} from "../lib/types";
import type { BeachOverrides } from "../lib/overrides";
import { FEATURE_FLAGS } from "../config/features";
import {
  BEACH_FOCUS_ZOOM,
  BEACH_PROFILE_CACHE_TTL_MS,
  BOTTOM_NAV_FALLBACK_HEIGHT_PX,
  consumeRegisterResumeSnapshot,
  DEFAULT_CENTER,
  INITIAL_MAP_ZOOM,
  ITALY_BOUNDS,
  LIMITED_DATA_HIDE_THRESHOLD,
  LIMITED_DATA_SHOW_THRESHOLD,
  LOCATION_FOCUS_ZOOM,
  LOCATION_REFRESH_MS,
  MOCK_CROWD_LEVELS,
  NEARBY_RADIUS_M,
  PUBLIC_FALLBACK_AUTHOR_NAME,
  readQueryBooleanFlag,
  REMOTE_REPORT_SESSION_KEY,
  REPORT_RADIUS_M,
  REPORTS_FEED_ERROR_TOAST_GRACE_MS,
  SHOW_ALL_PINS_FLY_DURATION_S,
  SHOW_ALL_PINS_ZOOM_OUT_DELTA,
  SHOW_ALL_PINS_ZOOM_TRIGGER,
  type RegisterResumeMapView,
} from "./appState";
import {
  buildFavoriteBeachesForSheet,
  buildProfileFavoriteBeaches,
  computeLimitedDataPredRatio,
  mergeSelectedBeachWithProfile,
  resolveAuthorName,
  sortBeachesByDistanceThenName,
} from "./appSelectors";
import {
  buildRegisterRedirectUrl,
  buildRegisterResumeSnapshot,
  persistRegisterResumeSnapshot,
  type RegisterNavigationOptions,
} from "./authGateUtils";
import {
  createFavoriteAccountRequiredState,
  createReportAccountRequiredState,
  createResetAccountRequiredState,
  type AccountRequiredReason,
  type AccountRequiredState,
} from "./accountRequiredUtils";
import { useBeachProfiles } from "./useBeachProfiles";
import { useBeachWeather } from "./useBeachWeather";
import { useBeachPredictions } from "./useBeachPredictions";
import { useAccountSync } from "./useAccountSync";
import { useAccountActions } from "./useAccountActions";
import { useGeoLocation } from "./useGeoLocation";
import { useReportSubmission } from "./useReportSubmission";
import { useReportsFeed } from "./useReportsFeed";

const LidoModalCard = lazy(() => import("../components/LidoModalCard"));
const ReviewModal = lazy(() => import("../components/ReviewModal"));
const ReportModal = lazy(() => import("../components/ReportModal"));
const ReportThanksModal = lazy(() => import("../components/ReportThanksModal"));
const PerformanceOverlay = lazy(() => import("../components/PerformanceOverlay"));
const AccountRequiredModal = lazy(() => import("../components/AccountRequiredModal"));
const ProfileModal = lazy(() => import("../components/ProfileModal"));
const BadgeCelebrationModal = lazy(() => import("../components/BadgeCelebrationModal"));
const GamificationCelebrationModal = lazy(() => import("../components/GamificationCelebrationModal"));

type ToastTone = "info" | "success" | "error";

function App() {
  // Re-render when language changes (applyLanguage notifies subscribers)
  const [, forceUpdateLang] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeToLanguage(forceUpdateLang), []);

  const shouldSkipInitialSplash = useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return (
      readQueryBooleanFlag(params, "native_shell", "nativeShell") === true
    );
  }, []);
  const registerResumeSnapshot = useMemo(() => consumeRegisterResumeSnapshot(), []);
  const devMockAccount = useMemo(() => getDevMockAccount(), []);
  const [search, setSearch] = useState(() => registerResumeSnapshot?.search ?? "");
  const [reports, setReports] = useState<Report[]>([]);
  const [account, setAccount] = useState<AppAccount | null>(devMockAccount);
  const [favoriteBeachIds, setFavoriteBeachIds] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set<string>() : new Set(),
  );
  const [now, setNow] = useState(Date.now);
  const [overrides, setOverrides] = useState<BeachOverrides>(() =>
    typeof window === "undefined" ? {} : loadOverrides(),
  );
  const [selectedBeachId, setSelectedBeachId] = useState<string | null>(
    () => registerResumeSnapshot?.selectedBeachId ?? null,
  );
  const [soloBeachId, setSoloBeachId] = useState<string | null>(
    () => registerResumeSnapshot?.soloBeachId ?? null,
  );
  const [isLidoModalOpen, setIsLidoModalOpen] = useState(
    () => registerResumeSnapshot?.isLidoModalOpen ?? false,
  );
  const [pendingDeepLinkBeachId, setPendingDeepLinkBeachId] = useState<
    string | null
  >(null);
  const [deepLinkInfo, setDeepLinkInfo] = useState<{
    id: string | null;
    matched: boolean | null;
    params: {
      src?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
    };
  }>({ id: null, matched: null, params: {} });
  const [deepLinkWarning, setDeepLinkWarning] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(
    () => registerResumeSnapshot?.sheetOpen ?? false,
  );
  const [sheetDragActive, setSheetDragActive] = useState(false);
  const [activeSheetSection, setActiveSheetSection] = useState<BottomSheetSection>("map");
  const [bottomNavHeight, setBottomNavHeight] = useState(BOTTOM_NAV_FALLBACK_HEIGHT_PX);
  const [reportOpen, setReportOpen] = useState(
    () => registerResumeSnapshot?.reportOpen ?? false,
  );
  const [editPositions, setEditPositions] = useState(false);
  const [locationToast, setLocationToast] = useState<string | null>(null);
  const [locationToastTone, setLocationToastTone] = useState<ToastTone>("info");
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [accountRequiredOpen, setAccountRequiredOpen] = useState(false);
  const [accountRequiredReason, setAccountRequiredReason] = useState<AccountRequiredReason>("favorites");
  const [accountRequiredBeachName, setAccountRequiredBeachName] = useState<
    string | null
  >(null);
  const [pendingFavoriteBeachId, setPendingFavoriteBeachId] = useState<
    string | null
  >(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [rewardsSummary, setRewardsSummary] = useState<AccountRewardsSummary | null>(null);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [redeemingBadgeCode, setRedeemingBadgeCode] = useState<string | null>(null);
  const [activeBadge, setActiveBadge] = useState<ActiveBadge | null>(() => loadActiveBadge());
  const [celebrationBadge, setCelebrationBadge] = useState<ActiveBadge & { description: string } | null>(null);
  const [pendingGamification, setPendingGamification] = useState<GamificationCelebrationEvent[]>([]);
  const [claimingMission, setClaimingMission] = useState(false);
  const [claimingDailyMission, setClaimingDailyMission] = useState(false);
  const [missionReadyToast, setMissionReadyToast] = useState(false);
  const [rewardsBadgeDot, setRewardsBadgeDot] = useState(false);
  const rewardsSummaryRef = useRef<AccountRewardsSummary | null>(null);
  const confirmedReportIdsRef = useRef<Set<string>>(new Set());
  const validationDismissedIdsRef = useRef<Set<string>>(new Set());
  const ownReportIdsRef = useRef<Set<string>>(loadOwnReportIds());
  const [reportThanksOpen, setReportThanksOpen] = useState(false);
  const [lastReportReward, setLastReportReward] = useState<{ awardedPoints: number; newBalance: number | null } | null>(null);
  const [confirmRewardToast, setConfirmRewardToast] = useState<
    { awardedPoints: number; newBalance: number | null } | null
  >(null);
  const [reportsFeedReady, setReportsFeedReady] = useState(false);
  const [showLimitedDataNotice, setShowLimitedDataNotice] = useState(false);
  const [debugToast, setDebugToast] = useState<string | null>(null);
  const [debugRefreshKey, setDebugRefreshKey] = useState(0);
  const [perfSnapshot, setPerfSnapshot] = useState(() => getPerfSnapshot());
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showAllPinsHint, setShowAllPinsHint] = useState(false);
  const [splashPhase, setSplashPhase] = useState<
    "visible" | "fading" | "hidden"
  >(() => (shouldSkipInitialSplash ? "hidden" : "visible"));
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const nativeFirstPaintPostedRef = useRef(false);
  const resumeMapViewRef = useRef<RegisterResumeMapView | null>(
    registerResumeSnapshot?.mapView ?? null,
  );
  const didInitRef = useRef(false);
  const lastSelectedBeachIdRef = useRef<string | null>(null);
  const selectionSourceRef = useRef<AnalyticsSource | null>(null);
  const reportOpenRef = useRef(false);
  const deepLinkProcessedRef = useRef(false);
  const effectiveBottomNavHeight = Math.max(
    bottomNavHeight,
    BOTTOM_NAV_FALLBACK_HEIGHT_PX,
  );

  const postNativeFirstPaintReady = useCallback(() => {
    if (!shouldSkipInitialSplash) return;
    if (nativeFirstPaintPostedRef.current) return;
    if (typeof window === "undefined") return;
    const browserWindow = window as Window & {
      ReactNativeWebView?: { postMessage?: (payload: string) => void };
      __W2B_NATIVE_APP_READY?: boolean;
    };
    browserWindow.__W2B_NATIVE_APP_READY = true;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-native-app-ready", "1");
    }
    nativeFirstPaintPostedRef.current = true;
    try {
      browserWindow.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: "w2b-native-first-paint", ready: true, language: getCurrentLanguage() }),
      );
    } catch {
      // Ignore bridge post errors outside native shell.
    }
  }, [shouldSkipInitialSplash]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--bottom-nav-height",
      `${effectiveBottomNavHeight}px`,
    );
  }, [effectiveBottomNavHeight]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute(
      "data-sheet-open",
      sheetOpen || sheetDragActive ? "1" : "0",
    );
    return () => {
      document.documentElement.removeAttribute("data-sheet-open");
    };
  }, [sheetDragActive, sheetOpen]);

  const isDebug = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.location.pathname.startsWith("/debug") ||
      window.localStorage.getItem("br_debug_v1") === "1"
    );
  }, []);

  const useMockCrowd = useMemo(() => {
    if (typeof window === "undefined") return FEATURE_FLAGS.useMockCrowd;
    const params = new URLSearchParams(window.location.search);
    const queryOverride = readQueryBooleanFlag(
      params,
      "mockCrowd",
      "mock_crowd",
    );
    if (queryOverride !== null) return queryOverride;
    return FEATURE_FLAGS.useMockCrowd;
  }, []);

  const allowRemoteReports = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (FEATURE_FLAGS.forceRemoteReports) return true;
    if (window.sessionStorage.getItem(REMOTE_REPORT_SESSION_KEY) === "1") {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    const enabled =
      params.get("reportAnywhere") === "1" ||
      params.get("report_anywhere") === "1";
    if (enabled) {
      window.sessionStorage.setItem(REMOTE_REPORT_SESSION_KEY, "1");
    }
    return enabled;
  }, []);

  const effectiveEditMode = isDebug && editPositions;

  useRenderCounter("App", isDebug);

  useEffect(() => {
    if (!isDebug || typeof window === "undefined") return;
    const handleUpdate = () => setDebugRefreshKey((prev) => prev + 1);
    window.addEventListener(ANALYTICS_UPDATE_EVENT, handleUpdate);
    window.addEventListener(ATTRIBUTION_UPDATE_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(ANALYTICS_UPDATE_EVENT, handleUpdate);
      window.removeEventListener(ATTRIBUTION_UPDATE_EVENT, handleUpdate);
    };
  }, [isDebug]);

  useEffect(() => {
    if (!isDebug) return;
    setPerfSnapshot(getPerfSnapshot());
    return subscribePerf((snapshot) => setPerfSnapshot(snapshot));
  }, [isDebug]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (shouldSkipInitialSplash) return;
    const fadeTimeout = window.setTimeout(() => {
      setSplashPhase("fading");
    }, 2100);
    const hideTimeout = window.setTimeout(() => {
      setSplashPhase("hidden");
    }, 2500);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, [shouldSkipInitialSplash]);

  useEffect(() => {
    if (!shouldSkipInitialSplash) return;
    if (typeof window === "undefined") return;
    const browserWindow = window as Window & {
      __W2B_NATIVE_APP_READY?: boolean;
    };
    browserWindow.__W2B_NATIVE_APP_READY = false;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-native-app-ready", "0");
    }
    nativeFirstPaintPostedRef.current = false;
  }, [shouldSkipInitialSplash]);

  useEffect(() => {
    if (!shouldSkipInitialSplash) return;
    if (typeof window === "undefined") return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        postNativeFirstPaintReady();
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [postNativeFirstPaintReady, shouldSkipInitialSplash]);

  useEffect(() => {
    if (!mapReady) return;
    postNativeFirstPaintReady();
    // Prefetch lazy modal chunks so they are ready before the user taps a beach.
    void import("../components/LidoModalCard");
    void import("../components/ReportModal");
  }, [mapReady, postNativeFirstPaintReady]);

  useEffect(() => {
    console.info(`Loaded spots: ${SPOTS.length}`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    track("app_open");

    const searchParams = new URLSearchParams(window.location.search);
    const beachParam = searchParams.get("beach");
    const beachIdParam = searchParams.get("beachId");
    const deepLinkId =
      registerResumeSnapshot === null ? beachParam ?? beachIdParam : null;
    if (registerResumeSnapshot === null && deepLinkId) {
      setPendingDeepLinkBeachId(deepLinkId);
    }

    const attributionParams = extractAttributionParams(searchParams);
    setDeepLinkInfo({
      id: deepLinkId ?? null,
      matched: deepLinkId ? null : false,
      params: attributionParams,
    });
    setDeepLinkWarning(null);
    upsertAttribution(attributionParams);

    const srcParam = attributionParams.src;
    const utmSource = attributionParams.utm_source?.toLowerCase();
    const utmMedium = attributionParams.utm_medium?.toLowerCase();
    const utmCampaign = attributionParams.utm_campaign;
    const isQrOpen =
      Boolean(srcParam) || utmSource === "qr" || utmMedium === "poster";

    if (isQrOpen) {
      track("qr_open", { src: srcParam, utm_campaign: utmCampaign });
    }
  }, [registerResumeSnapshot]);

  useEffect(() => {
    if (!locationToast) return;
    const timeout = window.setTimeout(() => {
      setLocationToast(null);
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [locationToast]);

  const showLocationToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      setLocationToastTone(tone);
      setLocationToast(message);
    },
    [],
  );
  const handleReportsFeedUnavailable = useCallback(() => {
    showLocationToast(STRINGS.report.feedUnavailable, "error");
  }, [showLocationToast]);

  const {
    userLocation,
    geoStatus,
    geoError,
    followMode,
    requestLocation,
    handleLocateClick,
    handleUserLocationPinTap,
    handleUserInteract,
  } = useGeoLocation({
    mapRef,
    showLocationToast,
    locationFocusZoom: LOCATION_FOCUS_ZOOM,
    locationRefreshMs: LOCATION_REFRESH_MS,
    messages: STRINGS.location,
  });
  useReportsFeed({
    setReports,
    setReportsFeedReady,
    pollMs: FEATURE_FLAGS.reportsPollMs,
    graceMs: REPORTS_FEED_ERROR_TOAST_GRACE_MS,
    onUnavailable: handleReportsFeedUnavailable,
  });
  useAccountSync({
    devMockAccount,
    account,
    setAccount,
    setFavoriteBeachIds,
    setProfileOpen,
    setDeletingAccount,
  });

  const refreshRewards = useCallback(
    async (options?: { silent?: boolean; detectAchievements?: boolean }) => {
      if (!account) {
        setRewardsSummary(null);
        rewardsSummaryRef.current = null;
        setRewardsLoading(false);
        return;
      }
      setRewardsLoading(true);
      const result = await fetchAccountRewards();
      if (result.ok) {
        // Detect missions that just became claimable (progress hit goal while user was in another screen)
        if (rewardsSummaryRef.current !== null) {
          const prev = rewardsSummaryRef.current;
          const prevWeeklyClaimable = prev.weeklyMission.progress >= prev.weeklyMission.goal && !prev.weeklyMission.claimed;
          const nowWeeklyClaimable = result.summary.weeklyMission.progress >= result.summary.weeklyMission.goal && !result.summary.weeklyMission.claimed;
          const prevDailyClaimable = prev.dailyMission.progress >= prev.dailyMission.goal && !prev.dailyMission.claimed;
          const nowDailyClaimable = result.summary.dailyMission.progress >= result.summary.dailyMission.goal && !result.summary.dailyMission.claimed;
          if ((!prevWeeklyClaimable && nowWeeklyClaimable) || (!prevDailyClaimable && nowDailyClaimable)) {
            setMissionReadyToast(true);
            setRewardsBadgeDot(true);
          }
        }

        // Detect newly unlocked achievements (only when explicitly requested and we have a previous state)
        if (options?.detectAchievements && rewardsSummaryRef.current !== null) {
          const prevAchievements = rewardsSummaryRef.current.achievements;
          const newlyUnlocked = result.summary.achievements.filter(
            (a) => a.unlocked && !prevAchievements.find((p) => p.id === a.id && p.unlocked),
          );
          if (newlyUnlocked.length > 0) {
            const events: GamificationCelebrationEvent[] = newlyUnlocked.map((a) => {
              const locale = STRINGS.achievements[a.id as keyof typeof STRINGS.achievements];
              return {
                type: "achievement" as const,
                id: a.id,
                name: locale?.name ?? a.id,
                description: locale?.description ?? "",
              };
            });
            setPendingGamification((prev) => [...prev, ...events]);
          }
        }
        setRewardsSummary(result.summary);
        rewardsSummaryRef.current = result.summary;
        setRewardsLoading(false);
        return;
      }
      setRewardsLoading(false);
      if (result.code === "account_required") {
        setAccount(null);
        setRewardsSummary(null);
        rewardsSummaryRef.current = null;
        return;
      }
      if (options?.silent) return;
      showLocationToast(STRINGS.account.rewardsLoadFailed, "error");
    },
    [account, setAccount, showLocationToast],
  );

  const handleRedeemBadge = useCallback(
    async (badgeCode: string) => {
      if (!account || redeemingBadgeCode) return;
      setRedeemingBadgeCode(badgeCode);
      const result = await redeemBadge(badgeCode);
      if (result.ok) {
        setRewardsSummary(result.summary);
        setRedeemingBadgeCode(null);
        // Find the redeemed badge to auto-equip and celebrate
        const redeemedBadge = result.summary.badges.find((b) => b.code === badgeCode);
        if (redeemedBadge) {
          const locale = STRINGS.badges[redeemedBadge.code as keyof typeof STRINGS.badges];
          const localizedName = locale?.name ?? redeemedBadge.name;
          const localizedDesc = locale?.description ?? redeemedBadge.description;
          const newActive: ActiveBadge = { code: redeemedBadge.code, icon: redeemedBadge.icon, name: localizedName };
          saveActiveBadge(newActive);
          setActiveBadge(newActive);
          setCelebrationBadge({ ...newActive, description: localizedDesc });
        }
        return;
      }
      setRedeemingBadgeCode(null);
      if (result.code === "account_required") {
        setAccount(null);
        setRewardsSummary(null);
        return;
      }
      const errorMessage =
        result.code === "insufficient_points"
          ? STRINGS.account.badgeRedeemInsufficientPoints
          : result.code === "badge_already_owned"
            ? STRINGS.account.badgeRedeemAlreadyOwned
            : result.code === "badge_not_found"
              ? STRINGS.account.badgeRedeemNotFound
              : STRINGS.account.badgeRedeemFailed;
      showLocationToast(errorMessage, "error");
    },
    [account, redeemingBadgeCode, setAccount, showLocationToast],
  );

  const handleEquipBadge = useCallback((badge: ActiveBadge) => {
    saveActiveBadge(badge);
    setActiveBadge(badge);
  }, []);

  const handleClaimMission = useCallback(async () => {
    if (claimingMission) return;
    setClaimingMission(true);
    const result = await claimMissionReward();
    setClaimingMission(false);
    if (result.ok) {
      setRewardsSummary(result.summary);
      rewardsSummaryRef.current = result.summary;
      setPendingGamification((prev) => [
        ...prev,
        { type: "mission" as const, missionType: "weekly" as const, pointsEarned: result.summary.weeklyMission.reward },
      ]);
      return;
    }
    if (result.code === "account_required") {
      setAccount(null);
      setRewardsSummary(null);
      rewardsSummaryRef.current = null;
      return;
    }
    if (result.code === "already_claimed") {
      // Summary is stale — refresh silently
      void refreshRewards({ silent: true });
      return;
    }
    showLocationToast(STRINGS.account.missionClaimFailed, "error");
  }, [claimingMission, setAccount, refreshRewards, showLocationToast]);

  const handleClaimDailyMission = useCallback(async () => {
    if (claimingDailyMission) return;
    setClaimingDailyMission(true);
    const result = await claimDailyMissionReward();
    setClaimingDailyMission(false);
    if (result.ok) {
      setRewardsSummary(result.summary);
      rewardsSummaryRef.current = result.summary;
      setPendingGamification((prev) => [
        ...prev,
        { type: "mission" as const, missionType: "daily" as const, pointsEarned: result.summary.dailyMission.reward },
      ]);
      return;
    }
    if (result.code === "account_required") {
      setAccount(null);
      setRewardsSummary(null);
      rewardsSummaryRef.current = null;
      return;
    }
    if (result.code === "already_claimed") {
      void refreshRewards({ silent: true });
      return;
    }
    showLocationToast(STRINGS.account.missionDailyClaimFailed, "error");
  }, [claimingDailyMission, setAccount, refreshRewards, showLocationToast]);

  useEffect(() => {
    if (!account) {
      setRewardsSummary(null);
      setRewardsLoading(false);
      setRedeemingBadgeCode(null);
      return;
    }
    void refreshRewards({ silent: true });
  }, [account, refreshRewards]);

  // Register Expo push token with the server when received from the native shell.
  useEffect(() => {
    if (!account) return;
    const handlePushToken = async (event: Event) => {
      const token = (event as CustomEvent<{ token?: unknown }>).detail?.token;
      if (typeof token !== "string" || !token.trim()) return;
      try {
        const { getSupabaseClient } = await import("../lib/supabase");
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        const authToken = data.session?.access_token;
        if (!authToken) return;
        await fetch("/api/notifications/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token, platform: "ios" }),
        });
      } catch {
        // Non-fatal
      }
    };
    window.addEventListener("w2b-push-token", handlePushToken as EventListener);
    return () => window.removeEventListener("w2b-push-token", handlePushToken as EventListener);
  }, [account]);

  useEffect(() => {
    if (!account || !profileOpen) return;
    void refreshRewards({ silent: true });
  }, [account, profileOpen, refreshRewards]);

  const mockAchievementFiredRef = useRef(false);
  useEffect(() => {
    if (!devMockAccount || !rewardsSummary || mockAchievementFiredRef.current) return;
    mockAchievementFiredRef.current = true;
    const timer = setTimeout(() => {
      completeMockMission();
      void handleClaimMission();
    }, 5000);
    return () => clearTimeout(timer);
  }, [devMockAccount, rewardsSummary, refreshRewards, handleClaimMission]);

  useEffect(() => {
    if (!devMockAccount) return;
    (window as unknown as Record<string, unknown>).__br_dev = {
      unlockAchievement: (id: string) => {
        unlockMockAchievement(id);
        void refreshRewards({ silent: true, detectAchievements: true });
      },
      triggerMission: () => {
        completeMockMission();
        void handleClaimMission();
      },
      triggerDailyMission: () => {
        completeMockDailyMission();
        void handleClaimDailyMission();
      },
    };
  }, [devMockAccount, refreshRewards, handleClaimMission, handleClaimDailyMission]);


  const applyAccountRequiredState = useCallback(
    (nextState: AccountRequiredState) => {
      setAccountRequiredOpen(nextState.open);
      setAccountRequiredReason(nextState.reason);
      setAccountRequiredBeachName(nextState.beachName);
      setPendingFavoriteBeachId(nextState.pendingFavoriteBeachId);
    },
    [],
  );

  useEffect(() => {
    if (!missionReadyToast) return;
    const timeout = window.setTimeout(() => setMissionReadyToast(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [missionReadyToast]);

  useEffect(() => {
    if (!confirmRewardToast) return;
    const timeout = window.setTimeout(() => setConfirmRewardToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [confirmRewardToast]);

  useEffect(() => {
    if (!debugToast) return;
    const timeout = window.setTimeout(() => {
      setDebugToast(null);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [debugToast]);

  useEffect(() => {
    if (!showAllPinsHint) return;
    const timeout = window.setTimeout(() => {
      setShowAllPinsHint(false);
    }, 4200);
    return () => window.clearTimeout(timeout);
  }, [showAllPinsHint]);

  useEffect(() => {
    let active = true;
    if (selectedBeachId && isLidoModalOpen) {
      setReviewsLoading(true);
      fetchBeachReviews(selectedBeachId).then((result) => {
        if (!active) return;
        if (result.ok) {
          setReviews(result.reviews);
        } else {
          setReviews([]);
        }
        setReviewsLoading(false);
      });
    } else {
      setReviews([]);
    }
    return () => {
      active = false;
    };
  }, [selectedBeachId, isLidoModalOpen]);

  const handleOverride = useCallback(
    (beachId: string, lat: number, lng: number) => {
      const nextOverrides = setOverride(beachId, lat, lng);
      setOverrides(nextOverrides);
      if (isDebug) setDebugToast(STRINGS.debug.positionSaved);
    },
    [isDebug],
  );

  const handleResetOverride = useCallback((beachId: string) => {
    const nextOverrides = clearOverride(beachId);
    setOverrides(nextOverrides);
  }, []);

  const handleResetAllOverrides = useCallback(() => {
    const nextOverrides = clearOverrides();
    setOverrides(nextOverrides);
  }, []);

  const handleShowAllPins = useCallback(() => {
    setShowAllPinsHint(false);
    setSoloBeachId(null);
    const map = mapRef.current;
    if (!map) return;
    const currentZoom = map.getZoom();
    if (!Number.isFinite(currentZoom) || currentZoom < SHOW_ALL_PINS_ZOOM_TRIGGER) {
      return;
    }
    const minZoom = map.getMinZoom?.() ?? 0;
    const targetZoom = Math.max(
      minZoom,
      currentZoom - SHOW_ALL_PINS_ZOOM_OUT_DELTA,
    );
    if (targetZoom >= currentZoom) return;
    map.flyTo(map.getCenter(), targetZoom, {
      animate: true,
      duration: SHOW_ALL_PINS_FLY_DURATION_S,
      easeLinearity: 0.25,
    });
  }, []);

  const visibleSpots = useMemo(
    () =>
      isDebug
        ? SPOTS
        : SPOTS.filter((spot) => spot.status !== "draft"),
    [isDebug],
  );

  const reportsIndex = useMemo(() => buildReportsIndex(reports), [reports]);

  const coordStats = useMemo(() => {
    const total = visibleSpots.length;
    let valid = 0;
    visibleSpots.forEach((beach) => {
      const override = overrides[beach.id];
      const lat = override?.lat ?? beach.lat;
      const lng = override?.lng ?? beach.lng;
      if (Number.isFinite(lat) && Number.isFinite(lng)) valid += 1;
    });
    return { total, valid, missing: total - valid };
  }, [visibleSpots, overrides]);

  const overrideCount = useMemo(() => Object.keys(overrides).length, [overrides]);

  useEffect(() => {
    if (!isDebug) return;
    console.info(
      `Debug coords: total=${coordStats.total} valid=${coordStats.valid} missing=${coordStats.missing}`,
    );
  }, [coordStats.missing, coordStats.total, coordStats.valid, isDebug]);

  const beachViewsBase = useMemo<BeachWithStats[]>(() => {
    return visibleSpots
      .map((beach, index) => {
        const override = overrides[beach.id];
        const lat = override?.lat ?? beach.lat;
        const lng = override?.lng ?? beach.lng;
        const stats = aggregateBeachStatsFromIndex(beach, reportsIndex, now);
        const mockLevel =
          MOCK_CROWD_LEVELS[index % MOCK_CROWD_LEVELS.length] ??
          (1 as CrowdLevel);
        const isPred = stats.state === "PRED";
        const effectiveStats = useMockCrowd
          ? {
            ...stats,
            crowdLevel: mockLevel,
            state: isPred ? "LIVE" : stats.state,
            updatedAt: isPred ? now : stats.updatedAt,
            reportsCount: isPred ? Math.max(1, stats.reportsCount) : stats.reportsCount,
            confidence: isPred ? Math.max(0.7, stats.confidence) : stats.confidence,
          }
          : stats;
        return { ...beach, lat, lng, ...effectiveStats, distanceM: null };
      })
      .filter((beach) => hasFiniteCoords(beach));
  }, [visibleSpots, overrides, reportsIndex, now, useMockCrowd]);

  const beachViews = useMemo<BeachWithStats[]>(() => {
    if (!userLocation) return beachViewsBase;
    return beachViewsBase.map((beach) => ({
      ...beach,
      distanceM: distanceInMeters(userLocation, { lat: beach.lat, lng: beach.lng }),
    }));
  }, [beachViewsBase, userLocation]);

  const normalizedSearch = search.trim().toLowerCase();

  const searchBeaches = useMemo(
    () => visibleSpots.map(({ id, name, region }) => ({ id, name, region })),
    [visibleSpots],
  );

  const matchedBeachIds = useMemo(() => {
    if (!normalizedSearch) return null;
    const nextMatches = new Set<string>();
    for (const beach of beachViewsBase) {
      if (
        beach.name.toLowerCase().includes(normalizedSearch) ||
        beach.region.toLowerCase().includes(normalizedSearch)
      ) {
        nextMatches.add(beach.id);
      }
    }
    return nextMatches;
  }, [beachViewsBase, normalizedSearch]);

  const filteredBeachesBase = useMemo(() => {
    if (!matchedBeachIds) return beachViewsBase;
    return beachViewsBase.filter((beach) => matchedBeachIds.has(beach.id));
  }, [beachViewsBase, matchedBeachIds]);

  const filteredBeaches = useMemo(() => {
    if (!matchedBeachIds) return beachViews;
    return beachViews.filter((beach) => matchedBeachIds.has(beach.id));
  }, [beachViews, matchedBeachIds]);
  const mapBeaches = useMemo(() => {
    if (!soloBeachId) return filteredBeachesBase;
    const focused = beachViewsBase.find((beach) => beach.id === soloBeachId);
    return focused ? [focused] : filteredBeachesBase;
  }, [beachViewsBase, filteredBeachesBase, soloBeachId]);

  const limitedDataPredRatio = useMemo(() => {
    return computeLimitedDataPredRatio(beachViewsBase);
  }, [beachViewsBase]);

  useEffect(() => {
    if (!reportsFeedReady || reports.length === 0 || beachViewsBase.length === 0) {
      setShowLimitedDataNotice(false);
      return;
    }

    setShowLimitedDataNotice((prev) =>
      prev
        ? limitedDataPredRatio >= LIMITED_DATA_HIDE_THRESHOLD
        : limitedDataPredRatio >= LIMITED_DATA_SHOW_THRESHOLD,
    );
  }, [beachViewsBase.length, limitedDataPredRatio, reports.length, reportsFeedReady]);

  const liveDataNotice = showLimitedDataNotice ? STRINGS.banners.limitedData : null;

  const nearbyBeaches = useMemo(() => {
    if (!userLocation) return [];
    return filteredBeaches.filter(
      (beach) =>
        typeof beach.distanceM === "number" && beach.distanceM <= NEARBY_RADIUS_M,
    );
  }, [filteredBeaches, userLocation]);

  const sortedBeaches = useMemo(() => {
    return [...nearbyBeaches].sort(sortBeachesByDistanceThenName);
  }, [nearbyBeaches]);
  const favoriteBeachesForSheet = useMemo(() => {
    return buildFavoriteBeachesForSheet(beachViews, favoriteBeachIds);
  }, [beachViews, favoriteBeachIds]);
  const profileFavoriteBeaches = useMemo(() => {
    return buildProfileFavoriteBeaches(beachViewsBase, favoriteBeachIds);
  }, [beachViewsBase, favoriteBeachIds]);

  const {
    selectedBeachProfile,
    selectedBeachProfileLoading,
  } = useBeachProfiles({
    selectedBeachId,
    isLidoModalOpen,
    cacheTtlMs: BEACH_PROFILE_CACHE_TTL_MS,
  });
  const selectedBeachBase = beachViewsBase.find(
    (beach) => beach.id === selectedBeachId,
  );
  const selectedBeach = useMemo(() => {
    return mergeSelectedBeachWithProfile(selectedBeachBase, selectedBeachProfile);
  }, [selectedBeachBase, selectedBeachProfile]);
  const selectedBeachIsFavorite =
    !!selectedBeachId && favoriteBeachIds.has(selectedBeachId);

  // Feature 5A/5B: the latest report for the selected beach
  const latestBeachReport = selectedBeachId
    ? (reportsIndex.get(selectedBeachId)?.[0] ?? null)
    : null;
  // Report is "confirmable" when: exists, user is logged in, not already confirmed this session,
  // and not authored by this user (the backend rejects self-confirmation; hide the button too).
  const confirmableReportId = useMemo(() => {
    if (!latestBeachReport || !account || !isLidoModalOpen) return null;
    if (confirmedReportIdsRef.current.has(latestBeachReport.id)) return null;
    if (ownReportIdsRef.current.has(latestBeachReport.id)) return null;
    return latestBeachReport.id;
  }, [latestBeachReport, account, isLidoModalOpen]);
  // Feature 5B: show "È ancora così?" when modal is open with a report >30 min old
  const VALIDATION_PROMPT_MIN = 30;
  const showValidationPrompt = useMemo(() => {
    if (!latestBeachReport || !isLidoModalOpen || !account) return false;
    if (validationDismissedIdsRef.current.has(latestBeachReport.id)) return false;
    if (confirmedReportIdsRef.current.has(latestBeachReport.id)) return false;
    const ageMin = (now - latestBeachReport.createdAt) / 60_000;
    return ageMin >= VALIDATION_PROMPT_MIN;
  }, [latestBeachReport, isLidoModalOpen, account, now]);

  const selectedBeachLat = selectedBeach?.lat ?? null;
  const selectedBeachLng = selectedBeach?.lng ?? null;
  const reportDistanceM =
    selectedBeach &&
      userLocation &&
      Number.isFinite(selectedBeach.lat) &&
      Number.isFinite(selectedBeach.lng)
      ? distanceInMeters(userLocation, {
        lat: selectedBeach.lat,
        lng: selectedBeach.lng,
      })
      : null;
  const {
    selectedWeather,
    selectedWeatherLoading,
    selectedWeatherUnavailable,
  } = useBeachWeather({
    selectedBeachLat,
    selectedBeachLng,
  });
  const {
    predictions: selectedBeachPredictions,
    predictionsLoading: selectedBeachPredictionsLoading,
  } = useBeachPredictions({
    selectedBeachId,
    selectedBeachLat,
    selectedBeachLng,
    isLidoModalOpen,
  });
  const {
    reportError,
    submittingReport,
    clearReportError,
    handleSubmitReport,
  } = useReportSubmission({
    account,
    selectedBeach,
    allowRemoteReports,
    reportDistanceM,
    reportRadiusM: REPORT_RADIUS_M,
    tooSoonMessage: STRINGS.report.tooSoon,
    submitFailedMessage: STRINGS.report.submitFailed,
    applyAccountRequiredState,
    setAccount,
    setReports,
    setNow,
    setReportOpen,
    setReportThanksOpen,
    onReportSubmitted: ({ awardedPoints, pointsBalance, reportId }) => {
      ownReportIdsRef.current = new Set([
        ...ownReportIdsRef.current,
        reportId,
      ]);
      rememberOwnReportId(reportId);
      if (devMockAccount) {
        // Update in-memory mock first so balance is correct in both the modal and refresh
        awardMockPoints(awardedPoints);
        setLastReportReward({ awardedPoints, newBalance: getMockBalance() });
      } else {
        setLastReportReward({ awardedPoints, newBalance: pointsBalance ?? null });
      }
      void refreshRewards({ silent: true, detectAchievements: true });
    },
  });
  const selectedOverride = selectedBeachId ? overrides[selectedBeachId] : null;

  const reframeSelectedBeachForSoloView = useCallback(() => {
    if (!soloBeachId || !selectedBeach) return;
    if (!Number.isFinite(selectedBeach.lat) || !Number.isFinite(selectedBeach.lng)) {
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    if (!Number.isFinite(zoom)) return;
    const size = map.getSize();
    if (!size || size.x <= 0 || size.y <= 0) return;

    // Keep marker coordinates unchanged; move map center so the selected pin
    // lands clearly above the weather widget and overlay buttons.
    const targetX = size.x * 0.5;
    const topSafeY = Math.max(170, size.y * 0.24);
    const bottomSafeY = size.y - Math.max(400, size.y * 0.48);
    const preferredY = size.y * 0.37;
    const targetY = Math.max(topSafeY, Math.min(bottomSafeY, preferredY));

    const selectedProjected = map.project([selectedBeach.lat, selectedBeach.lng], zoom);
    const nextCenterProjected = selectedProjected.add([
      size.x / 2 - targetX,
      size.y / 2 - targetY,
    ]);
    const nextCenter = map.unproject(nextCenterProjected, zoom);

    map.flyTo(nextCenter, zoom, {
      animate: true,
      duration: 0.45,
      easeLinearity: 0.25,
    });
  }, [selectedBeach, soloBeachId]);

  const beachIdSet = useMemo(
    () => new Set(beachViewsBase.map((beach) => beach.id)),
    [beachViewsBase],
  );
  const debugAttribution = useMemo(
    () => {
      void debugRefreshKey;
      return isDebug ? loadAttribution() : null;
    },
    [debugRefreshKey, isDebug],
  );
  const debugEvents = useMemo(
    () => {
      void debugRefreshKey;
      return isDebug ? loadEvents() : [];
    },
    [debugRefreshKey, isDebug],
  );

  useEffect(() => {
    if (selectedBeachId && !selectedBeach) {
      setSelectedBeachId(null);
      setSoloBeachId(null);
      setIsLidoModalOpen(false);
    }
  }, [selectedBeach, selectedBeachId]);

  useEffect(() => {
    if (!soloBeachId) return;
    if (!selectedBeachId || selectedBeachId !== soloBeachId) {
      setSoloBeachId(null);
    }
  }, [selectedBeachId, soloBeachId]);

  const focusBeach = useCallback(
    (
      beachId: string,
      options?: { updateSearch?: boolean; moveMap?: boolean; solo?: boolean; openModal?: boolean },
    ) => {
      const beach = beachViewsBase.find((item) => item.id === beachId);
      if (!beach) return;
      if (options?.updateSearch) {
        setSearch(beach.name);
      }
      setSelectedBeachId(beach.id);
      setSoloBeachId(options?.solo ? beach.id : null);
      if (options?.openModal !== false) {
        setIsLidoModalOpen(true);
      }
      setSheetOpen(false);
      setActiveSheetSection("map");
      const shouldMoveMap = options?.moveMap ?? true;
      const map = mapRef.current;
      if (
        shouldMoveMap &&
        map &&
        Number.isFinite(beach.lat) &&
        Number.isFinite(beach.lng)
      ) {
        const zoom = BEACH_FOCUS_ZOOM;
        const currentZoom = map.getZoom();
        const zoomDelta = Number.isFinite(currentZoom)
          ? Math.max(0, zoom - currentZoom)
          : 0;
        const flyDuration = Math.min(3.2, Math.max(1.4, 0.8 + zoomDelta * 0.15));

        // Place pin at ~37% from top (same logic as reframeSelectedBeachForSoloView)
        // so it sits above the weather widget and overlay buttons.
        const size = map.getSize();
        const targetX = size.x * 0.5;
        const topSafeY = Math.max(170, size.y * 0.24);
        const bottomSafeY = size.y - Math.max(400, size.y * 0.48);
        const preferredY = size.y * 0.37;
        const targetY = Math.max(topSafeY, Math.min(bottomSafeY, preferredY));

        const pinProjected = map.project([beach.lat, beach.lng], zoom);
        const centerProjected = pinProjected.add([
          size.x / 2 - targetX,
          size.y / 2 - targetY,
        ]);
        const center = map.unproject(centerProjected, zoom);

        map.flyTo(center, zoom, {
          animate: true,
          duration: flyDuration,
          easeLinearity: 0.25,
        });
      }
    },
    [beachViewsBase],
  );

  useEffect(() => {
    if (!pendingDeepLinkBeachId) return;
    if (deepLinkProcessedRef.current) return;
    if (beachViewsBase.length === 0) return;
    const beachExists = beachIdSet.has(pendingDeepLinkBeachId);
    setDeepLinkInfo((prev) => ({
      ...prev,
      matched: beachExists,
    }));
    if (!beachExists) {
      setPendingDeepLinkBeachId(null);
      deepLinkProcessedRef.current = true;
      const warning = `Deep link beach id not found in SPOTS: ${pendingDeepLinkBeachId}`;
      setDeepLinkWarning(warning);
      const sampleIds = beachViewsBase.slice(0, 5).map((beach) => beach.id);
      console.warn(warning, "Sample ids:", sampleIds);
      return;
    }

    selectionSourceRef.current = "deeplink";
    setSelectedBeachId(pendingDeepLinkBeachId);
    setSoloBeachId(pendingDeepLinkBeachId);
    setIsLidoModalOpen(true);
    setSheetOpen(false);
    deepLinkProcessedRef.current = true;
  }, [beachIdSet, beachViewsBase, pendingDeepLinkBeachId]);

  useEffect(() => {
    if (!pendingDeepLinkBeachId) return;
    if (!mapReady || !mapRef.current) return;
    if (deepLinkInfo.matched === false) return;
    selectionSourceRef.current = "deeplink";
    focusBeach(pendingDeepLinkBeachId, { updateSearch: false, solo: true });
    setPendingDeepLinkBeachId(null);
  }, [deepLinkInfo.matched, focusBeach, mapReady, pendingDeepLinkBeachId]);

  const handleSelectBeach = useCallback(
    (beachId: string) => {
      focusBeach(beachId, { solo: true });
    },
    [focusBeach],
  );

  const handleSelectBeachFromMarker = useCallback(
    (beachId: string) => {
      selectionSourceRef.current = "marker";
      if (selectedBeachId === beachId && !isLidoModalOpen) {
        // Pin already selected but card closed (e.g. after "show all pins"):
        // zoom to it and open the card.
        focusBeach(beachId, { solo: true });
      } else if (selectedBeachId !== beachId) {
        // New pin: zoom only, let the user decide to open.
        focusBeach(beachId, { solo: true, openModal: false });
      }
      // If card is already open for this beach, do nothing.
    },
    [focusBeach, isLidoModalOpen, selectedBeachId],
  );

  const handleSelectSuggestion = useCallback(
    (beachId: string) => {
      selectionSourceRef.current = "search";
      focusBeach(beachId, { updateSearch: true, solo: true });
    },
    [focusBeach],
  );

  const handleSubmitSearchQuery = useCallback(
    (query: string) => {
      const normalizedQuery = normalizeSearchText(query);
      if (!normalizedQuery) return;

      const normalizedEntries = beachViewsBase.map((beach) => ({
        beach,
        nameNorm: normalizeSearchText(beach.name),
        regionNorm: normalizeSearchText(beach.region),
      }));

      const matches = normalizedEntries
        .filter(
          ({ nameNorm, regionNorm }) =>
            nameNorm.includes(normalizedQuery) || regionNorm.includes(normalizedQuery),
        )
        .map(({ beach }) => beach);

      if (matches.length === 0) return;

      const exactNameMatch = normalizedEntries.find(
        ({ nameNorm }) => nameNorm === normalizedQuery,
      )?.beach;
      if (exactNameMatch) {
        selectionSourceRef.current = "search";
        focusBeach(exactNameMatch.id, { updateSearch: true, solo: true });
        return;
      }

      const exactRegionMatches = normalizedEntries
        .filter(({ regionNorm }) => regionNorm === normalizedQuery)
        .map(({ beach }) => beach);

      const panoramaTargets =
        exactRegionMatches.length > 0
          ? exactRegionMatches
          : matches.length > 1
            ? matches
            : null;

      if (!panoramaTargets || panoramaTargets.length === 0) {
        selectionSourceRef.current = "search";
        focusBeach(matches[0].id, { updateSearch: true, solo: true });
        return;
      }

      if (panoramaTargets.length === 1) {
        selectionSourceRef.current = "search";
        focusBeach(panoramaTargets[0].id, { updateSearch: true, solo: true });
        return;
      }

      const map = mapRef.current;
      if (!map) return;

      const points: [number, number][] = panoramaTargets
        .filter(
          (beach) => Number.isFinite(beach.lat) && Number.isFinite(beach.lng),
        )
        .map((beach) => [beach.lat, beach.lng]);
      if (points.length === 0) return;

      setSoloBeachId(null);
      setSelectedBeachId(null);
      setIsLidoModalOpen(false);
      setSheetOpen(false);
      setActiveSheetSection("map");

      map.fitBounds(points, {
        animate: true,
        maxZoom: 13,
        paddingTopLeft: [16, 96],
        paddingBottomRight: [16, Math.max(140, effectiveBottomNavHeight + 56)],
      });
    },
    [beachViewsBase, effectiveBottomNavHeight, focusBeach],
  );

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
    const resumeView = resumeMapViewRef.current;
    if (resumeView) {
      map.setView([resumeView.lat, resumeView.lng], resumeView.zoom, {
        animate: false,
      });
      resumeMapViewRef.current = null;
    } else {
      map.fitBounds(ITALY_BOUNDS, {
        animate: false,
        maxZoom: INITIAL_MAP_ZOOM,
        paddingTopLeft: [16, 96],
        paddingBottomRight: [16, 140],
      });
    }
    setMapReady(true);
  }, []);

  const handleToggleSheet = useCallback(() => {
    setSheetOpen((prev) => !prev);
  }, []);

  const handleSheetDragStateChange = useCallback((active: boolean) => {
    setSheetDragActive(active);
  }, []);

  const handleChangeBottomSection = useCallback((section: BottomSheetSection) => {
    if (section === "rewards") {
      setRewardsBadgeDot(false);
      setMissionReadyToast(false);
    }
    setActiveSheetSection((prev) => {
      if (prev !== section) return section;
      return prev;
    });
    setSheetOpen((prev) => {
      // Same section: toggle. Different section: always open.
      if (activeSheetSection === section) return !prev;
      return true;
    });
  }, [activeSheetSection]);

  const {
    handleUpdateProfile,
    handleToggleFavorite,
    handleToggleSelectedFavorite,
    handleSignOut,
    handleDeleteAccount,
    handleOpenProfile,
    handleSelectProfileFavorite,
  } = useAccountActions({
    account,
    deletingAccount,
    favoriteBeachIds,
    beachViewsBase,
    selectedBeachId,
    applyAccountRequiredState,
    showLocationToast,
    setAccount,
    setFavoriteBeachIds,
    setProfileOpen,
    setDeletingAccount,
    focusBeach,
    messages: {
      favoriteSyncFailed: STRINGS.account.favoriteSyncFailed,
      signOutFailed: STRINGS.account.signOutFailed,
      deleteAccountConfirm: STRINGS.account.deleteAccountConfirm,
      deleteAccountFailed: STRINGS.account.deleteAccountFailed,
      deleteAccountSuccess: STRINGS.account.deleteAccountSuccess,
    },
  });

  const handleRestartTutorial = useCallback(() => {
    const payload = JSON.stringify({ type: "w2b-restart-tutorial", language: getCurrentLanguage() });
    try {
      const browserWindow = window as Window & {
        ReactNativeWebView?: { postMessage?: (p: string) => void };
      };
      browserWindow.ReactNativeWebView?.postMessage?.(payload);
      window.setTimeout(() => {
        try {
          browserWindow.ReactNativeWebView?.postMessage?.(payload);
        } catch {
          // Ignore transient bridge errors on delayed retry.
        }
      }, 120);
    } catch {
      // Outside native shell — no-op.
    }
    setProfileOpen(false);
  }, []);

  const handleOpenReport = useCallback(() => {
    if (!account) {
      applyAccountRequiredState(
        createReportAccountRequiredState(selectedBeach?.name ?? null),
      );
      return;
    }
    setReportOpen(true);
    clearReportError();
  }, [account, applyAccountRequiredState, clearReportError, selectedBeach]);

  const handleCloseReport = useCallback(() => {
    setReportOpen(false);
    clearReportError();
  }, [clearReportError]);

  useEffect(() => {
    if (!selectedBeachId) {
      lastSelectedBeachIdRef.current = null;
      return;
    }
    if (selectedBeachId === lastSelectedBeachIdRef.current) return;
    lastSelectedBeachIdRef.current = selectedBeachId;
    const source = selectionSourceRef.current ?? undefined;
    track("beach_view", { beachId: selectedBeachId, source });
    selectionSourceRef.current = null;
  }, [selectedBeachId]);

  useEffect(() => {
    if (!reportOpen) {
      reportOpenRef.current = false;
      return;
    }
    if (reportOpenRef.current) return;
    reportOpenRef.current = true;
    track("report_open", { beachId: selectedBeachId ?? undefined });
  }, [reportOpen, selectedBeachId]);

  const handleCloseDrawer = useCallback(() => {
    if (reportOpen) return;
    setIsLidoModalOpen(false);
    if (soloBeachId) {
      setShowAllPinsHint(true);
      window.requestAnimationFrame(() => {
        reframeSelectedBeachForSoloView();
      });
    }
  }, [reframeSelectedBeachForSoloView, reportOpen, soloBeachId]);

  const handleOpenWeatherDetails = useCallback(() => {
    if (reportOpen || !selectedBeach) return;
    setSheetOpen(false);
    setIsLidoModalOpen(true);
  }, [reportOpen, selectedBeach]);

  const handleCloseAccountRequired = useCallback(() => {
    applyAccountRequiredState(createResetAccountRequiredState());
  }, [applyAccountRequiredState]);

  const accountDisplayName = useMemo(() => {
    if (!account) return null;
    return resolveAuthorName(account.nickname, PUBLIC_FALLBACK_AUTHOR_NAME);
  }, [account]);

  const navigateToRegister = useCallback((options?: RegisterNavigationOptions) => {
    const map = mapRef.current;
    const center = map?.getCenter();
    const zoom = map?.getZoom();
    const resumeSnapshot = buildRegisterResumeSnapshot({
      search,
      selectedBeachId,
      soloBeachId,
      isLidoModalOpen,
      sheetOpen,
      reportOpen,
      mapCenter: center ? { lat: center.lat, lng: center.lng } : null,
      mapZoom: zoom ?? null,
    });
    persistRegisterResumeSnapshot(resumeSnapshot);

    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const registerUrl = buildRegisterRedirectUrl(returnTo, options);

    track("auth_gate_redirect", {
      beachId: options?.favoriteBeachId ?? selectedBeachId ?? undefined,
    });
    window.location.assign(registerUrl);
  }, [
    isLidoModalOpen,
    reportOpen,
    search,
    selectedBeachId,
    sheetOpen,
    soloBeachId,
  ]);

  const handleContinueToRegister = useCallback(() => {
    if (accountRequiredReason === "reports") {
      navigateToRegister({
        beachName: accountRequiredBeachName,
      });
      return;
    }

    navigateToRegister({
      favoriteBeachId: pendingFavoriteBeachId,
      beachName: accountRequiredBeachName,
    });
  }, [
    accountRequiredBeachName,
    accountRequiredReason,
    navigateToRegister,
    pendingFavoriteBeachId,
  ]);

  const handleOpenSignIn = useCallback(() => {
    navigateToRegister({ authMode: "login" });
  }, [navigateToRegister]);

  const handleShare = useCallback(async () => {
    if (!selectedBeach) return;
    setShareToast(STRINGS.share.preparing);
    try {
      const { shareBeachCard } = await import("../components/ShareCard");
      await shareBeachCard({
        name: selectedBeach.name,
        region: selectedBeach.region,
        crowdLevel: selectedBeach.crowdLevel,
        state: selectedBeach.state,
        confidence: formatConfidence(selectedBeach.confidence),
        updatedLabel: formatMinutesAgo(selectedBeach.updatedAt, now),
        reportsCount: selectedBeach.reportsCount,
      });
    } catch {
      // Share failures should be silent for MVP.
    } finally {
      setShareToast(null);
    }
  }, [now, selectedBeach]);

  const handleShareFromThanks = useCallback(() => {
    setReportThanksOpen(false);
    void handleShare();
  }, [handleShare]);

  const handleCopyDebugExport = async () => {
    const payload = {
      attribution: debugAttribution ?? undefined,
      events: debugEvents,
    };
    if (!navigator.clipboard?.writeText) {
      setDebugToast(STRINGS.debug.exportFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setDebugToast(STRINGS.debug.exportCopied);
    } catch {
      setDebugToast(STRINGS.debug.exportFailed);
    }
  };

  const handleClearEvents = () => {
    clearEvents();
    setDebugToast(STRINGS.debug.eventsCleared);
  };

  const handleClearAttribution = () => {
    clearAttribution();
    setDebugToast(STRINGS.debug.attributionCleared);
  };

  const handleWriteReview = useCallback(() => {
    if (!account) {
      applyAccountRequiredState(
        createFavoriteAccountRequiredState(selectedBeach?.name ?? null, null),
      );
      return;
    }
    setReviewOpen(true);
  }, [account, applyAccountRequiredState, selectedBeach]);

  const handleCloseReview = useCallback(() => {
    setReviewOpen(false);
  }, []);

  const handleConfirmReport = useCallback(
    async (reportId: string) => {
      confirmedReportIdsRef.current = new Set([...confirmedReportIdsRef.current, reportId]);
      validationDismissedIdsRef.current = new Set([...validationDismissedIdsRef.current, reportId]);
      const result = await confirmReport(reportId);
      if (result.ok) {
        const awarded = result.rewards.awardedPoints ?? 1;
        if (devMockAccount) {
          awardMockPoints(awarded);
          setConfirmRewardToast({ awardedPoints: awarded, newBalance: getMockBalance() });
        } else {
          setConfirmRewardToast({
            awardedPoints: awarded,
            newBalance: result.rewards.pointsBalance ?? null,
          });
        }
        void refreshRewards({ silent: true, detectAchievements: true });
      }
    },
    [devMockAccount, refreshRewards],
  );

  const handleValidateDismiss = useCallback(() => {
    if (latestBeachReport) {
      validationDismissedIdsRef.current = new Set([...validationDismissedIdsRef.current, latestBeachReport.id]);
    }
  }, [latestBeachReport]);

  const handleSubmitReview = useCallback(
    async (content: string, rating: number) => {
      if (!selectedBeach || !account) return;
      const authorName = resolveAuthorName(
        account.nickname,
        PUBLIC_FALLBACK_AUTHOR_NAME,
      );
      const result = await submitBeachReview({
        beachId: selectedBeach.id,
        authorName,
        content,
        rating,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }
      setReviews((prev) => [result.review, ...prev]);
    },
    [selectedBeach, account],
  );

  const mapCenter = DEFAULT_CENTER;

  if (splashPhase !== "hidden") {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-cover bg-center transition-opacity duration-400 ${splashPhase === "fading" ? "opacity-0" : "opacity-100"
          }`}
        style={{ backgroundImage: `url(${splashBg})` }}
      >
        <div className="flex flex-col items-center">
          <img
            src={logo}
            alt="Where2Beach"
            className="h-auto w-[300px] max-w-[80vw] sm:w-[360px]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" data-testid="app-root">
      <MapView
        beaches={mapBeaches}
        favoriteBeachIds={favoriteBeachIds}
        selectedBeachId={selectedBeachId}
        keepSelectedPinExpanded={Boolean(soloBeachId)}
        onSelectBeach={handleSelectBeachFromMarker}
        center={mapCenter}
        initialZoom={INITIAL_MAP_ZOOM}
        editMode={effectiveEditMode}
        onOverride={handleOverride}
        onMapReady={handleMapReady}
        userLocation={userLocation ?? undefined}
        nowTs={now}
        onUserLocationTap={handleUserLocationPinTap}
        onUserInteract={handleUserInteract}
      />
      {isDebug ? (
        <Suspense fallback={null}>
          <PerformanceOverlay />
        </Suspense>
      ) : null}
      <TopSearch
        value={search}
        onChange={setSearch}
        notice={liveDataNotice}
        beaches={searchBeaches}
        onSelectSuggestion={handleSelectSuggestion}
        onSubmitQuery={handleSubmitSearchQuery}
      />
      <div
        className={`fixed flex flex-col items-end gap-3 pointer-events-none ${
          sheetOpen || sheetDragActive ? "z-[22]" : "z-[35]"
        }`}
        style={{
          right: 'max(10px, calc((100vw - min(100vw, 640px)) / 2 + 10px))',
          bottom: "calc(var(--leaflet-attribution-bottom, 202px) + 36px)",
        }}
      >
        {selectedBeach && soloBeachId && !isLidoModalOpen && !reportOpen ? (
          <div className="pointer-events-auto">
            <WeatherWidget
              beachName={selectedBeach.name}
              weather={selectedWeather}
              weatherLoading={selectedWeatherLoading}
              weatherUnavailable={selectedWeatherUnavailable}
              onOpenDetails={handleOpenWeatherDetails}
            />
          </div>
        ) : null}
        {soloBeachId ? (
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {showAllPinsHint ? (
              <div className="max-w-[240px] rounded-[14px] border border-amber-300/60 bg-[rgba(30,20,4,0.88)] px-3.5 py-2.5 text-right text-[12px] font-medium leading-snug text-amber-100 shadow-[0_12px_28px_rgba(0,0,0,0.55)] backdrop-blur-md">
                {STRINGS.hints.showAllPins}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleShowAllPins}
              className="br-press rounded-full border border-white/30 bg-[rgba(10,14,22,0.82)] px-4 py-2 text-[12px] font-semibold text-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition hover:border-white/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              {STRINGS.actions.showAllPins}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleLocateClick}
          aria-label={STRINGS.aria.myLocation}
          className={`br-press pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-[20px] transition shadow-[0_8px_16px_rgba(0,0,0,0.26)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25 ${geoStatus === "loading"
            ? "border-sky-200/50 bg-sky-500/24 text-sky-50"
            : geoStatus === "denied" || geoStatus === "error"
              ? "border-rose-200/45 bg-rose-500/22 text-rose-100"
              : followMode
                ? "border-white/36 bg-white/24 text-white"
                : "border-white/26 bg-[linear-gradient(180deg,rgba(26,40,64,0.4),rgba(12,23,41,0.48))] text-slate-100"
            }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <circle cx="12" cy="12" r="5" />
          </svg>
        </button>
      </div>
      {locationToast ? (
        <div
          className={`fixed left-1/2 top-[calc(env(safe-area-inset-top)+130px)] z-40 -translate-x-1/2 rounded-xl border px-4 py-2 text-[12px] font-medium shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-md ${locationToastTone === "error"
            ? "border-rose-300/70 bg-rose-700/45 text-rose-50"
            : locationToastTone === "success"
              ? "border-emerald-300/70 bg-emerald-700/40 text-emerald-50"
              : "border-sky-300/65 bg-sky-800/45 text-sky-50"
            }`}
        >
          {locationToast}
        </div>
      ) : null}
      {shareToast ? (
        <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+168px)] z-40 -translate-x-1/2 rounded-xl border border-sky-300/65 bg-sky-800/45 px-4 py-2 text-[12px] font-medium text-sky-50 shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {shareToast}
        </div>
      ) : null}
      {missionReadyToast ? (
        <button
          type="button"
          onClick={() => handleChangeBottomSection("rewards")}
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+130px)] z-40 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-amber-300/65 bg-amber-800/55 px-4 py-2.5 text-[12px] font-semibold text-amber-50 shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-md br-press"
        >
          <span>⭐</span>
          <span>{STRINGS.account.missionReadyToastTitle}</span>
          <span className="text-amber-200/80">{STRINGS.account.missionReadyToastAction}</span>
        </button>
      ) : null}
      {confirmRewardToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+180px)] z-40 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-emerald-300/55 bg-emerald-800/55 px-4 py-2.5 text-[12px] font-semibold text-emerald-50 shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          <span>✅</span>
          <span>{STRINGS.confirm.thanksToastTitle}</span>
          <span className="text-emerald-200">
            {STRINGS.confirm.thanksToastPoints(confirmRewardToast.awardedPoints)}
          </span>
          {typeof confirmRewardToast.newBalance === "number" ? (
            <span className="text-emerald-200/80">
              · {STRINGS.confirm.thanksToastBalance(confirmRewardToast.newBalance)}
            </span>
          ) : null}
        </div>
      ) : null}

      {accountRequiredOpen ? (
        <Suspense fallback={null}>
          <AccountRequiredModal
            isOpen={accountRequiredOpen}
            beachName={accountRequiredBeachName}
            reason={accountRequiredReason}
            onClose={handleCloseAccountRequired}
            onContinue={handleContinueToRegister}
          />
        </Suspense>
      ) : null}
      {account?.email ? (
        <Suspense fallback={null}>
          <ProfileModal
            isOpen={profileOpen}
            name={accountDisplayName}
            email={account.email}
            firstName={account.firstName}
            lastName={account.lastName}
            nickname={account.nickname}
            favoriteBeaches={profileFavoriteBeaches}
            activeBadge={activeBadge}
            deleting={deletingAccount}
            onClose={() => setProfileOpen(false)}
            onSelectFavorite={handleSelectProfileFavorite}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onUpdateProfile={handleUpdateProfile}
            onRestartTutorial={shouldSkipInitialSplash ? handleRestartTutorial : undefined}
          />
        </Suspense>
      ) : null}
      {celebrationBadge ? (
        <Suspense fallback={null}>
          <BadgeCelebrationModal
            isOpen={true}
            badgeName={celebrationBadge.name}
            badgeDescription={celebrationBadge.description}
            badgeIcon={celebrationBadge.icon}
            onClose={() => setCelebrationBadge(null)}
          />
        </Suspense>
      ) : null}
      {pendingGamification.length > 0 && !celebrationBadge && !reportThanksOpen ? (
        <Suspense fallback={null}>
          <GamificationCelebrationModal
            event={pendingGamification[0]}
            onClose={() => setPendingGamification((prev) => prev.slice(1))}
          />
        </Suspense>
      ) : null}
      {reportThanksOpen ? (
        <Suspense fallback={null}>
          <ReportThanksModal
            isOpen={reportThanksOpen}
            awardedPoints={lastReportReward?.awardedPoints}
            newBalance={lastReportReward?.newBalance}
            onClose={() => { setReportThanksOpen(false); setLastReportReward(null); }}
            onShare={handleShareFromThanks}
          />
        </Suspense>
      ) : null}
      {isDebug && overrideCount > 0 ? (
        <div className="fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-100 shadow-lg backdrop-blur">
          <div className="text-amber-100">
            {STRINGS.debug.overrideWarning(overrideCount)}
          </div>
        </div>
      ) : null}
      {isDebug && debugToast ? (
        <div className="fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom)+18px)] z-40 -translate-x-1/2 rounded-xl border border-emerald-300/70 bg-emerald-800/40 px-4 py-2 text-[12px] font-medium text-emerald-50 shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
          {debugToast}
        </div>
      ) : null}
      {isDebug ? (
        <div className="fixed left-4 bottom-[calc(env(safe-area-inset-bottom)+18px)] z-40 w-[min(92vw,320px)] rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
            <span>{STRINGS.debug.title}</span>
            <span className="text-[10px] text-slate-500">
              {STRINGS.debug.version}
            </span>
          </div>
          <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100">
            <span>{STRINGS.debug.editPositions}</span>
            <input
              type="checkbox"
              checked={editPositions}
              onChange={(event) => setEditPositions(event.target.checked)}
              className="h-4 w-4 accent-sky-400"
            />
          </label>
          <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/25 px-3 py-2 text-xs text-slate-400">
            <div className="text-slate-500">{STRINGS.debug.selectedBeach}</div>
            <div className="mt-1 text-slate-100">
              {selectedBeach ? selectedBeach.id : STRINGS.debug.none}
            </div>
            {selectedBeach ? (
              <div className="mt-1 text-slate-500">
                {STRINGS.debug.lat} {selectedBeach.lat.toFixed(5)} ·{" "}
                {STRINGS.debug.lng} {selectedBeach.lng.toFixed(5)}
              </div>
            ) : null}
          </div>
          <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/25 px-3 py-2 text-xs text-slate-400">
            <div className="text-slate-500">{STRINGS.debug.deeplink}</div>
            <div className="mt-1 text-slate-100">
              {deepLinkInfo.id ?? STRINGS.debug.none}
            </div>
            <div className="mt-1 text-slate-500">
              {STRINGS.debug.deeplinkMatched}{" "}
              <span className="text-slate-100">
                {deepLinkInfo.id
                  ? deepLinkInfo.matched === null
                    ? STRINGS.debug.pending
                    : deepLinkInfo.matched
                      ? STRINGS.debug.yes
                      : STRINGS.debug.no
                  : STRINGS.debug.none}
              </span>
            </div>
            <div className="mt-1 text-slate-500">
              {STRINGS.debug.deeplinkParams}
            </div>
            <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-100">
              {Object.keys(deepLinkInfo.params).length > 0
                ? JSON.stringify(deepLinkInfo.params)
                : STRINGS.debug.none}
            </div>
            {deepLinkWarning ? (
              <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
                {deepLinkWarning}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!selectedBeachId) return;
              handleResetOverride(selectedBeachId);
            }}
            disabled={!selectedBeachId || !selectedOverride}
            className="mt-3 w-full rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {STRINGS.debug.resetOverride}
          </button>
          <button
            type="button"
            onClick={handleResetAllOverrides}
            disabled={overrideCount === 0}
            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {STRINGS.debug.resetOverrides}
          </button>
          <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/25 px-3 py-2 text-xs text-slate-400">
            <div className="text-slate-500">{STRINGS.debug.attribution}</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-100">
              {debugAttribution
                ? JSON.stringify(debugAttribution)
                : STRINGS.debug.none}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/25 px-3 py-2 text-xs text-slate-400">
            <div className="text-slate-500">{STRINGS.debug.eventsCount}</div>
            <div className="mt-1 text-slate-100">{debugEvents.length}</div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/25 px-3 py-2 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <div className="text-slate-500">{STRINGS.debug.perfTitle}</div>
              <button
                type="button"
                onClick={clearPerfStats}
                className="rounded-lg border border-slate-700/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300 transition hover:border-slate-500/80 hover:text-slate-100"
              >
                {STRINGS.debug.perfReset}
              </button>
            </div>
            <div className="mt-1 text-slate-100">
              {STRINGS.debug.perfClusterLast(perfSnapshot.cluster.lastMs)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {STRINGS.debug.perfClusterMeta(
                perfSnapshot.cluster.lastClusterCount,
                perfSnapshot.cluster.lastSingleCount,
                perfSnapshot.cluster.lastZoom,
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {STRINGS.debug.perfIconCache(perfSnapshot.markerIconCacheSize)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <div>{STRINGS.debug.perfRender("App", perfSnapshot.renderCounts.App)}</div>
              <div>
                {STRINGS.debug.perfRender(
                  "MapView",
                  perfSnapshot.renderCounts.MapView,
                )}
              </div>
              <div>
                {STRINGS.debug.perfRender(
                  "TopSearch",
                  perfSnapshot.renderCounts.TopSearch,
                )}
              </div>
              <div>
                {STRINGS.debug.perfRender(
                  "BottomSheet",
                  perfSnapshot.renderCounts.BottomSheet,
                )}
              </div>
              <div className="col-span-2">
                {STRINGS.debug.perfRender(
                  "LidoModalCard",
                  perfSnapshot.renderCounts.LidoModalCard,
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyDebugExport}
            className="mt-3 w-full rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 transition"
          >
            {STRINGS.debug.copyExport}
          </button>
          <button
            type="button"
            onClick={handleClearEvents}
            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 transition"
          >
            {STRINGS.debug.clearEvents}
          </button>
          <button
            type="button"
            onClick={handleClearAttribution}
            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 transition"
          >
            {STRINGS.debug.clearAttribution}
          </button>
        </div>
      ) : null}
      <BottomSheet
        beaches={sortedBeaches}
        favoriteBeaches={favoriteBeachesForSheet}
        favoriteBeachIds={favoriteBeachIds}
        selectedBeachId={selectedBeachId}
        onSelectBeach={handleSelectBeach}
        onToggleFavorite={handleToggleFavorite}
        isOpen={sheetOpen}
        onToggle={handleToggleSheet}
        now={now}
        hasLocation={Boolean(userLocation)}
        nearbyRadiusKm={15}
        activeSection={activeSheetSection}
        onSectionChange={handleChangeBottomSection}
        onBottomNavHeightChange={setBottomNavHeight}
        onDragStateChange={handleSheetDragStateChange}
        accountName={accountDisplayName}
        accountEmail={account?.email ?? null}
        onOpenProfile={handleOpenProfile}
        onOpenSignIn={handleOpenSignIn}
        rewards={rewardsSummary}
        rewardsLoading={rewardsLoading}
        redeemingBadgeCode={redeemingBadgeCode}
        claimingMission={claimingMission}
        claimingDailyMission={claimingDailyMission}
        activeBadge={activeBadge}
        onRedeemBadge={handleRedeemBadge}
        onEquipBadge={handleEquipBadge}
        onClaimMission={handleClaimMission}
        onClaimDailyMission={handleClaimDailyMission}
        rewardsBadgeDot={rewardsBadgeDot}
        selectedBeachWeather={selectedWeather}
        selectedBeachProfile={selectedBeachProfile}
      />
      {selectedBeach ? (
        <Suspense fallback={null}>
          <LidoModalCard
            beach={selectedBeach}
            profile={selectedBeachProfile}
            profileLoading={selectedBeachProfileLoading}
            isOpen={isLidoModalOpen}
            now={now}
            isFavorite={selectedBeachIsFavorite}
            weather={selectedWeather}
            weatherLoading={selectedWeatherLoading}
            weatherUnavailable={selectedWeatherUnavailable}
            predictions={selectedBeachPredictions}
            predictionsLoading={selectedBeachPredictionsLoading}
            onClose={handleCloseDrawer}
            onToggleFavorite={handleToggleSelectedFavorite}
            onReport={handleOpenReport}
            onShare={handleShare}
            reviews={reviews}
            reviewsLoading={reviewsLoading}
            onWriteReview={handleWriteReview}
            confirmableReportId={confirmableReportId}
            confirmationCount={latestBeachReport?.confirmationCount}
            showValidationPrompt={showValidationPrompt}
            onConfirm={handleConfirmReport}
            onValidateDismiss={handleValidateDismiss}
          />
        </Suspense>
      ) : null}
      {selectedBeach ? (
        <Suspense fallback={null}>
          <ReportModal
            isOpen={reportOpen && Boolean(account)}
            beachName={selectedBeach.name}
            userLocation={userLocation}
            distanceM={reportDistanceM}
            allowRemoteReports={allowRemoteReports}
            geoStatus={geoStatus}
            geoError={geoError}
            onRequestLocation={requestLocation}
            onClose={handleCloseReport}
            onSubmit={handleSubmitReport}
            submitError={reportError}
            submitting={submittingReport}
          />
        </Suspense>
      ) : null}
      {selectedBeach ? (
        <Suspense fallback={null}>
          <ReviewModal
            isOpen={reviewOpen}
            beachName={selectedBeach.name}
            authorName={account ? accountDisplayName : null}
            onClose={handleCloseReview}
            onSubmit={handleSubmitReview}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
