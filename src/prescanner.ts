import type { ViewportDetectionResult } from "./detection-classify.ts";

export type PrescannerResolvedBy = "crater" | "chromium" | "none";

export interface PrescannerTrialResolution {
  craterDetected: boolean;
  fallbackUsed: boolean;
  finalDetected: boolean;
  resolvedBy: PrescannerResolvedBy;
}

export interface PrescannerTrialSummary {
  total: number;
  detected: number;
  craterResolved: number;
  chromiumFallbacks: number;
  chromiumDetected: number;
  passedAfterFallback: number;
}

export function hasCraterPrescanSignal(viewports: ViewportDetectionResult[]): boolean {
  return viewports.some((viewport) => viewport.visualDiffDetected || viewport.paintTreeDiffCount > 0);
}

export function hasAnyDetectionSignal(viewports: ViewportDetectionResult[]): boolean {
  return viewports.some((viewport) =>
    viewport.visualDiffDetected ||
    viewport.a11yDiffDetected ||
    viewport.computedStyleDiffCount > 0 ||
    viewport.hoverDiffDetected ||
    viewport.paintTreeDiffCount > 0,
  );
}

export function resolvePrescannerTrial(
  craterViewports: ViewportDetectionResult[],
  chromiumViewports: ViewportDetectionResult[] = [],
): PrescannerTrialResolution {
  const craterDetected = hasCraterPrescanSignal(craterViewports);
  if (craterDetected) {
    return {
      craterDetected: true,
      fallbackUsed: false,
      finalDetected: true,
      resolvedBy: "crater",
    };
  }

  const chromiumDetected = hasAnyDetectionSignal(chromiumViewports);
  return {
    craterDetected: false,
    fallbackUsed: true,
    finalDetected: chromiumDetected,
    resolvedBy: chromiumDetected ? "chromium" : "none",
  };
}

export function summarizePrescannerTrials(
  resolutions: PrescannerTrialResolution[],
): PrescannerTrialSummary {
  return {
    total: resolutions.length,
    detected: resolutions.filter((resolution) => resolution.finalDetected).length,
    craterResolved: resolutions.filter((resolution) => resolution.resolvedBy === "crater").length,
    chromiumFallbacks: resolutions.filter((resolution) => resolution.fallbackUsed).length,
    chromiumDetected: resolutions.filter((resolution) => resolution.resolvedBy === "chromium").length,
    passedAfterFallback: resolutions.filter((resolution) => resolution.resolvedBy === "none").length,
  };
}
