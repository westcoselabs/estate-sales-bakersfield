import { describe, expect, it } from "vitest";

import {
  resumeEventWizardStep,
  wizardStepAvailable,
} from "@/app/_components/event-wizard-state";
import type { EventStepReadiness } from "@/modules/events";

function readiness(
  changes: Partial<EventStepReadiness> = {},
): EventStepReadiness {
  return {
    detailsComplete: false,
    scheduleComplete: false,
    locationComplete: false,
    photosComplete: false,
    reviewReady: false,
    ...changes,
  };
}

describe("event wizard server-owned resume state", () => {
  it("opens the first incomplete step and resumes review when complete", () => {
    expect(resumeEventWizardStep(readiness())).toBe("details");
    expect(resumeEventWizardStep(readiness({ detailsComplete: true }))).toBe(
      "schedule",
    );
    expect(
      resumeEventWizardStep(
        readiness({ detailsComplete: true, scheduleComplete: true }),
      ),
    ).toBe("location");
    expect(
      resumeEventWizardStep(
        readiness({
          detailsComplete: true,
          scheduleComplete: true,
          locationComplete: true,
        }),
      ),
    ).toBe("photos");
    expect(
      resumeEventWizardStep(
        readiness({
          detailsComplete: true,
          scheduleComplete: true,
          locationComplete: true,
          photosComplete: true,
          reviewReady: true,
        }),
      ),
    ).toBe("review");
  });

  it("keeps future steps unavailable while completed earlier steps reopen", () => {
    const steps = readiness({ detailsComplete: true });
    expect(wizardStepAvailable("details", steps)).toBe(true);
    expect(wizardStepAvailable("schedule", steps)).toBe(true);
    expect(wizardStepAvailable("location", steps)).toBe(false);
  });
});
