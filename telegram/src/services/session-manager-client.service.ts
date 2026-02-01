import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import {
  SessionInfo,
  PairingResult,
  MessageResult,
  ProjectSelectionResult,
  UploadResult,
  DownloadResult,
} from '../types';

export class SessionManagerClientService {
  private readonly client: AxiosInstance;

  constructor(private readonly backendUrl: string) {
    this.client = axios.create({
      baseURL: backendUrl,
      timeout: 300000, // 5 minute timeout for Etienne responses
    });
  }

  /**
   * Check if a chat is already paired
   */
  async isPaired(chatId: number): Promise<boolean> {
    try {
      const response = await this.client.get(`/api/remote-sessions/paired/${chatId}`);
      return response.data?.paired === true;
    } catch (error) {
      console.error('Error checking pairing status:', error);
      return false;
    }
  }

  /**
   * Get session info for a chat
   */
  async getSession(chatId: number): Promise<SessionInfo | null> {
    try {
      const response = await this.client.get(`/api/remote-sessions/session/${chatId}`);
      if (response.data?.success) {
        return response.data.session;
      }
      return null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Request pairing for a new user
   * This will emit an SSE event to the frontend for admin approval
   */
  async requestPairing(
    chatId: number,
    userId?: number,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<PairingResult> {
    try {
      const response = await this.client.post('/api/remote-sessions/pairing/request', {
        provider: 'telegram',
        chatId,
        userId,
        username,
        firstName,
        lastName,
      });

      return response.data;
    } catch (error: any) {
      console.error('Error requesting pairing:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Select a project for a paired session
   */
  async selectProject(chatId: number, projectName: string): Promise<ProjectSelectionResult> {
    try {
      const response = await this.client.post('/api/remote-sessions/project', {
        chatId,
        projectName,
      });

      return response.data;
    } catch (error: any) {
      console.error('Error selecting project:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a message to Claude via the backend
   */
  async sendMessage(chatId: number, message: string): Promise<MessageResult> {
    try {
      const response = await this.client.post('/api/remote-sessions/message', {
        chatId,
        message,
      });

      return response.data;
    } catch (error: any) {
      console.error('Error sending message:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Unknown error',
      };
    }
  }

  /**
   * List available projects
   */
  async listProjects(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/remote-sessions/projects');
      return response.data?.projects || [];
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  }

  /**
   * Disconnect a session
   */
  async disconnect(chatId: number): Promise<boolean> {
    try {
      const response = await this.client.post(`/api/remote-sessions/disconnect/${chatId}`);
      return response.data?.success === true;
    } catch (error) {
      console.error('Error disconnecting session:', error);
      return false;
    }
  }

  /**
   * Upload an attachment to the project's .attachments folder
   * Downloads the file from Telegram and uploads to backend
   */
  async uploadAttachment(
    chatId: number,
    projectName: string,
    fileName: string,
    fileUrl: string,
  ): Promise<UploadResult> {
    try {
      // Download file from Telegram
      console.log(`[Upload] Downloading file from Telegram: ${fileName}`);
      const fileResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 1 minute timeout for download
      });

      // Create form data for upload
      const formData = new FormData();
      formData.append('file', Buffer.from(fileResponse.data), {
        filename: fileName,
        contentType: fileResponse.headers['content-type'] || 'application/octet-stream',
      });

      // Upload to backend
      console.log(`[Upload] Uploading to backend: ${projectName}/.attachments/${fileName}`);
      const uploadResponse = await axios.post(
        `${this.backendUrl}/api/workspace/${encodeURIComponent(projectName)}/attachments/upload`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 120000, // 2 minute timeout for upload
        }
      );

      return {
        success: uploadResponse.data?.success ?? true,
        message: uploadResponse.data?.message || `File uploaded: ${fileName}`,
      };
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Download a file from the project workspace
   * Returns the file buffer and metadata for sending to Telegram
   */
  async downloadFile(chatId: number, filename: string): Promise<DownloadResult> {
    try {
      console.log(`[Download] Requesting file: ${filename} for chatId ${chatId}`);

      const response = await axios.get(
        `${this.backendUrl}/api/remote-sessions/file/${chatId}/${encodeURIComponent(filename)}`,
        {
          responseType: 'arraybuffer',
          timeout: 60000, // 1 minute timeout
        }
      );

      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const contentDisposition = response.headers['content-disposition'] || '';

      // Extract filename from content-disposition header if available
      let downloadFilename = filename;
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      if (filenameMatch) {
        downloadFilename = filenameMatch[1];
      }

      console.log(`[Download] File received: ${downloadFilename} (${response.data.byteLength} bytes)`);

      return {
        success: true,
        buffer: Buffer.from(response.data),
        filename: downloadFilename,
        mimeType: contentType,
      };
    } catch (error: any) {
      console.error('[Download] Error downloading file:', error.message);

      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Download failed',
      };
    }
  }

  /**
   * List files in the project workspace
   */
  async listFiles(chatId: number, path?: string): Promise<{ files: string[]; error?: string }> {
    try {
      const url = `${this.backendUrl}/api/remote-sessions/files/${chatId}`;
      const params = path ? { path } : {};

      const response = await this.client.get(url, { params });
      return response.data;
    } catch (error: any) {
      console.error('[ListFiles] Error:', error.message);
      return { files: [], error: error.message };
    }
  }
}
