import dagre from 'dagre';
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { TraceNode, TraceContainer, TraceEdge } from '../api/telemetry';

export const getLayoutedElements = (
  traceNodes: TraceNode[],
  traceEdges: TraceEdge[],
  traceContainers: TraceContainer[],
  direction = 'TB' // Top-Bottom layout
) => {
  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure DAG layout
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    edgesep: 50,
    ranksep: 100,
  });

  const rfNodes: RFNode[] = [];
  const rfEdges: RFEdge[] = [];

  // Add containers as compound nodes to DAG
  traceContainers.forEach((container) => {
    // We don't set exact width/height for containers as dagre computes bounding box for compounds automatically
    dagreGraph.setNode(container.id, { label: container.name });
    
    rfNodes.push({
      id: container.id,
      type: 'containerNode',
      data: { label: container.name, containerType: container.containerType },
      position: { x: 0, y: 0 }, // Will be updated by dagre
      style: { width: 0, height: 0, zIndex: -1 }, // Width/height populated later
    });
  });

  // Add execution nodes
  traceNodes.forEach((node) => {
    const nodeWidth = 220;
    const nodeHeight = 80;

    const durationMs = node.completedAtLocal 
      ? new Date(node.completedAtLocal).getTime() - new Date(node.initiatedAtLocal).getTime()
      : new Date(node.processedAtLocal).getTime() - new Date(node.initiatedAtLocal).getTime();

    // Set node size for layout
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    
    // Assign to parent container
    if (node.containerId) {
      dagreGraph.setParent(node.id, node.containerId);
    }

    rfNodes.push({
      id: node.id,
      type: 'executionNode',
      parentId: node.containerId,
      extent: 'parent',
      data: { 
        label: node.name, 
        nodeType: node.nodeType,
        durationMs: durationMs > 0 ? durationMs : 1 
      },
      position: { x: 0, y: 0 }, // Will be updated
    });
  });

  // Add edges to DAG
  traceEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.fromNodeId, edge.toNodeId);
    
    rfEdges.push({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--accent-cyan)', strokeWidth: 2 },
    });
  });

  // Execute Layout
  dagre.layout(dagreGraph);

  // Apply computed positions back to React Flow nodes
  const layoutedNodes = rfNodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    if (node.type === 'containerNode') {
      // For compound nodes, dagre gives us the bounding box size and center coordinate
      // We must offset the center coordinate to top-left for React Flow
      // And we add some padding so children aren't touching borders
      const padding = 40;
      node.style = {
        ...node.style,
        width: nodeWithPosition.width + padding * 2,
        height: nodeWithPosition.height + padding * 2,
      };
      
      node.position = {
        x: nodeWithPosition.x - nodeWithPosition.width / 2 - padding,
        y: nodeWithPosition.y - nodeWithPosition.height / 2 - padding,
      };
    } else {
      // For child nodes inside containers, React Flow uses absolute positioning relative to parent!
      // But dagre returns absolute positions relative to the entire canvas!
      // We must subtract the parent's absolute position from the child's absolute position.
      const parentNode = dagreGraph.node(node.parentId as string);
      const padding = 40;
      
      const parentTopLeftX = parentNode.x - parentNode.width / 2 - padding;
      const parentTopLeftY = parentNode.y - parentNode.height / 2 - padding;

      node.position = {
        x: (nodeWithPosition.x - nodeWithPosition.width / 2) - parentTopLeftX,
        y: (nodeWithPosition.y - nodeWithPosition.height / 2) - parentTopLeftY,
      };
    }

    return node;
  });

  return { nodes: layoutedNodes, edges: rfEdges };
};
