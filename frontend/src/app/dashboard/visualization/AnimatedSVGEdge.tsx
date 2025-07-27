import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

interface CustomEdgeProps extends EdgeProps {
  data?: {
    isHighlighted?: boolean;
  };
}

export function AnimatedSVGEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: CustomEdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isHighlighted = data?.isHighlighted || false;
  const edgeColor = isHighlighted ? '#00ff88' : '#4a5568';
  const glowOpacity = isHighlighted ? 0.8 : 0;
  const animationOpacity = isHighlighted ? 1 : 0;

  return (
    <g>
      <defs>
        <filter id={`glow-${id}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id={`bright-glow-${id}`}>
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Outer glow effect - only visible when highlighted */}
      {isHighlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={4}
          strokeOpacity={0.3}
          filter={`url(#bright-glow-${id})`}
        />
      )}
      
      {/* Inner glow effect - only visible when highlighted */}
      {isHighlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={2}
          strokeOpacity={0.6}
          filter={`url(#glow-${id})`}
        />
      )}
      
      {/* Main edge path - very thin */}
      <path
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={isHighlighted ? 1 : 0.5}
        className="react-flow__edge-path"
        opacity={isHighlighted ? 1 : 0.4}
      />
      
      {/* Animated dot - small and bright */}
      <circle 
        r="2" 
        fill={edgeColor} 
        opacity={animationOpacity}
        filter={isHighlighted ? `url(#glow-${id})` : undefined}
      >
        <animateMotion 
          dur="1.5s" 
          repeatCount="indefinite" 
          path={edgePath}
        >
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </animateMotion>
      </circle>
      
      {/* Arrow marker */}
      <defs>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="#10b981"
            opacity="0.8"
          />
        </marker>
      </defs>
    </g>
  );
}