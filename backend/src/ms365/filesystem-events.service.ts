import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type FilesystemEventSource = 'onedrive' | 'teams';

export type FilesystemEvent =
  | { type: 'fs.added'; project: string; path: string; isDir?: boolean; source: FilesystemEventSource }
  | { type: 'fs.removed'; project: string; path: string; source: FilesystemEventSource }
  | { type: 'fs.renamed'; project: string; from: string; to: string; source: FilesystemEventSource }
  | { type: 'fs.changed'; project: string; path: string; source: FilesystemEventSource };

@Injectable()
export class FilesystemEventsService {
  private readonly subjects = new Map<string, Subject<FilesystemEvent>>();

  getSubject(project: string): Subject<FilesystemEvent> {
    let s = this.subjects.get(project);
    if (!s) {
      s = new Subject<FilesystemEvent>();
      this.subjects.set(project, s);
    }
    return s;
  }

  emit(event: FilesystemEvent): void {
    this.getSubject(event.project).next(event);
  }
}
