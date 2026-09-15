import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConfiguredLocalMediaStore,
  createConfiguredMediaStore,
} from "@/modules/media/infrastructure/configured-media";
import { FileMediaStore } from "@/modules/media/infrastructure/file-media-store";
import { PUT } from "@/app/api/local-media-upload/route";

const configuration = vi.hoisted(() => ({
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
  AUTH_FINGERPRINT_SECRET: "local-signing-fixture-with-at-least-32-characters",
  BLOB_READ_WRITE_TOKEN: undefined as string | undefined,
}));
vi.mock("@/platform/config/env", () => ({
  getServerEnvironment: () => configuration,
}));

beforeEach(() => {
  configuration.APP_ENV = "local";
  configuration.BLOB_READ_WRITE_TOKEN = undefined;
  vi.stubEnv("APP_ENV", "local");
});
afterEach(() => vi.unstubAllEnvs());

describe("configured local media", () => {
  it("uses private filesystem storage without a cloud token", () => {
    expect(createConfiguredMediaStore()).toBeInstanceOf(FileMediaStore);
    expect(createConfiguredLocalMediaStore().environment).toBe("local");
  });
  it.each(["production", "preview"])(
    "does not enable filesystem uploads in %s",
    async (environment) => {
      configuration.APP_ENV = environment;
      vi.stubEnv("APP_ENV", environment);
      expect(createConfiguredMediaStore()).not.toBeInstanceOf(FileMediaStore);
      expect(() => createConfiguredLocalMediaStore()).toThrow(
        "Local uploads are disabled",
      );
      expect(
        (
          await PUT(
            new Request("http://localhost:3000/api/local-media-upload", {
              method: "PUT",
              body: "photo",
            }),
          )
        ).status,
      ).toBe(404);
    },
  );
  it("rejects unsigned uploads in local mode", async () => {
    expect(
      (
        await PUT(
          new Request("http://localhost:3000/api/local-media-upload", {
            method: "PUT",
            body: "photo",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("keeps configured cloud storage selected", () => {
    configuration.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_local_fixture";
    expect(createConfiguredMediaStore()).not.toBeInstanceOf(FileMediaStore);
    expect(() => createConfiguredLocalMediaStore()).toThrow(
      "Local file storage is not active",
    );
  });
});
