import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { GraphNode, GraphEdge } from '../lib/api';

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Enhanced color palette with better contrast
const getEnhancedColor = (type: string, isHighlighted: boolean, isConnected: boolean) => {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    Person: { bg: '#EF4444', text: '#FFFFFF', border: '#DC2626' },
    Location: { bg: '#3B82F6', text: '#FFFFFF', border: '#2563EB' },
    Object: { bg: '#10B981', text: '#FFFFFF', border: '#059669' },
    Event: { bg: '#F59E0B', text: '#000000', border: '#D97706' },
    Organization: { bg: '#8B5CF6', text: '#FFFFFF', border: '#7C3AED' },
    Unknown: { bg: '#6B7280', text: '#FFFFFF', border: '#4B5563' },
  };

  const color = colors[type] || colors.Unknown;

  if (isHighlighted) {
    return { ...color, border: '#FFF', shadow: '0 0 20px rgba(255,255,255,0.8)' };
  }
  if (isConnected) {
    return { ...color, border: '#FFF', shadow: '0 0 10px rgba(255,255,255,0.5)' };
  }
  return { ...color, shadow: '0 2px 8px rgba(0,0,0,0.3)' };
};

export const GraphView: React.FC<GraphViewProps> = ({ nodes: graphNodes, edges: graphEdges }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Calculate better layout using a grid-based approach
  const calculateLayout = (nodeCount: number) => {
    const layouts: Record<number, { cols: number; spacing: number }> = {
      1: { cols: 1, spacing: 200 },
      2: { cols: 2, spacing: 250 },
      3: { cols: 3, spacing: 200 },
      4: { cols: 2, spacing: 250 },
      5: { cols: 3, spacing: 200 },
      6: { cols: 3, spacing: 200 },
    };

    if (nodeCount <= 6) {
      return layouts[nodeCount] || layouts[6];
    }

    // For larger graphs, use a dynamic grid
    const cols = Math.ceil(Math.sqrt(nodeCount));
    return { cols, spacing: Math.max(180, 300 - nodeCount * 5) };
  };

  // Create nodes only when graph data changes
  useEffect(() => {
    if (!graphNodes || graphNodes.length === 0) return;

    const { cols, spacing } = calculateLayout(graphNodes.length);

    // Create nodes with grid layout OR use saved positions
    const flowNodes: Node[] = graphNodes.map((node, index) => {
      // Check if we have a saved position for this node
      const savedPosition = nodePositionsRef.current.get(node.id);
      
      let position;
      if (savedPosition) {
        // Use saved position if available
        position = savedPosition;
      } else {
        // Calculate initial grid position
        const row = Math.floor(index / cols);
        const col = index % cols;
        const offsetX = row % 2 === 1 ? spacing / 2 : 0;
        position = {
          x: col * spacing + offsetX + 100,
          y: row * spacing + 100,
        };
      }

      const colors = getEnhancedColor(node.type, false, false);

      return {
        id: node.id,
        type: 'default',
        position,
        data: {
          label: (
            <div className="text-center px-2">
              <div className="font-bold text-sm mb-1" style={{ color: colors.text }}>
                {node.label}
              </div>
              <div 
                className="text-xs font-medium opacity-90" 
                style={{ color: colors.text }}
              >
                {node.type}
              </div>
            </div>
          ),
        },
        style: {
          background: colors.bg,
          color: colors.text,
          border: `3px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '13px',
          minWidth: '140px',
          boxShadow: colors.shadow,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          opacity: 1,
        },
        draggable: true,
      };
    });

    setNodes(flowNodes);
  }, [graphNodes, setNodes]);

  // Update node and edge styles when selection changes
  useEffect(() => {
    const connectedNodeIds = new Set<string>();

    // Find connected nodes if a node is selected
    if (selectedNodeId) {
      graphEdges.forEach((edge) => {
        if (edge.source === selectedNodeId) connectedNodeIds.add(edge.target);
        if (edge.target === selectedNodeId) connectedNodeIds.add(edge.source);
      });
    }

    // Update node styles without changing positions
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const isHighlighted = node.id === selectedNodeId;
        const isConnected = connectedNodeIds.has(node.id);
        const graphNode = graphNodes.find(gn => gn.id === node.id);
        if (!graphNode) return node;
        
        const colors = getEnhancedColor(graphNode.type, isHighlighted, isConnected);

        return {
          ...node,
          data: {
            label: (
              <div className="text-center px-2">
                <div className="font-bold text-sm mb-1" style={{ color: colors.text }}>
                  {graphNode.label}
                </div>
                <div 
                  className="text-xs font-medium opacity-90" 
                  style={{ color: colors.text }}
                >
                  {graphNode.type}
                </div>
              </div>
            ),
          },
          style: {
            ...node.style,
            background: colors.bg,
            color: colors.text,
            border: `3px solid ${colors.border}`,
            boxShadow: colors.shadow,
            opacity: selectedNodeId && !isHighlighted && !isConnected ? 0.3 : 1,
          },
        };
      })
    );

    // Update edges
    const flowEdges: Edge[] = graphEdges.map((edge, index) => {
      const isHighlighted =
        selectedNodeId &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId);

      return {
        id: `edge-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'smoothstep',
        animated: isHighlighted ? true : false,
        style: {
          // Use foreground color for highlight (black in light mode, white in dark mode)
          stroke: isHighlighted ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
          strokeWidth: isHighlighted ? 3 : 2,
          opacity: selectedNodeId && !isHighlighted ? 0.2 : 1,
        },
        labelStyle: {
          fill: isHighlighted ? 'hsl(var(--foreground))' : 'hsl(var(--foreground))',
          fontSize: isHighlighted ? 12 : 10,
          fontWeight: isHighlighted ? 'bold' : 'normal',
        },
        labelBgStyle: {
          fill: 'hsl(var(--background))',
          fillOpacity: 0.9,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
        },
      };
    });

    setEdges(flowEdges);
  }, [selectedNodeId, graphEdges, graphNodes, setNodes, setEdges]);

  // Handler to save node positions when they're dragged
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      
      // Save positions when nodes are dragged
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.position && change.dragging === false) {
          nodePositionsRef.current.set(change.id, change.position);
        }
      });
    },
    [onNodesChange]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  if (!graphNodes || graphNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <h3 className="text-xl font-bold mb-2">No Evidence Yet</h3>
          <p className="text-sm">
            Start the investigation in the Investigation Room to build the evidence graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
      >
        <Controls className="bg-card border border-border" />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--muted))" />
      </ReactFlow>
      
      {selectedNodeId && (
        <div className="absolute top-4 right-4 bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-xs text-muted-foreground">
            Click the same node again to deselect and hide connections.
          </p>
        </div>
      )}
    </div>
  );
};
