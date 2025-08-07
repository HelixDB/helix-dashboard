import React from 'react';
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
import { SidebarTrigger } from '@/components/ui/sidebar';
import { GitBranch, RotateCcw, Check, ChevronDown } from 'lucide-react';
import { SchemaInfo } from '../types';

interface ControlPanelProps {
    selectedNodeLabel: string;
    setSelectedNodeLabel: (label: string) => void;
    schema: SchemaInfo;
    loadingSchema: boolean;
    showAllNodes: boolean;
    setShowAllNodes: (show: boolean) => void;
    topK: number;
    topKInput: string;
    setTopKInput: (value: string) => void;
    applyLimit: () => void;
    clearGraph: () => void;
    loadConnections: () => void;
    allNodesSize: number;
    loadingConnections: boolean;
    showConnections: boolean;
    error: string | null;
    fgRef: any;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    selectedNodeLabel,
    setSelectedNodeLabel,
    schema,
    loadingSchema,
    showAllNodes,
    setShowAllNodes,
    topK,
    topKInput,
    setTopKInput,
    applyLimit,
    clearGraph,
    loadConnections,
    allNodesSize,
    loadingConnections,
    showConnections,
    error,
    fgRef
}) => {
    return (
        <div style={{ 
            position: 'absolute', 
            top: 10, 
            left: 10, 
            zIndex: 10, 
            display: 'flex', 
            gap: 10, 
            flexWrap: 'wrap' 
        }}>
            <SidebarTrigger className="glass-hover rounded-lg p-2" />
            
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                        {selectedNodeLabel || 'All Types'}
                        <ChevronDown size={16} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent style={{ width: 200, maxHeight: 300, overflowY: 'auto' }}>
                    <DropdownMenuLabel>Node Types</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                        checked={selectedNodeLabel === ''}
                        onCheckedChange={() => setSelectedNodeLabel('')}
                    >
                        All Types
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {schema.nodes.map(node => (
                        <DropdownMenuCheckboxItem
                            key={node.name}
                            checked={selectedNodeLabel === node.name}
                            onCheckedChange={() => setSelectedNodeLabel(node.name)}
                        >
                            {node.name}
                        </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={clearGraph}>
                <RotateCcw size={16} /> Clear
            </Button>

            {!selectedNodeLabel && (
                <Button
                    onClick={loadConnections}
                    disabled={allNodesSize === 0 || loadingConnections}
                    variant={showConnections ? "default" : "outline"}
                >
                    {loadingConnections ? 'Loading...' : (
                        <>
                            <GitBranch size={16} /> 
                            {showConnections ? 'Connections Loaded' : 'Load Connections'}
                        </>
                    )}
                </Button>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                    variant={showAllNodes ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowAllNodes(!showAllNodes)}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                    {showAllNodes ? 'All Nodes' : `Top ${topK}`}
                </Button>
            </div>

            {!showAllNodes && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ color: '#e0e0e0', fontSize: '14px' }}>Limit:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Input
                            type="text"
                            value={topKInput}
                            onChange={(e) => setTopKInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    applyLimit();
                                }
                            }}
                            style={{ width: '80px' }}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={applyLimit}
                            style={{ padding: '4px 8px', minWidth: 'auto' }}
                        >
                            <Check size={14} />
                        </Button>
                    </div>
                </div>
            )}

            {error && (
                <div style={{ 
                    color: 'red', 
                    background: 'white', 
                    padding: '4px 8px', 
                    borderRadius: '4px' 
                }}>
                    Error: {error}
                </div>
            )}

            {loadingSchema && (
                <div style={{ 
                    color: '#e0e0e0', 
                    background: '#1e293b', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    border: '1px solid #475569' 
                }}>
                    Loading schema...
                </div>
            )}
        </div>
    );
};