import { runInNewContext } from "node:vm";
import type * as ReactModule from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactModule>()),
  useRef: () => ({ current: null }),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
import { GoogleAnalytics } from "@/app/_components/google-analytics";

afterEach(() => {
  navigation.path = "/";
});

describe("analytics document", () => {
  it("does not load Google on private pages or with an invalid measurement ID", () => {
    navigation.path = "/dashboard/events/private/payment/success";
    expect(
      GoogleAnalytics({
        measurementId: "G-4LYJ726JEQ",
        origin: "https://sales.example.test",
      }),
    ).toBeNull();
    navigation.path = "/";
    expect(
      GoogleAnalytics({
        measurementId: "",
        origin: "https://sales.example.test",
      }),
    ).toBeNull();
  });

  it("accepts exactly one public pageview from its own parent origin", () => {
    const frame = GoogleAnalytics({
      measurementId: "G-4LYJ726JEQ",
      origin: "https://sales.example.test",
    });
    const script = (frame!.props.srcDoc as string).match(
      /<script>([\s\S]*?)<\/script>/u,
    )![1]!;
    const parent = {};
    const dataLayer: Array<ArrayLike<unknown>> = [];
    let listener: (event: object) => void = () => {};
    runInNewContext(script, {
      window: { dataLayer },
      dataLayer,
      parent,
      addEventListener: (_type: string, callback: typeof listener) => {
        listener = callback;
      },
    });
    const event = {
      source: parent,
      origin: "https://sales.example.test",
      data: {
        type: "public-pageview",
        location: "https://sales.example.test/search",
        title: "Find sales",
      },
    };
    listener({ ...event, origin: "https://evil.test" });
    listener({ ...event, source: {} });
    expect(dataLayer).toHaveLength(0);
    listener(event);
    listener(event);
    expect(dataLayer).toHaveLength(3);
    expect(Array.from(dataLayer[1]!)).toEqual([
      "config",
      "G-4LYJ726JEQ",
      {
        page_location: event.data.location,
        page_title: "Find sales",
        page_referrer: "",
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
  });
});
