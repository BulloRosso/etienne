import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Ms365TokenService } from './ms365-token.service';

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { driveId: string; path?: string };
  lastModifiedDateTime?: string;
  '@microsoft.graph.downloadUrl'?: string;
  deleted?: { state: string };
  root?: Record<string, unknown>;
}

export interface TeamRef {
  id: string;
  displayName: string;
  description?: string;
}

export interface ChannelRef {
  id: string;
  displayName: string;
  description?: string;
  membershipType?: string;
}

export interface ChatMessage {
  id: string;
  replyToId?: string | null;
  messageType?: string; // 'message' | 'systemEventMessage' | ...
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  lastEditedDateTime?: string | null;
  deletedDateTime?: string | null;
  subject?: string | null;
  webUrl?: string;
  from?: {
    user?: { id?: string; displayName?: string } | null;
    application?: { id?: string; displayName?: string } | null;
  } | null;
  body?: { contentType?: string; content?: string };
  attachments?: Array<{ id?: string; contentType?: string; name?: string; contentUrl?: string; content?: string }>;
  mentions?: Array<{ id?: number; mentionText?: string; mentioned?: any }>;
  reactions?: Array<{ reactionType?: string; user?: { user?: { id?: string; displayName?: string } } }>;
  replies?: ChatMessage[];
  'replies@odata.nextLink'?: string;
}

@Injectable()
export class GraphClientService {
  private readonly logger = new Logger(GraphClientService.name);
  private readonly http: AxiosInstance = axios.create({ baseURL: 'https://graph.microsoft.com/v1.0' });

  constructor(private readonly tokens: Ms365TokenService) {}

  private async authHeaders(project: string): Promise<Record<string, string>> {
    const token = await this.tokens.getValidAccessToken(project);
    if (!token) throw new Error(`MS365 not connected for project ${project}`);
    return { Authorization: `Bearer ${token}` };
  }

  private async withRetry<T>(project: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 && i === 0) {
          // Token might have just expired; force refresh path
          await this.tokens.getValidAccessToken(project);
          lastErr = err;
          continue;
        }
        if (status === 429 || (status >= 500 && status < 600)) {
          const retryAfter = Number(err?.response?.headers?.['retry-after']) || Math.min(60, 2 ** i);
          this.logger.warn(`Graph ${status}, retrying after ${retryAfter}s (attempt ${i + 1}/${attempts})`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async get<T = any>(project: string, path: string, config: AxiosRequestConfig = {}): Promise<T> {
    return this.withRetry(project, async () => {
      const headers = await this.authHeaders(project);
      const resp = await this.http.get<T>(path, { ...config, headers: { ...headers, ...(config.headers || {}) } });
      return resp.data;
    });
  }

  async post<T = any>(project: string, path: string, body: any, config: AxiosRequestConfig = {}): Promise<T> {
    return this.withRetry(project, async () => {
      const headers = await this.authHeaders(project);
      const resp = await this.http.post<T>(path, body, { ...config, headers: { ...headers, ...(config.headers || {}) } });
      return resp.data;
    });
  }

  async put<T = any>(project: string, path: string, body: any, config: AxiosRequestConfig = {}): Promise<T> {
    return this.withRetry(project, async () => {
      const headers = await this.authHeaders(project);
      const resp = await this.http.put<T>(path, body, { ...config, headers: { ...headers, ...(config.headers || {}) } });
      return resp.data;
    });
  }

  async patch<T = any>(project: string, path: string, body: any, config: AxiosRequestConfig = {}): Promise<T> {
    return this.withRetry(project, async () => {
      const headers = await this.authHeaders(project);
      const resp = await this.http.patch<T>(path, body, { ...config, headers: { ...headers, ...(config.headers || {}) } });
      return resp.data;
    });
  }

  async delete(project: string, path: string): Promise<void> {
    await this.withRetry(project, async () => {
      const headers = await this.authHeaders(project);
      await this.http.delete(path, { headers });
    });
  }

  // ============================================
  // High-level Drive operations
  // ============================================

  async listDrives(project: string): Promise<DriveItem[]> {
    const data = await this.get<{ value: DriveItem[] }>(project, '/me/drives');
    return data.value;
  }

  async getRootChildren(project: string, driveId?: string): Promise<DriveItem[]> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const data = await this.get<{ value: DriveItem[] }>(project, `${base}/root/children?$top=200`);
    return data.value;
  }

  async getChildrenByPath(project: string, path: string, driveId?: string): Promise<DriveItem[]> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const url = encoded ? `${base}/root:/${encoded}:/children?$top=200` : `${base}/root/children?$top=200`;
    const data = await this.get<{ value: DriveItem[] }>(project, url);
    return data.value;
  }

  async getItemByPath(project: string, path: string, driveId?: string): Promise<DriveItem> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return this.get<DriveItem>(project, `${base}/root:/${encoded}`);
  }

  async getItemById(project: string, itemId: string, driveId?: string): Promise<DriveItem> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    return this.get<DriveItem>(project, `${base}/items/${itemId}`);
  }

  async downloadItemContent(project: string, itemId: string, driveId?: string): Promise<Buffer> {
    const item = await this.getItemById(project, itemId, driveId);
    const url = item['@microsoft.graph.downloadUrl'];
    if (!url) throw new Error(`No download URL for item ${itemId}`);
    const resp = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
    return Buffer.from(resp.data);
  }

  async uploadSmallFile(project: string, parentPath: string, fileName: string, content: Buffer, driveId?: string): Promise<DriveItem> {
    if (content.length > 4 * 1024 * 1024) {
      throw new Error('File exceeds 4MB inline upload cap, use createUploadSession');
    }
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const encoded = fullPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return this.put<DriveItem>(project, `${base}/root:/${encoded}:/content`, content, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  async uploadLargeFile(project: string, parentPath: string, fileName: string, content: Buffer, driveId?: string): Promise<DriveItem> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const encoded = fullPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const session = await this.post<{ uploadUrl: string }>(
      project,
      `${base}/root:/${encoded}:/createUploadSession`,
      { item: { '@microsoft.graph.conflictBehavior': 'replace', name: fileName } },
    );

    const chunkSize = 320 * 1024 * 100; // 3.2 MB chunks (multiple of 320 KiB per Graph requirement)
    let offset = 0;
    let lastResp: any;
    while (offset < content.length) {
      const end = Math.min(offset + chunkSize, content.length);
      const chunk = content.subarray(offset, end);
      const range = `bytes ${offset}-${end - 1}/${content.length}`;
      const resp = await axios.put(session.uploadUrl, chunk, {
        headers: { 'Content-Length': String(chunk.length), 'Content-Range': range },
        maxBodyLength: Infinity,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      lastResp = resp;
      offset = end;
    }
    return lastResp.data as DriveItem;
  }

  async createFolder(project: string, parentPath: string, folderName: string, driveId?: string): Promise<DriveItem> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const url = parentPath
      ? `${base}/root:/${parentPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')}:/children`
      : `${base}/root/children`;
    return this.post<DriveItem>(project, url, {
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace',
    });
  }

  async deleteItem(project: string, itemId: string, driveId?: string): Promise<void> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    await this.delete(project, `${base}/items/${itemId}`);
  }

  async moveOrRenameItem(project: string, itemId: string, newName?: string, newParentId?: string, driveId?: string): Promise<DriveItem> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const body: any = {};
    if (newName) body.name = newName;
    if (newParentId) body.parentReference = { id: newParentId };
    return this.patch<DriveItem>(project, `${base}/items/${itemId}`, body);
  }

  async searchFiles(project: string, query: string, driveId?: string): Promise<DriveItem[]> {
    const base = driveId ? `/drives/${driveId}` : '/me/drive';
    const data = await this.get<{ value: DriveItem[] }>(project, `${base}/root/search(q='${encodeURIComponent(query)}')?$top=50`);
    return data.value;
  }

  async getDelta(project: string, deltaLink?: string, driveId?: string): Promise<{ items: DriveItem[]; nextLink?: string; deltaLink?: string }> {
    let url: string;
    if (deltaLink) {
      url = deltaLink.replace('https://graph.microsoft.com/v1.0', '');
    } else {
      const base = driveId ? `/drives/${driveId}` : '/me/drive';
      url = `${base}/root/delta`;
    }
    const data = await this.get<{ value: DriveItem[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(project, url);
    return {
      items: data.value,
      nextLink: data['@odata.nextLink'],
      deltaLink: data['@odata.deltaLink'],
    };
  }

  // ============================================
  // Teams channel operations (Teams observer)
  // ============================================

  private stripGraphBase(link: string): string {
    return link.replace('https://graph.microsoft.com/v1.0', '');
  }

  async listJoinedTeams(project: string): Promise<TeamRef[]> {
    const data = await this.get<{ value: TeamRef[] }>(project, '/me/joinedTeams');
    return data.value;
  }

  async listChannels(project: string, teamId: string): Promise<ChannelRef[]> {
    const data = await this.get<{ value: ChannelRef[] }>(project, `/teams/${encodeURIComponent(teamId)}/channels`);
    return data.value;
  }

  /**
   * List channel root messages, newest first. No $filter support on this endpoint —
   * paging is via @odata.nextLink only (pass it back as nextLink).
   */
  async listChannelMessages(
    project: string,
    teamId: string,
    channelId: string,
    nextLink?: string,
  ): Promise<{ messages: ChatMessage[]; nextLink?: string }> {
    const url = nextLink
      ? this.stripGraphBase(nextLink)
      : `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=50&$expand=replies`;
    const data = await this.get<{ value: ChatMessage[]; '@odata.nextLink'?: string }>(project, url);
    return { messages: data.value, nextLink: data['@odata.nextLink'] };
  }

  async listMessageReplies(
    project: string,
    teamId: string,
    channelId: string,
    messageId: string,
    nextLink?: string,
  ): Promise<{ messages: ChatMessage[]; nextLink?: string }> {
    const url = nextLink
      ? this.stripGraphBase(nextLink)
      : `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies?$top=50`;
    const data = await this.get<{ value: ChatMessage[]; '@odata.nextLink'?: string }>(project, url);
    return { messages: data.value, nextLink: data['@odata.nextLink'] };
  }

  /**
   * Incremental channel-message sync (delegated ChannelMessage.Read.All).
   * Returns root messages only; replies must be paged separately.
   * Known Graph issue: stored delta tokens can start returning 400 — callers
   * must fall back to a high-water-mark strategy on 400/403.
   */
  async getChannelMessagesDelta(
    project: string,
    teamId: string,
    channelId: string,
    deltaLink?: string,
  ): Promise<{ messages: ChatMessage[]; nextLink?: string; deltaLink?: string }> {
    const url = deltaLink
      ? this.stripGraphBase(deltaLink)
      : `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/delta?$top=50`;
    const data = await this.get<{ value: ChatMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(project, url);
    return { messages: data.value, nextLink: data['@odata.nextLink'], deltaLink: data['@odata.deltaLink'] };
  }

  /** Inline image bytes embedded in a channel message body. */
  async getHostedContentBytes(
    project: string,
    teamId: string,
    channelId: string,
    messageId: string,
    hostedContentId: string,
    replyId?: string,
  ): Promise<{ bytes: Buffer; contentType?: string }> {
    const base = `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`;
    const url = replyId
      ? `${base}/replies/${encodeURIComponent(replyId)}/hostedContents/${encodeURIComponent(hostedContentId)}/$value`
      : `${base}/hostedContents/${encodeURIComponent(hostedContentId)}/$value`;
    return this.withRetry(project, async () => {
      const headers = await this.authHeaders(project);
      const resp = await this.http.get<ArrayBuffer>(url, { headers, responseType: 'arraybuffer' });
      return { bytes: Buffer.from(resp.data), contentType: resp.headers?.['content-type'] as string | undefined };
    });
  }

  async listSites(project: string, search?: string): Promise<Array<{ id: string; displayName: string; webUrl: string }>> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '?search=*';
    const data = await this.get<{ value: Array<{ id: string; displayName: string; webUrl: string }> }>(project, `/sites${q}`);
    return data.value;
  }

  async listSiteDrives(project: string, siteId: string): Promise<DriveItem[]> {
    const data = await this.get<{ value: DriveItem[] }>(project, `/sites/${siteId}/drives`);
    return data.value;
  }
}
