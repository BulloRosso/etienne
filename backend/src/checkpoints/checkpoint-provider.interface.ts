export interface Checkpoint {
  timestamp_created: string;
  commit: string;
  gitId: string;
}

export interface ICheckpointProvider {
  backup(project: string, message: string): Promise<string>;
  restore(project: string, commitHash: string): Promise<void>;
  list(project: string): Promise<Checkpoint[]>;
  delete(project: string, commitHash: string): Promise<void>;
}
