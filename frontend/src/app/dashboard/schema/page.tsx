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
import { Loader2, Database, Network, Zap } from "lucide-react"
import { schemaService, SchemaInfo, NodeType, EdgeType, VectorType } from "@/utils/schema"

export default function SchemaPage() {
    const [schema, setSchema] = useState<SchemaInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'nodes' | 'relationships' | 'vectors'>('nodes')

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

    const renderVectorCard = (vector: VectorType) => (
        <Card key={vector.name} className="mb-4">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    <CardTitle className="text-lg">{vector.name}</CardTitle>
                    <Badge
                        variant="secondary"
                        className="text-xs font-semibold"
                        style={{
                            backgroundColor: 'rgb(93, 51, 14)',
                            color: 'rgb(187, 145, 108)',
                            border: '1px solid rgb(187, 145, 108)'
                        }}
                    >
                        Vector
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground">Properties:</h4>
                    {Object.keys(vector.properties).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(vector.properties).map(([key, type]) => (
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
                        <span className="text-muted-foreground">→</span>
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
                        <div className="space-y-0">
                            <div className="flex items-center gap-4 mb-4">
                                <h1 className="text-3xl font-bold">Database Schema</h1>
                                <Badge variant="secondary" className="text-sm">
                                    {schema.nodes.length + schema.edges.length + schema.vectors.length} Total Types
                                </Badge>
                            </div>

                            {/* Tab Bar */}
                            <div className="flex items-center gap-0.5">
                                <div
                                    className={`flex items-center gap-2 px-3 rounded-t-lg border-l border-r border-t min-w-0 cursor-pointer ${activeTab === 'nodes'
                                        ? 'bg-background border-border border-b-0 relative z-10 py-1.5 pb-2'
                                        : 'bg-muted/50 border-border border-b hover:bg-muted py-1.5'
                                        }`}
                                    onClick={() => setActiveTab('nodes')}
                                >
                                    <Database className="h-3 w-3 flex-shrink-0" />
                                    <span className="text-sm">
                                        Nodes ({schema.nodes.length})
                                    </span>
                                </div>
                                <div
                                    className={`flex items-center gap-2 px-3 rounded-t-lg border-l border-r border-t min-w-0 cursor-pointer ${activeTab === 'relationships'
                                        ? 'bg-background border-border border-b-0 relative z-10 py-1.5 pb-2'
                                        : 'bg-muted/50 border-border border-b hover:bg-muted py-1.5'
                                        }`}
                                    onClick={() => setActiveTab('relationships')}
                                >
                                    <Network className="h-3 w-3 flex-shrink-0" />
                                    <span className="text-sm">
                                        Relationships ({schema.edges.length})
                                    </span>
                                </div>
                                <div
                                    className={`flex items-center gap-2 px-3 rounded-t-lg border-l border-r border-t min-w-0 cursor-pointer ${activeTab === 'vectors'
                                        ? 'bg-background border-border border-b-0 relative z-10 py-1.5 pb-2'
                                        : 'bg-muted/50 border-border border-b hover:bg-muted py-1.5'
                                        }`}
                                    onClick={() => setActiveTab('vectors')}
                                >
                                    <Zap className="h-3 w-3 flex-shrink-0" />
                                    <span className="text-sm">
                                        Vectors ({schema.vectors.length})
                                    </span>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="border border-border rounded-lg rounded-tl-none bg-background p-6 -mt-px">
                                {activeTab === 'nodes' && (
                                    schema.nodes.length > 0 ? (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {schema.nodes.map(renderNodeCard)}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-64">
                                            <div className="text-center">
                                                <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                                <h3 className="text-lg font-semibold text-muted-foreground">No Nodes Found</h3>
                                                <p className="text-muted-foreground mt-2">
                                                    No node types are defined in the schema.
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}

                                {activeTab === 'relationships' && (
                                    schema.edges.length > 0 ? (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {schema.edges.map(renderEdgeCard)}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-64">
                                            <div className="text-center">
                                                <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                                <h3 className="text-lg font-semibold text-muted-foreground">No Relationships Found</h3>
                                                <p className="text-muted-foreground mt-2">
                                                    No relationship types are defined in the schema.
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}

                                {activeTab === 'vectors' && (
                                    schema.vectors.length > 0 ? (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {schema.vectors.map(renderVectorCard)}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-64">
                                            <div className="text-center">
                                                <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                                <h3 className="text-lg font-semibold text-muted-foreground">No Vectors Found</h3>
                                                <p className="text-muted-foreground mt-2">
                                                    No vector types are defined in the schema.
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>

                            {schema.nodes.length === 0 && schema.edges.length === 0 && schema.vectors.length === 0 && (
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