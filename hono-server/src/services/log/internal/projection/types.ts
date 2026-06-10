import { ReadNode, ReadEdge, ProjectedFlowNode, ProjectedFlowEdge } from "../../api/types";

/**
 * Mapping table from original node ID to its projected node ID (either normal or ghost).
 */
export type NodeProjectionMap = Map<string, string>;

/**
 * Internal container representing a contiguous sequence of hidden nodes.
 * Used during the scanning pass of the LogFlowProjector.
 */
export interface HiddenRun {
  nodes: ReadNode[];
  flowOrderStart: number;
  flowOrderEnd: number;
}

