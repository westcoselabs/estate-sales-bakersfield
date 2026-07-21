import type { OrganizerProfile, OrganizerProfileDto } from "../domain/types";
import type {
  OrganizerAuditContext,
  OrganizerProfileRepository,
} from "./ports";
import type { OrganizerProfileInput } from "./schemas";

function toDto(profile: OrganizerProfile): OrganizerProfileDto {
  return {
    id: profile.id,
    displayName: profile.displayName,
    contactName: profile.contactName,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    websiteUrl: profile.websiteUrl,
    status: profile.status,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export class OrganizerService {
  constructor(private readonly profiles: OrganizerProfileRepository) {}

  async getForUser(userId: string): Promise<OrganizerProfileDto | null> {
    const profile = await this.profiles.findByUserId(userId);
    return profile ? toDto(profile) : null;
  }

  async saveForUser(
    userId: string,
    input: OrganizerProfileInput,
    audit: OrganizerAuditContext = {},
  ): Promise<OrganizerProfileDto> {
    const status =
      input.displayName && input.contactName && input.contactEmail
        ? "COMPLETE"
        : "INCOMPLETE";
    const profile = await this.profiles.saveForUser({
      userId,
      ...input,
      status,
      audit,
    });
    return toDto(profile);
  }
}
