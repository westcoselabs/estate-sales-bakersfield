import { redirect } from "next/navigation";

export default async function OrganizerPage() {
  redirect("/dashboard/profile");
}
