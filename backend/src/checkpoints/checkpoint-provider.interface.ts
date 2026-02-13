export interface Checkpoint {
  timestamp_created: string;
  commit: string;
  gitId: string;
}

export interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
}

export interface GitTag {
  name: string;
  date: string;
  message: string;
}

export interface GitConnectionStatus {
  connected: boolean;
  url: string;
  username: string;
  error?: string;
}

export interface ICheckpointProvider {
  backup(project: string, message: string): Promise<string>;
  restore(project: string, commitHash: string): Promise<void>;
  list(project: string): Promise<Checkpoint[]>;
  delete(project: string, commitHash: string): Promise<void>;
  getChanges(project: string): Promise<FileChange[]>;
  discardFile(project: string, filePath: string): Promise<void>;
  getCommitFiles(project: string, commitHash: string): Promise<FileChange[]>;
  createTag(project: string, tagName: string, message: string): Promise<void>;
  listTags(project: string): Promise<GitTag[]>;
  checkConnection(): Promise<GitConnectionStatus>;
}
