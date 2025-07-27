'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, GitBranch, Circle, RotateCcw, Download, Check, ChevronDown, Search, X } from 'lucide-react';

interface DataItem {
    id: string;
    label?: string;
    name?: string;
    [key: string]: any;
}

interface QueryOption {
    value: string;
    label: string;
    method: string;
    type: 'node' | 'edge' | 'vector';
}

interface ApiResponse {
    [key: string]: DataItem[] | any;
}

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const DataVisualization = () => {
    const fgRef = useRef<any>(null);
    const [allNodes, setAllNodes] = useState<Map<string, DataItem>>(new Map());
    const [edgeData, setEdgeData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [queries, setQueries] = useState<QueryOption[]>([]);
    const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
    const [loadingQueries, setLoadingQueries] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    const getNodeColor = useCallback((item: DataItem): string => {
        const label = item.label?.toLowerCase() || '';
        const hash = label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#f97316', '#a855f7'];
        return colors[hash % colors.length] || '#6b7280';
    }, []);

    const formatFieldType = (key: string, value: any): string => {
        if (key === 'id' || key.endsWith('_id')) return 'ID';
        if (typeof value === 'number') return Number.isInteger(value) ? 'I32' : 'F64';
        if (typeof value === 'string') return 'String';
        if (typeof value === 'boolean') return 'Bool';
        if (Array.isArray(value)) return '[F64]';
        return 'String';
    };

    const drawNode = (node: any, ctx: CanvasRenderingContext2D, _globalScale: number, isHovered: boolean) => {
        const data = node.originalData as DataItem;
        const label = data.label || 'Entity';
        const allFields = Object.entries(data).filter(([key]) => key !== 'label' && key !== 'id');
        const fields = allFields.slice(0, 5);

        const padding = 12;
        const fontSize = 11;
        const headerFontSize = 14;
        const typeFontSize = 9;

        ctx.font = `${headerFontSize}px monospace bold`;
        let maxWidth = ctx.measureText(label).width;

        ctx.font = `${fontSize}px monospace`;
        fields.forEach(([key, value]) => {
            const displayValue = typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : value;
            const text = `${key}: ${displayValue}`;
            maxWidth = Math.max(maxWidth, ctx.measureText(text).width + ctx.measureText(' I32').width);
        });

        const cardWidth = maxWidth + padding * 3;
        const fieldHeight = fontSize * 1.2;
        let cardHeight = headerFontSize + padding * 2 + fields.length * fieldHeight;
        if (allFields.length > 5) cardHeight += fieldHeight;

        // Background
        ctx.fillStyle = 'rgba(42, 42, 42, 0.98)';
        ctx.fillRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, cardHeight);

        // Border
        ctx.strokeStyle = isHovered ? '#10b981' : 'rgba(80, 80, 80, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, cardHeight);

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `${headerFontSize}px monospace bold`;
        ctx.fillText(label, node.x, node.y - cardHeight / 2 + headerFontSize + padding / 2);

        // Fields
        let yPos = node.y - cardHeight / 2 + headerFontSize + padding * 1.5;
        ctx.textAlign = 'left';
        ctx.font = `${fontSize}px monospace`;
        fields.forEach(([key, value]) => {
            const fieldType = formatFieldType(key, value);
            const displayValue = typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : String(value);
            const isId = key === 'id';

            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`${key}:`, node.x - cardWidth / 2 + padding, yPos + fontSize / 1.5);

            ctx.fillStyle = isId ? '#10b981' : '#e2e8f0';
            ctx.fillText(displayValue, node.x - cardWidth / 2 + padding + ctx.measureText(`${key}: `).width, yPos + fontSize / 1.5);

            ctx.fillStyle = '#64748b';
            ctx.font = `${typeFontSize}px monospace`;
            ctx.fillText(fieldType, node.x + cardWidth / 2 - padding - ctx.measureText(fieldType).width, yPos + fontSize / 1.5);
            ctx.font = `${fontSize}px monospace`;

            yPos += fieldHeight;
        });

        if (allFields.length > 5) {
            ctx.fillStyle = '#10b981';
            ctx.textAlign = 'center';
            ctx.fillText(`+ ${allFields.length - 5} More`, node.x, yPos + fontSize / 1.5);
        }

        node.__cardDimensions = [cardWidth, cardHeight];
    };

    const graphData = useMemo(() => {
        const nodes = Array.from(allNodes.values()).map(item => ({
            id: item.id,
            originalData: item,
            color: getNodeColor(item),
            x: (Math.random() - 0.5) * 1000,
            y: (Math.random() - 0.5) * 1000,
        }));
        const links = edgeData.map(edge => ({
            source: edge.from_node,
            target: edge.to_node,
            label: edge.label,
        }));
        return { nodes, links };
    }, [allNodes, edgeData, getNodeColor]);

    const fetchQueries = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8080/api/endpoints');
            const data = await response.json();

            const queryOptions: QueryOption[] = data.map((endpoint: any) => {
                let type: 'node' | 'edge' | 'vector' = 'node';
                if (endpoint.query_name.toLowerCase().includes('edge') ||
                    endpoint.query_name.toLowerCase().includes('assign') ||
                    endpoint.query_name.toLowerCase().includes('link') ||
                    endpoint.query_name.toLowerCase().includes('referral')) {
                    type = 'edge';
                } else if (endpoint.query_name.toLowerCase().includes('vector') ||
                    endpoint.query_name.toLowerCase().includes('note')) {
                    type = 'vector';
                }
                return {
                    value: endpoint.query_name,
                    label: endpoint.query_name
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str: string) => str.toUpperCase())
                        .trim(),
                    method: endpoint.method,
                    type
                };
            });

            setQueries(queryOptions);
            setLoadingQueries(false);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
            setLoadingQueries(false);
        }
    };

    useEffect(() => {
        fetchQueries();
    }, []);

    const executeQueries = async () => {
        if (selectedQueries.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const promises = selectedQueries.map(async (queryName) => {
                const queryOption = queries.find(q => q.value === queryName);
                if (!queryOption) return null;

                const response = await fetch(`http://127.0.0.1:8080/api/query/${queryName}`);
                if (!response.ok) {
                    throw new Error(`HTTP error for ${queryName}! status: ${response.status}`);
                }

                const data: ApiResponse = await response.json();
                return { queryOption, data };
            });

            const results = await Promise.all(promises);

            const newNodes = new Map(allNodes);
            const newEdges: any[] = [];

            results.forEach((result) => {
                if (!result) return;

                const { queryOption, data } = result;

                let dataArray: DataItem[] = [];
                for (const key in data) {
                    if (Array.isArray(data[key])) {
                        dataArray = data[key];
                        break;
                    }
                }
                if (dataArray.length === 0 && Array.isArray(data)) {
                    dataArray = data;
                }

                if (queryOption.type === 'edge') {
                    newEdges.push(...dataArray);
                } else {
                    dataArray.forEach(item => {
                        newNodes.set(item.id, item);
                    });
                }
            });

            setAllNodes(newNodes);
            setEdgeData(newEdges);
        } catch (error) {
            console.error('Failed to execute queries:', error);
            setError(error instanceof Error ? error.message : 'Failed to execute queries');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            // Configure forces for initial spacing
            fgRef.current.d3Force('charge').strength(-800);
            fgRef.current.d3Force('link').distance(200).strength(0.5);
            fgRef.current.d3Force('center').strength(0.1);

            fgRef.current.zoomToFit(400, 200);

            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.d3Force('charge').strength(-400);
                    fgRef.current.d3Force('link').strength(0.2);
                    fgRef.current.d3Force('center').strength(0.01);
                }
            }, 3000);
        }
    }, [graphData]);

    const toggleQuery = (queryValue: string) => {
        setSelectedQueries(prev =>
            prev.includes(queryValue)
                ? prev.filter(q => q !== queryValue)
                : [...prev, queryValue]
        );
    };

    const clearGraph = () => {
        setAllNodes(new Map());
        setEdgeData([]);
        setSelectedQueries([]);
    };

    if (loading) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading data...</div>;
    }

    if (error) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'red' }}>Error: {error}</div>;
    }

    return (
        <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10 }}>
                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            {selectedQueries.length === 0 ? (loadingQueries ? 'Loading...' : 'Select queries') : `${selectedQueries.length} selected`}
                            <ChevronDown size={16} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent style={{ width: 300, maxHeight: 400, overflowY: 'auto' }}>
                        <DropdownMenuLabel>Select queries</DropdownMenuLabel>
                        <div style={{ padding: '0 8px' }}>
                            <Input
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            />
                        </div>
                        <DropdownMenuSeparator />
                        {/* Node, Edge, Vector sections similar to existing */}
                        <DropdownMenuLabel>Node Operations</DropdownMenuLabel>
                        {queries.filter(q => q.type === 'node' && q.label.toLowerCase().includes(searchTerm.toLowerCase())).map(q => (
                            <DropdownMenuCheckboxItem
                                key={q.value}
                                checked={selectedQueries.includes(q.value)}
                                onCheckedChange={() => toggleQuery(q.value)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {q.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Edge Operations</DropdownMenuLabel>
                        {queries.filter(q => q.type === 'edge' && q.label.toLowerCase().includes(searchTerm.toLowerCase())).map(q => (
                            <DropdownMenuCheckboxItem
                                key={q.value}
                                checked={selectedQueries.includes(q.value)}
                                onCheckedChange={() => toggleQuery(q.value)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {q.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Vector Operations</DropdownMenuLabel>
                        {queries.filter(q => q.type === 'vector' && q.label.toLowerCase().includes(searchTerm.toLowerCase())).map(q => (
                            <DropdownMenuCheckboxItem
                                key={q.value}
                                checked={selectedQueries.includes(q.value)}
                                onCheckedChange={() => toggleQuery(q.value)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {q.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={executeQueries} disabled={selectedQueries.length === 0 || loading}>
                    <Plus size={16} /> Add to Graph
                </Button>
                <Button onClick={clearGraph}>
                    <RotateCcw size={16} /> Clear
                </Button>
            </div>
            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                nodeCanvasObject={(node, ctx, globalScale) => drawNode(node, ctx, globalScale, node.id === hoveredNodeId)}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                    if (node.__cardDimensions) {
                        const [w, h] = node.__cardDimensions;
                        ctx.fillStyle = color;
                        ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
                    }
                }}
                onNodeHover={(node: any) => setHoveredNodeId(node ? node.id : null)}
                onNodeClick={(node: any) => {
                    if (fgRef.current) {
                        fgRef.current.centerAt(node.x, node.y, 400);
                        fgRef.current.zoom(2, 400);
                    }
                }}
                linkColor={() => 'rgba(150, 150, 150, 0.6)'}
                linkWidth={2}
                linkDirectionalParticles={(link: any) => {
                    if (hoveredNodeId && (link.source.id === hoveredNodeId || link.target.id === hoveredNodeId)) return 2;
                    return 0;
                }}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalArrowLength={6}
                linkDirectionalArrowRelPos={1}
                cooldownTicks={100}
                cooldownTime={10000}
                backgroundColor="#1a1a1a"
                d3AlphaDecay={0.05}
                d3VelocityDecay={0.7}
                d3AlphaMin={0.0001}
                warmupTicks={50}
                enableNodeDrag={true}
                onNodeDrag={(node: any) => {
                    node.fx = node.x;
                    node.fy = node.y;

                    if (fgRef.current) {
                        fgRef.current.d3Force('charge').strength(-50);
                        fgRef.current.d3Force('link').strength(0.8);
                    }
                }}
                onNodeDragEnd={(node: any) => {
                    // Keep the dragged node fixed where user placed it
                    node.fx = node.x;
                    node.fy = node.y;

                    // Restore normal forces after drag
                    if (fgRef.current) {
                        fgRef.current.d3Force('charge').strength(-400);
                        fgRef.current.d3Force('link').strength(0.2);
                    }

                    // Mark this node as user dragged so it stays fixed
                    node._userDragged = true;
                }}
            />
        </div>
    );
};

export default DataVisualization;
