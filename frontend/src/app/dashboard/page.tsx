import { AppSidebar } from "@/components/app-sidebar"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

export default function Page() {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 glass border-0 border-b border-sidebar-border">
                    <div className="flex items-center gap-2 px-4 w-full">
                        <SidebarTrigger className="-ml-1 glass-hover rounded-lg p-2" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4 bg-sidebar-border/50"
                        />
                        <span className="text-foreground font-semibold tracking-wide">
                            Dashboard
                        </span>
                    </div>
                </header>
                <div className="flex flex-1 flex-col items-center justify-center p-6">
                    <div className="text-center space-y-4">
                        <h1 className="text-4xl font-bold text-muted-foreground">Coming Soon</h1>
                        <p className="text-lg text-muted-foreground">Dashboard analytics and insights are under development</p>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
