import { DateSalesHub } from "@/app/_components/date-sales-hub";
import { salesHubMetadata } from "@/app/_components/sales-hub-data";
import type { PublicSearchRawQuery } from "@/modules/public-search";

export const dynamic = "force-dynamic";
type Props = { readonly searchParams: Promise<PublicSearchRawQuery> };
export async function generateMetadata({ searchParams }: Props) {
  return salesHubMetadata("yard-weekend", await searchParams);
}
export default async function YardSalesWeekendPage({ searchParams }: Props) {
  return <DateSalesHub hubKey="yard-weekend" query={await searchParams} />;
}
