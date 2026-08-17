import { getSession } from "@/lib/auth/session";
import { reconcileServers } from "@/lib/docker/servers";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await getSession();
  try {
    await reconcileServers();
  } catch {
    /* docker may be unavailable in build/dev without socket */
  }
  return <DashboardView />;
}
