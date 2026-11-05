import { z } from "zod";

const details = {
  name: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  previewText: z.string().trim().max(200).optional(),
  draftHtml: z
    .string()
    .min(1)
    .max(250 * 1024)
    .optional(),
  contactCategory: z.enum(["ATTENDEE", "BUSINESS_OWNER"]).optional(),
  contactSourceTag: z.string().trim().min(1).max(80).optional(),
};
export const createCampaignSchema = z
  .object({
    ...details,
    templateRevisionId: z.uuid().optional(),
    listingIds: z.array(z.uuid()).min(1).max(6),
    selectionMode: z.enum([
      "ALL_ELIGIBLE",
      "SELECTED_USERS",
      "CONTACT_SEGMENT",
    ]),
    selectedUserIds: z.array(z.uuid()).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.templateRevisionId) === Boolean(value.draftHtml))
      context.addIssue({
        code: "custom",
        message: "Choose one published template or provide draft HTML.",
      });
    if (value.selectionMode === "CONTACT_SEGMENT") {
      if (
        !value.contactCategory ||
        !value.contactSourceTag ||
        value.selectedUserIds.length
      )
        context.addIssue({
          code: "custom",
          message:
            "Choose a contact category and source, without registered users.",
        });
    } else if (value.contactCategory || value.contactSourceTag)
      context.addIssue({
        code: "custom",
        message: "Contact filters require a contact audience.",
      });
  });
export const updateCampaignSchema = z
  .object({ ...details, expectedVersion: z.number().int().positive() })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.contactCategory) !== Boolean(value.contactSourceTag))
      context.addIssue({
        code: "custom",
        message: "Choose both a category and source.",
      });
  });
