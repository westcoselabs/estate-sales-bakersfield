export type OrganizerOnboardingStatus = "INCOMPLETE" | "COMPLETE";

export interface OrganizerProfile {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly status: OrganizerOnboardingStatus;
  readonly updatedAt: Date;
}

export interface OrganizerProfileDto {
  readonly id: string;
  readonly displayName: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly status: OrganizerOnboardingStatus;
  readonly updatedAt: string;
}
