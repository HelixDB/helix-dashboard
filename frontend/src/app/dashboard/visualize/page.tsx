'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useGraphData } from './hooks/useGraphData';
import { ControlPanel } from './components/ControlPanel';
import { LoadingOverlay } from './components/LoadingOverlay';
import { getNodeColor, getInitialNodePosition } from './utils/nodeUtils';
import { drawNode } from './utils/nodeRenderer';
import { graphEventHandlers, nodePointerAreaPaint } from './utils/graphEvents';
import {
    getForceConfig,
    getConnectionForceConfig,
    getInitialForceConfig,
    getSettledForceConfig,
    getZoomPadding,
    getSettleTime,
    getCooldownConfig,
    getGraphLimits
} from './utils/graphConfig';
import { GraphNode, GraphLink } from './types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const DataVisualization = () => {
    const fgRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const lastZoomRef = useRef<number>(1);
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingFocusRef = useRef<{ nodeId: string, position: { x: number, y: number } } | null>(null);

    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [topKInput, setTopKInput] = useState<string>('100');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [graphReady, setGraphReady] = useState(false);
    const [shouldZoomToFocus, setShouldZoomToFocus] = useState(false);
    const [isRepositioning, setIsRepositioning] = useState(false);
    const [nodeSpacing, setNodeSpacing] = useState<number>(1);

    const {
        allNodes,
        edgeData,
        loading,
        error,
        schema,
        selectedNodeLabel,
        setSelectedNodeLabel,
        loadingSchema,
        showAllNodes,
        setShowAllNodes,
        loadingConnections,
        showConnections,
        topK,
        setTopK,
        focusedNodeId,
        setFocusedNodeId,
        expandNodeConnections,
        loadConnections,
        clearGraph
    } = useGraphData();

    const graphData = useMemo(() => {
        const allNodesList = Array.from(allNodes.values()).map((item, index) => {
            const position = getInitialNodePosition(item, index, allNodes.size);
            return {
                id: item.id,
                originalData: item,
                color: getNodeColor(item),
                x: position.x,
                y: position.y,
            } as GraphNode;
        });

        let nodes = allNodesList;
        if (focusedNodeId) {
            nodes = allNodesList.filter(node => {
                if (node.id === focusedNodeId) return true;
                return edgeData.some(edge =>
                    (edge.from_node === focusedNodeId && edge.to_node === node.id) ||
                    (edge.to_node === focusedNodeId && edge.from_node === node.id)
                );
            });
        }

        const nodeIds = new Set(nodes.map(n => n.id));
        const links: GraphLink[] = edgeData
            .filter(edge => {
                const hasFrom = nodeIds.has(edge.from_node);
                const hasTo = nodeIds.has(edge.to_node);
                return hasFrom && hasTo;
            })
            .map(edge => ({
                source: edge.from_node,
                target: edge.to_node,
                label: edge.label,
                isVirtual: false
            }));

        return { nodes, links };
    }, [allNodes, edgeData, focusedNodeId]);

    const applyLimit = () => {
        const num = Number(topKInput);
        if (!isNaN(num) && num > 0 && num <= 300) {
            setTopK(num);
        } else {
            setTopKInput('100');
            setTopK(100);
        }
    };

    const handleNodeClick = useCallback((node: GraphNode, event: MouseEvent) => {
        graphEventHandlers.onNodeClick(node, event, {
            fgRef,
            expandedNodes,
            setExpandedNodes,
            expandNodeConnections,
            setFocusedNodeId,
            pendingFocusRef,
            setShouldZoomToFocus
        });
    }, [expandedNodes, expandNodeConnections]);

    const handleNodeDrag = useCallback((node: GraphNode) => {
        graphEventHandlers.onNodeDrag(node, { fgRef, isDraggingRef });
    }, []);

    const handleNodeDragEnd = useCallback((node: GraphNode) => {
        graphEventHandlers.onNodeDragEnd(node, { fgRef, isDraggingRef });
    }, []);

    const handleBackgroundClick = useCallback(() => {
        graphEventHandlers.onBackgroundClick({
            setFocusedNodeId,
            pendingFocusRef,
            fgRef
        });
    }, []);

    const handleZoom = useCallback((zoomEvent: { k: number }) => {
        graphEventHandlers.onZoom(zoomEvent, { zoomTimeoutRef, lastZoomRef });
    }, []);

    // Apply force configuration when graph is ready (without spacing)
    useEffect(() => {
        if (fgRef.current && graphReady) {
            const nodeCount = allNodes.size;
            const hasConnections = edgeData.length > 0;
            const config = getForceConfig(nodeCount, hasConnections, focusedNodeId);

            fgRef.current.d3Force('link').strength(config.linkStrength);
            fgRef.current.d3Force('charge').strength(config.chargeStrength);
            fgRef.current.d3Force('center').strength(config.centerStrength);

            if (config.linkDistance) {
                fgRef.current.d3Force('link').distance(config.linkDistance);
            }
        }
    }, [graphReady, allNodes.size, edgeData.length, focusedNodeId]);

    useEffect(() => {
        if (fgRef.current && graphReady && allNodes.size > 0) {
            const nodeCount = allNodes.size;
            const hasConnections = edgeData.length > 0;
            const config = getForceConfig(nodeCount, hasConnections, focusedNodeId);

            const adjustedChargeStrength = config.chargeStrength * (nodeSpacing * nodeSpacing);
            const adjustedLinkDistance = config.linkDistance ? config.linkDistance * nodeSpacing : 100 * nodeSpacing;

            fgRef.current.d3Force('charge').strength(adjustedChargeStrength);
            fgRef.current.d3Force('link').distance(adjustedLinkDistance);

            if (nodeSpacing < 1) {
                fgRef.current.d3Force('center').strength(0.3 * (2 - nodeSpacing));
                setTimeout(() => {
                    if (fgRef.current) {
                        fgRef.current.d3Force('center').strength(config.centerStrength);
                    }
                }, 1000);
            }

            fgRef.current.d3ReheatSimulation();

            if (nodeSpacing < 1) {
                fgRef.current.d3Force('charge').distanceMax(300 * nodeSpacing);
            } else {
                fgRef.current.d3Force('charge').distanceMax(Infinity);
            }
        }
    }, [nodeSpacing]);

    // Apply connection-specific forces
    useEffect(() => {
        if (fgRef.current && showConnections) {
            // Immediately fit to view when connections are loaded
            const padding = getZoomPadding(allNodes.size);
            fgRef.current.zoomToFit(0, padding);

            setTimeout(() => {
                if (fgRef.current) {
                    const config = getConnectionForceConfig(allNodes.size);
                    fgRef.current.d3Force('charge').strength(config.chargeStrength);
                    fgRef.current.d3Force('link')
                        .distance(config.linkDistance)
                        .strength(config.linkStrength);
                    fgRef.current.d3Force('center').strength(config.centerStrength);
                    fgRef.current.d3ReheatSimulation();
                }
            }, 100);
        }
    }, [showConnections, allNodes.size]);

    // Initial zoom and settle animation
    useEffect(() => {
        if (fgRef.current && !showConnections && !focusedNodeId && allNodes.size > 0) {
            const nodeCount = allNodes.size;
            const config = getInitialForceConfig(nodeCount);

            fgRef.current.d3Force('charge').strength(config.chargeStrength);
            fgRef.current.d3Force('link')
                .distance(config.linkDistance)
                .strength(config.linkStrength);
            fgRef.current.d3Force('center').strength(config.centerStrength);

            // Always fit to view when nodes change
            const padding = getZoomPadding(nodeCount);
            // Use immediate fit (0 duration) for initial load
            fgRef.current.zoomToFit(0, padding);

            const settleTime = getSettleTime(nodeCount);
            setTimeout(() => {
                if (fgRef.current && !showConnections) {
                    const settledConfig = getSettledForceConfig(config);
                    fgRef.current.d3Force('charge').strength(settledConfig.chargeStrength);
                    fgRef.current.d3Force('link')
                        .distance(settledConfig.linkDistance)
                        .strength(settledConfig.linkStrength);
                    fgRef.current.d3Force('center').strength(settledConfig.centerStrength);
                }
            }, settleTime);
        }
    }, [focusedNodeId, allNodes.size, showConnections]);

    // Focus on node when pending (only zoom if shouldZoomToFocus is true)
    useEffect(() => {
        if (!fgRef.current || !focusedNodeId || !graphData || !shouldZoomToFocus) return;

        // Find the focused node in the current graph data
        const focusedNode = graphData.nodes.find((n: any) => n.id === focusedNodeId);
        if (!focusedNode) return;

        // Start repositioning - hide the graph
        setIsRepositioning(true);

        // Wait for the graph to settle after filtering
        const timeoutId = setTimeout(() => {
            if (fgRef.current && focusedNode) {
                // Center the camera on the node with zoom
                fgRef.current.centerAt(focusedNode.x, focusedNode.y, 0); // Instant positioning (0ms)
                fgRef.current.zoom(3, 0); // Instant zoom

                // Show the graph after positioning is complete
                setTimeout(() => {
                    setIsRepositioning(false);
                    setShouldZoomToFocus(false);
                }, 50); // Small delay to ensure positioning is applied
            }
        }, 300); // Give time for the graph to filter

        return () => clearTimeout(timeoutId);
    }, [focusedNodeId, graphData, shouldZoomToFocus]);

    const cooldownConfig = getCooldownConfig(focusedNodeId, showConnections, allNodes.size);
    const graphLimits = getGraphLimits(allNodes.size);

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
                <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }} ref={containerRef}>
                    <ControlPanel
                        selectedNodeLabel={selectedNodeLabel}
                        setSelectedNodeLabel={setSelectedNodeLabel}
                        schema={schema}
                        loadingSchema={loadingSchema}
                        showAllNodes={showAllNodes}
                        setShowAllNodes={setShowAllNodes}
                        topK={topK}
                        topKInput={topKInput}
                        setTopKInput={setTopKInput}
                        applyLimit={applyLimit}
                        clearGraph={clearGraph}
                        loadConnections={loadConnections}
                        allNodesSize={allNodes.size}
                        loadingConnections={loadingConnections}
                        showConnections={showConnections}
                        error={error}
                        fgRef={fgRef}
                        nodeSpacing={nodeSpacing}
                        setNodeSpacing={setNodeSpacing}
                    />

                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        {/* Repositioning overlay */}
                        {isRepositioning && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                backgroundColor: '#1a1a1a',
                                zIndex: 10,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <div style={{ color: '#6b7280', fontSize: '14px' }}>
                                    Focusing on node...
                                </div>
                            </div>
                        )}

                        <ForceGraph2D
                            ref={fgRef}
                            graphData={graphData}
                            onEngineStop={() => {
                                if (!graphReady) {
                                    setGraphReady(true);
                                }
                            }}
                            nodeCanvasObject={(node, ctx, globalScale) =>
                                drawNode(node as GraphNode, ctx, globalScale, {
                                    hoveredNodeId,
                                    focusedNodeId,
                                    expandedNodes,
                                    fgRef
                                })
                            }
                            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) =>
                                nodePointerAreaPaint(node as GraphNode, color, ctx)
                            }
                            onNodeHover={(node: any) => setHoveredNodeId(node ? node.id : null)}
                            onNodeClick={(node: any, event: MouseEvent) => handleNodeClick(node as GraphNode, event)}
                            onNodeDrag={(node: any) => handleNodeDrag(node as GraphNode)}
                            onNodeDragEnd={(node: any) => handleNodeDragEnd(node as GraphNode)}
                            onBackgroundClick={handleBackgroundClick}
                            onZoom={handleZoom}
                            linkColor={() => "#6b7280"}
                            linkWidth={0.5}
                            linkDirectionalParticles={(link: any) => {
                                if (hoveredNodeId && (link.source.id === hoveredNodeId || link.target.id === hoveredNodeId)) return 2;
                                return 0;
                            }}
                            linkDirectionalParticleWidth={1.5}
                            linkDirectionalParticleSpeed={0.005}
                            linkDirectionalArrowLength={6}
                            linkDirectionalArrowRelPos={1}
                            cooldownTicks={cooldownConfig.cooldownTicks}
                            cooldownTime={cooldownConfig.cooldownTime}
                            backgroundColor="#1a1a1a"
                            d3AlphaDecay={cooldownConfig.d3AlphaDecay}
                            d3VelocityDecay={cooldownConfig.d3VelocityDecay}
                            d3AlphaMin={cooldownConfig.d3AlphaMin}
                            warmupTicks={cooldownConfig.warmupTicks}
                            enableNodeDrag={true}
                            minZoom={graphLimits.minZoom}
                            maxZoom={graphLimits.maxZoom}
                        />

                        <LoadingOverlay
                            loading={loading}
                            loadingConnections={loadingConnections}
                            loadingSchema={loadingSchema}
                        />
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default DataVisualization;