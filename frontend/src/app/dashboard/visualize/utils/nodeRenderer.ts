import { GraphNode, DataItem } from '../types';
import { formatFieldType, getRenderMode, isNodeInViewport } from './nodeUtils';

interface NodeRendererOptions {
    hoveredNodeId: string | null;
    focusedNodeId: string | null;
    expandedNodes: Set<string>;
    fgRef: any;
}

export const drawNode = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
    options: NodeRendererOptions
) => {
    const { hoveredNodeId, focusedNodeId, expandedNodes, fgRef } = options;
    const isHovered = node.id === hoveredNodeId;
    const allNodes = fgRef.current?.graphData?.()?.nodes || [];
    const currentNodeCount = allNodes.length;

    const isInViewport = fgRef.current 
        ? isNodeInViewport(node, ctx, (x: number, y: number) => fgRef.current.graph2ScreenCoords(x, y))
        : true;

    const { mode: renderMode, detailOpacity } = getRenderMode(globalScale, currentNodeCount, isInViewport);

    let cardWidth, cardHeight;
    // ONLY calculate card dimensions if node is in viewport AND we need to show details
    if (detailOpacity > 0 && isInViewport) {
        const dimensions = calculateCardDimensions(node, ctx, expandedNodes, focusedNodeId);
        cardWidth = dimensions.width;
        cardHeight = dimensions.height;
    }

    setNodeHitArea(node, renderMode, detailOpacity, cardWidth, cardHeight, isHovered);

    const originalAlpha = ctx.globalAlpha;

    // Always draw simple node view first (circles)
    if (renderMode === 'simple' || (renderMode === 'transition' && detailOpacity < 1)) {
        drawSimpleNode(node, ctx, isHovered, renderMode, detailOpacity);
    }

    // Only draw detailed view when zoomed in enough AND node is in viewport
    if (detailOpacity > 0 && isInViewport && cardWidth && cardHeight) {
        drawDetailedNode(node, ctx, expandedNodes, focusedNodeId, isHovered, detailOpacity, cardWidth, cardHeight);
    }

    ctx.globalAlpha = originalAlpha;
};

const calculateCardDimensions = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    expandedNodes: Set<string>,
    focusedNodeId: string | null
) => {
    const data = node.originalData as DataItem;
    const label = data.label || 'Entity';
    
    // Build fields array with title renamed to ID
    const fieldsArray: [string, any][] = [];
    
    // Add title as ID first if it exists
    if (data.title) {
        fieldsArray.push(['ID', data.title]);
    }
    
    // Add all other fields except label, id, and title
    Object.entries(data).forEach(([key, value]) => {
        if (key !== 'label' && key !== 'id' && key !== 'title') {
            fieldsArray.push([key, value]);
        }
    });
    
    const isExpanded = expandedNodes.has(node.id);
    const fields = isExpanded ? fieldsArray : fieldsArray.slice(0, 5);

    const padding = 12;
    const fontSize = 11;
    const headerFontSize = 14;

    ctx.font = `${headerFontSize}px monospace bold`;
    let maxWidth = ctx.measureText(label).width;

    ctx.font = `${fontSize}px monospace`;
    fields.forEach(([key, value]) => {
        const isId = key === 'ID';
        // Don't truncate ID for width calculation
        const displayValue = isId 
            ? value 
            : (typeof value === 'string' && value.length > 20 
                ? value.substring(0, 20) + '...' 
                : value);
        const text = `${key}: ${displayValue}`;
        maxWidth = Math.max(maxWidth, ctx.measureText(text).width + ctx.measureText(' I32').width);
    });

    const cardWidth = maxWidth + padding * 3;
    const fieldHeight = fontSize * 1.2;
    let cardHeight = headerFontSize + padding * 2 + fields.length * fieldHeight;
    if (fieldsArray.length > 5) cardHeight += fieldHeight;

    return { width: cardWidth, height: cardHeight };
};

const setNodeHitArea = (
    node: GraphNode,
    renderMode: 'simple' | 'detailed' | 'transition',
    detailOpacity: number,
    cardWidth: number | undefined,
    cardHeight: number | undefined,
    isHovered: boolean
) => {
    if ((renderMode === 'detailed' || (renderMode === 'transition' && detailOpacity > 0.5)) && cardWidth && cardHeight) {
        node.__hitType = 'rect';
        node.__hitDimensions = [cardWidth, cardHeight];
        node.__cardDimensions = [cardWidth, cardHeight];
    } else {
        const size = isHovered ? 16 : 12;
        node.__hitType = 'circle';
        node.__hitSize = size * 1.5;
    }
};

const drawSimpleNode = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    isHovered: boolean,
    renderMode: 'simple' | 'transition',
    detailOpacity: number
) => {
    const simpleOpacity = renderMode === 'simple' ? 1 : Math.max(0.3, 1 - detailOpacity);
    ctx.globalAlpha = simpleOpacity;
    const size = isHovered ? 16 : 12;
    
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.color || '#64748b';
    ctx.fill();

    if (isHovered) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = node.color || '#64748b';
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();

    if (isHovered && renderMode === 'simple') {
        const label = node.originalData.label || 'Entity';
        ctx.font = '12px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, node.x + size + 6, node.y + 4);
    }
};

const drawDetailedNode = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    expandedNodes: Set<string>,
    focusedNodeId: string | null,
    isHovered: boolean,
    detailOpacity: number,
    cardWidth: number,
    cardHeight: number
) => {
    const data = node.originalData as DataItem;
    const label = data.label || 'Entity';
    
    // Build fields array with title renamed to ID
    const fieldsArray: [string, any][] = [];
    
    // Add title as ID first if it exists
    if (data.title) {
        fieldsArray.push(['ID', data.title]);
    }
    
    // Add all other fields except label, id, and title
    Object.entries(data).forEach(([key, value]) => {
        if (key !== 'label' && key !== 'id' && key !== 'title') {
            fieldsArray.push([key, value]);
        }
    });
    
    const isExpanded = expandedNodes.has(node.id);
    const fields = isExpanded ? fieldsArray : fieldsArray.slice(0, 5);
    const isFocused = focusedNodeId === node.id;

    const padding = 12;
    const fontSize = 11;
    const headerFontSize = 14;
    const typeFontSize = 9;

    ctx.globalAlpha = detailOpacity;

    const gradient = ctx.createLinearGradient(
        node.x - cardWidth / 2,
        node.y - cardHeight / 2,
        node.x - cardWidth / 2,
        node.y + cardHeight / 2
    );
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, cardHeight);

    ctx.strokeStyle = isHovered ? node.color : 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.strokeRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, cardHeight);

    ctx.fillStyle = node.color || '#64748b';
    ctx.fillRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, 3);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `${headerFontSize}px monospace bold`;
    ctx.fillText(label, node.x, node.y - cardHeight / 2 + headerFontSize + padding / 2);

    let yPos = node.y - cardHeight / 2 + headerFontSize + padding * 1.5;
    ctx.textAlign = 'left';
    ctx.font = `${fontSize}px monospace`;
    
    fields.forEach(([key, value]) => {
        const fieldType = formatFieldType(key, value);
        const isId = key === 'ID';  // Check for our renamed ID field
        // Don't truncate ID, show full value. For other fields, truncate if too long
        const displayValue = isId 
            ? String(value)
            : (typeof value === 'string' && value.length > 20 
                ? value.substring(0, 20) + '...' 
                : String(value));

        ctx.fillStyle = '#64748b';
        ctx.fillText(`${key}:`, node.x - cardWidth / 2 + padding, yPos + fontSize / 1.5);

        ctx.fillStyle = isId ? '#22d3ee' : '#cbd5e1';
        ctx.fillText(displayValue, node.x - cardWidth / 2 + padding + ctx.measureText(`${key}: `).width, yPos + fontSize / 1.5);

        ctx.fillStyle = '#475569';
        ctx.font = `${typeFontSize}px monospace`;
        ctx.fillText(fieldType, node.x + cardWidth / 2 - padding - ctx.measureText(fieldType).width, yPos + fontSize / 1.5);
        ctx.font = `${fontSize}px monospace`;

        yPos += fontSize * 1.2;
    });

    if (fieldsArray.length > 5) {
        drawExpandToggle(node, ctx, isExpanded, yPos, fontSize, fieldsArray.length - 5);
        yPos += fontSize * 1.2;
    }

    drawExpandButton(node, ctx, cardWidth, cardHeight);
};

const drawExpandToggle = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    isExpanded: boolean,
    yPos: number,
    fontSize: number,
    moreCount: number
) => {
    const toggleText = isExpanded ? '- Show Less' : `+ ${moreCount} More`;
    const toggleY = yPos + fontSize / 1.5;

    const toggleWidth = ctx.measureText(toggleText).width;
    const toggleX = -toggleWidth / 2;
    
    node.__moreBounds = {
        x: toggleX,
        y: yPos - node.y,
        width: toggleWidth,
        height: fontSize * 1.2
    };

    ctx.fillStyle = isExpanded ? '#f87171' : '#34d399';
    ctx.textAlign = 'center';
    ctx.font = `10px monospace`;
    ctx.fillText(toggleText, node.x, toggleY);

    ctx.strokeStyle = isExpanded ? '#f87171' : '#34d399';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(node.x - toggleWidth / 2, toggleY + 2);
    ctx.lineTo(node.x + toggleWidth / 2, toggleY + 2);
    ctx.stroke();
    ctx.setLineDash([]);
};

const drawExpandButton = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    cardWidth: number,
    cardHeight: number
) => {
    const buttonSize = 18;
    const buttonX = node.x + cardWidth / 2 - buttonSize - 8;
    const buttonY = node.y - cardHeight / 2 + 8;

    node.__expandBounds = {
        x: buttonX - node.x,
        y: buttonY - node.y,
        width: buttonSize,
        height: buttonSize
    };

    ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
    ctx.beginPath();
    ctx.roundRect(buttonX, buttonY, buttonSize, buttonSize, 4);
    ctx.fill();

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(buttonX + 6, buttonY + buttonSize / 2);
    ctx.lineTo(buttonX + buttonSize - 6, buttonY + buttonSize / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(buttonX + buttonSize / 2, buttonY + 6);
    ctx.lineTo(buttonX + buttonSize / 2, buttonY + buttonSize - 6);
    ctx.stroke();
};