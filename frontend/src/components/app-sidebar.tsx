"use client"

import * as React from "react"
import {
    AudioWaveform,
    Command,
    GalleryVerticalEnd,
    Zap,
    BarChart3,
    Database,
    Eye,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar"

const data = {
    // user: {
    //     name: "shadcn",
    //     email: "m@example.com",
    //     avatar: "/avatars/shadcn.jpg",
    // },
    teams: [
        {
            name: "HelixDB",
            logo: Database,
        },
    ],
    navMain: [],
    projects: [
        {
            name: "Queries",
            url: "/dashboard/queries",
            icon: Zap,
        },
        {
            name: "Schema",
            url: "/dashboard/schema",
            icon: Database,
        },
        // {
        //     name: "Visualization",
        //     url: "/dashboard/visualization",
        //     icon: Eye,
        // },
        // {
        //     name: "Analytics",
        //     url: "/dashboard/analytics",
        //     icon: BarChart3,
        // },
    ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TeamSwitcher teams={data.teams} />
            </SidebarHeader>
            <SidebarContent>
                <NavProjects projects={data.projects} />
            </SidebarContent>
            {/* <SidebarFooter>
                <NavUser user={data.user} />
            </SidebarFooter> */}
            <SidebarRail />
        </Sidebar>
    )
}
