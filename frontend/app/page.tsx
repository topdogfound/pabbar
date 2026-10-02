import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { getSession } from "@/lib/session";

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  return <Landing />;
}
