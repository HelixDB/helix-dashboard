'use client'

import { useEffect, useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Database, Network, ArrowRight } from "lucide-react"
import { schemaService, SchemaInfo, NodeType, EdgeType } from "@/utils/schema"

export default function SchemaPage() {
    const [schema, setSchema] = useState<SchemaInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchSchema = async () => {
            try {
                setLoading(true)
                const schemaData = await schemaService.getSchema()
                setSchema(schemaData)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch schema')
            } finally {
                setLoading(false)
            }
        }

        fetchSchema()
    }, [])

    const renderNodeCard = (node: NodeType) => (
        <Card key={node.name} className="mb-4">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    <CardTitle className="text-lg">{node.name}</CardTitle>
                    <Badge
                        variant="secondary"
                        className="text-xs font-semibold"
                        style={{
                            backgroundColor: '#98BB6C33',
                            color: '#98BB6C',
                            border: '1px solid #98BB6C'
                        }}
                    >
                        Node
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground">Properties:</h4>
                    {Object.keys(node.properties).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(node.properties).map(([key, type]) => (
                                <div key={key} className="flex justify-between items-center p-2 bg-muted rounded">
                                    <span className="font-medium">{key}</span>
                                    <Badge variant="outline">{type}</Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No properties defined</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    const renderEdgeCard = (edge: EdgeType) => (
        <Card key={edge.name} className="mb-4">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    <CardTitle className="text-lg">{edge.name}</CardTitle>
                    <Badge
                        variant="secondary"
                        className="text-xs font-semibold"
                        style={{
                            backgroundColor: '#7E9CD833',
                            color: '#7E9CD8',
                            border: '1px solid #7E9CD8'
                        }}
                    >
                        Edge
                    </Badge>
                </div>
                <CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">{edge.from_node}</Badge>
                        <ArrowRight className="h-4 w-4" />
                        <Badge variant="outline">{edge.to_node}</Badge>
                    </div>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground">Properties:</h4>
                    {Object.keys(edge.properties).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(edge.properties).map(([key, type]) => (
                                <div key={key} className="flex justify-between items-center p-2 bg-muted rounded">
                                    <span className="font-medium">{key}</span>
                                    <Badge variant="outline">{type}</Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No properties defined</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4"
                        />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="/dashboard">
                                        Dashboard
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Schema</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-96">
                            <div className="text-center">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                                <h1 className="text-2xl font-bold text-muted-foreground">Loading Schema</h1>
                                <p className="text-muted-foreground mt-2">Fetching schema from backend...</p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-96">
                            <div className="text-center">
                                <h1 className="text-2xl font-bold text-destructive">Error</h1>
                                <p className="text-muted-foreground mt-2">{error}</p>
                            </div>
                        </div>
                    ) : schema ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <h1 className="text-3xl font-bold">Database Schema</h1>
                                <div className="flex gap-2">
                                    <Badge
                                        variant="secondary"
                                        style={{
                                            backgroundColor: '#98BB6C33',
                                            color: '#98BB6C',
                                            border: '1px solid #98BB6C'
                                        }}
                                    >
                                        {schema.nodes.length} Nodes
                                    </Badge>
                                    <Badge
                                        variant="secondary"
                                        style={{
                                            backgroundColor: '#7E9CD833',
                                            color: '#7E9CD8',
                                            border: '1px solid #7E9CD8'
                                        }}
                                    >
                                        {schema.edges.length} Edges
                                    </Badge>
                                </div>
                            </div>

                            {schema.nodes.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-semibold mb-4">Nodes</h2>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {schema.nodes.map(renderNodeCard)}
                                    </div>
                                </div>
                            )}

                            {schema.edges.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-semibold mb-4">Relationships</h2>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {schema.edges.map(renderEdgeCard)}
                                    </div>
                                </div>
                            )}

                            {schema.nodes.length === 0 && schema.edges.length === 0 && (
                                <div className="flex items-center justify-center h-96">
                                    <div className="text-center">
                                        <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                                        <h1 className="text-2xl font-bold text-muted-foreground">No Schema Found</h1>
                                        <p className="text-muted-foreground mt-2">
                                            The schema appears to be empty. Check your backend configuration.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}