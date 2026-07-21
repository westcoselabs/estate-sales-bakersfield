import type { OrganizerProfile } from "../domain/types";

export interface OrganizerAuditContext {
  readonly requestId?: string;
}

export interface OrganizerProfileRepository {
  findByUserId(userId: string): Promise<OrganizerProfile | null>;
  saveForUser(input: {
    readonly userId: string;
    readonly displayName: string | null;
    readonly contactName: string | null;
    readonly contactEmail: string | null;
    readonly contactPhone: string | null;
    readonly websiteUrl: string | null;
    readonly status: "INCOMPLETE" | "COMPLETE";
    readonly audit: OrganizerAuditContext;
  }): Promise<OrganizerProfile>;
}
