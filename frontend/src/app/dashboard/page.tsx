"use client"

import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Database, 
    ChevronRight,
    Activity,
    Zap,
    Eye,
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import TextType from '@/components/TextType';

export default function Page() {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="relative">
                <header className="relative z-10 flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4"
                        />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Dashboard</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>   
                <div className="relative z-10 flex flex-1 flex-col gap-6 p-6">
                    {/* Welcome Section */}
                    <div className="text-center space-y-0 py-3">
                        <div className="flex items-center justify-center space-x-2 mb-4">
                            {/* <h1 className="text-3xl font-bold text-foreground">Welcome to HelixDB Dashboard</h1> */}
                            <TextType className="text-4xl font-bold text-foreground" text="Welcome to HelixDB Dashboard" typingSpeed={100} loop={false} as="h1" showCursor={false} />
                        </div>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                            Your database analytics and visualization platform.
                        </p>
                        <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                            Explore your data through powerful queries, interactive visualizations, and comprehensive schema analysis.
                        </p>
                    </div>

                    {/* Navigation Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
                        {/* <Link href="/dashboard/analytics" className="group">
                            <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer glass-hover">
                                <CardHeader className="text-center">
                                    <div className="mx-auto h-16 w-16 rounded-lg glass-card flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                                        <Activity className="h-8 w-8 text-primary" />
                                    </div>
                                    <CardTitle className="text-xl">Analytics</CardTitle>
                                    <CardDescription className="text-center">
                                        Monitor database performance, view real-time metrics, and analyze query patterns 
                                        with interactive charts and insights.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button variant="outline" className="w-full group-hover:bg-accent">
                                        View Analytics
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        </Link> */}

                        <Link href="/dashboard/queries" className="group">
                            <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer glass-hover">
                                <CardHeader className="text-center">
                                    <div className="mx-auto h-16 w-16 rounded-lg glass-card flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                                        <Zap className="h-8 w-8 text-primary" />
                                    </div>
                                    <CardTitle className="text-xl">Queries</CardTitle>
                                    <CardDescription className="text-center">
                                        Run Helix queries in the browser with intuitive inputs and a live result viewer
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button variant="outline" className="w-full group-hover:bg-accent">
                                        Start Querying
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        </Link>

                        <Link href="/dashboard/schema" className="group">
                            <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer glass-hover">
                                <CardHeader className="text-center">
                                    <div className="mx-auto h-16 w-16 rounded-lg glass-card flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                                        <Database className="h-8 w-8 text-primary" />
                                    </div>
                                    <CardTitle className="text-xl">Schema</CardTitle>
                                    <CardDescription className="text-center">
                                        Browse nodes, vectors, and relationships with the schema explorer
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button variant="outline" className="w-full group-hover:bg-accent">
                                        Explore Schema
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        </Link>

                        <Link href="/dashboard/visualize" className="group">
                            <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer glass-hover">
                                <CardHeader className="text-center">
                                    <div className="mx-auto h-16 w-16 rounded-lg glass-card flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                                        <Eye className="h-8 w-8 text-primary" />
                                    </div>
                                    <CardTitle className="text-xl">Visualizations</CardTitle>
                                    <CardDescription className="text-center">
                                        Visualize your data in real-time with a graph visualization tool.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Button variant="outline" className="w-full group-hover:bg-accent">
                                        Real-time Visualizations
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        </Link>
                    </div>

                    {/* Quick Tips */}
                    <div className="max-w-3xl mx-auto w-full">
                        <Card className="glass-card">
                            <CardHeader>
                                <CardTitle className="text-center">Quick Start Tips</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="flex items-start space-x-2">
                                        <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                                        <div>
                                            <p className="font-medium">New to HelixDB?</p>
                                            <p className="text-muted-foreground">
                                                Check out our <Link href="https://docs.helix-db.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">documentation</Link> to get started.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start space-x-2">
                                        <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                                        <div>
                                            <p className="font-medium">Need real-time visual insights?</p>
                                            <p className="text-muted-foreground">Use the <Link href="/dashboard/visualize" className="text-primary hover:underline">visualization tool</Link> to visualize your data in real-time in a graph.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start space-x-2">
                                        <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                                        <div>
                                            <p className="font-medium">Want to run queries?</p>
                                            <p className="text-muted-foreground">Try the <Link href="/dashboard/queries" className="text-primary hover:underline">query tool</Link> with a built-in query input builder and live result viewer.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start space-x-2">
                                        <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                                        <div>
                                            <p className="font-medium">Need to explore the schema?</p>
                                            <p className="text-muted-foreground">Try the <Link href="/dashboard/schema" className="text-primary hover:underline">schema tool</Link> to browse nodes, vectors, and relationships.</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

            </SidebarInset>
        </SidebarProvider>
    )
}
