import { getServerApplicationUrl } from "@/platform/config/application-url";
import { analyticsDocument } from "@/platform/seo/analytics-document";
import { validMeasurementId } from "@/platform/seo/analytics-policy";

export const dynamic = "force-dynamic";

export function GET() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
  if (
    process.env.APP_ENV !== "production" ||
    !validMeasurementId(measurementId)
  ) {
    return new Response(null, { status: 404 });
  }
  return new Response(
    analyticsDocument(measurementId, getServerApplicationUrl().origin),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
