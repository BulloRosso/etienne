import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type FilesystemEvent =
  | { type: 'fs.added'; project: string; path: string; isDir?: boolean; source: 'onedrive' }
  | { type: 'fs.removed'; project: string; path: string; source: 'onedrive' }
  | { type: 'fs.renamed'; project: string; from: string; to: string; source: 'onedrive' }
  | { type: 'fs.changed'; project: string; path: string; source: 'onedrive' };

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
