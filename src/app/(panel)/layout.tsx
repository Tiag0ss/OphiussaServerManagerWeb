import {redirect}        from "next/navigation";
import {getSession}      from "@/lib/auth/session";
import {isSetupComplete} from "@/lib/settings";
import {AppShell}        from "@/components/app-shell";
import {getDb}           from "@/lib/db";
import {ensureDataDirs}  from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children, }: { children: React.ReactNode; }) {
    ensureDataDirs();
    getDb();
    if (!isSetupComplete()) redirect("/setup");
    const session = await getSession();
    if (!session) redirect("/login");
    return <AppShell user={session}>{children}</AppShell>;
}