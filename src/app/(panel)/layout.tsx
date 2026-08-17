import {redirect}        from "next/navigation";
import {getSession}      from "@/lib/auth/session";
import {isSetupComplete} from "@/lib/settings";
import {AppShell}        from "@/components/app-shell";
import {getDb}           from "@/lib/db";
import {ensureDataDirs}  from "@/lib/paths";
import {listAccessibleServers} from "@/lib/permissions";
import {getTemplate}     from "@/lib/templates/load";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children, }: { children: React.ReactNode; }) {
    ensureDataDirs();
    getDb();
    if (!isSetupComplete()) redirect("/setup");
    const session = await getSession();
    if (!session) redirect("/login");

    const servers = listAccessibleServers(session).map((s) => ({
        id: s.id,
        name: s.name,
        templateId: s.templateId,
        status: s.status,
    }));

    const templateNames: Record<string, string> = {};
    for (const s of servers) {
        if (templateNames[s.templateId]) continue;
        templateNames[s.templateId] =
            getTemplate(s.templateId)?.name ?? s.templateId;
    }

    return (
        <AppShell user={session} servers={servers} templateNames={templateNames}>
            {children}
        </AppShell>
    );
}