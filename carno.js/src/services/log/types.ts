export type Container = {
  id: string;
  name: string;
  containerType: string; //The type of the container (e.g. "pod", "deployment", "service")

  createdAtLocal: Date; // The time on the local machine where it was created UTC milisecond
  createdAtRemote: Date; // The time on the remote machine where it was stored in database UTC milisecond
};

export type Node = {
  id: string;
  containerId: string;
  parentNodeId: string;
  name: string;
  nodeType: string;
  depthIndex: number;
  metadata: any;
  initiatedAtLocal: Date;
  processedAtLocal: Date;
  completedAtLocal?: Date;
};

export type Edge = {
  id: string;
  fromContainerId: string;
  toContainerId: string;

  fromNodeId: string;
  toNodeId: string;

  edgeType: string;

  dispatchedAtLocal: Date; //when it made the connection, eg:- when it called the other container
  respondedAtLocal?: Date; //when it received the response from the other container
};
