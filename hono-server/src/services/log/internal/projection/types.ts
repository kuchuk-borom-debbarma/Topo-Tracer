import { ReadNode, ReadEdge, ProjectedGraphNode, ProjectedGraphEdge } from "../../api/types";

export type NodeProjectionMap = Map<string, string>; // original id -> projected id

export interface HiddenRun {
  nodes: ReadNode[];
  flowOrderStart: number;
  flowOrderEnd: number;
}
