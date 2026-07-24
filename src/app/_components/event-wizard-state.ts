import type { EventStepReadiness } from "@/modules/events";

export const EVENT_WIZARD_STEPS = [
  "details",
  "schedule",
  "location",
  "photos",
  "review",
] as const;

export type EventWizardStep = (typeof EVENT_WIZARD_STEPS)[number];

export function completedWizardSteps(
  steps: EventStepReadiness,
): Readonly<Record<EventWizardStep, boolean>> {
  return {
    details: steps.detailsComplete,
    schedule: steps.scheduleComplete,
    location: steps.locationComplete,
    photos: steps.photosComplete,
    review: steps.reviewReady,
  };
}

export function resumeEventWizardStep(
  steps: EventStepReadiness,
): EventWizardStep {
  if (!steps.detailsComplete) return "details";
  if (!steps.scheduleComplete) return "schedule";
  if (!steps.locationComplete) return "location";
  if (!steps.photosComplete) return "photos";
  return "review";
}

export function wizardStepAvailable(
  target: EventWizardStep,
  steps: EventStepReadiness,
): boolean {
  if (target === "photos") {
    return steps.detailsComplete && steps.scheduleComplete;
  }
  if (target === "review") {
    return (
      steps.detailsComplete && steps.scheduleComplete && steps.photosComplete
    );
  }
  const index = EVENT_WIZARD_STEPS.indexOf(target);
  const complete = completedWizardSteps(steps);
  return EVENT_WIZARD_STEPS.slice(0, index).every((step) => complete[step]);
}
