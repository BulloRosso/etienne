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
   * Check if a conversation is already paired
   */
  async isPaired(conversationId: string): Promise<boolean> {
    try {
      const response = await this.client.get(`/api/remote-sessions/paired/${encodeURIComponent(conversationId)}`);
      return response.data?.paired === true;
    } catch (error) {
      console.error('Error checking pairing status:', error);
      return false;
    }
  }

  /**
   * Get session info for a conversation
   */
  async getSession(conversationId: string): Promise<SessionInfo | null> {
    try {
      const response = await this.client.get(`/api/remote-sessions/session/${encodeURIComponent(conversationId)}`);
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
    conversationId: string,
    userId?: string,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<PairingResult> {
    try {
      const response = await this.client.post('/api/remote-sessions/pairing/request', {
        provider: 'teams',
        chatId: conversationId,
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
  async selectProject(conversationId: string, projectName: string): Promise<ProjectSelectionResult> {
    try {
      const response = await this.client.post('/api/remote-sessions/project', {
        chatId: conversationId,
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
  async sendMessage(conversationId: string, message: string): Promise<MessageResult> {
    try {
      const response = await this.client.post('/api/remote-sessions/message', {
        chatId: conversationId,
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
  async disconnect(conversationId: string): Promise<boolean> {
    try {
      const response = await this.client.post(`/api/remote-sessions/disconnect/${encodeURIComponent(conversationId)}`);
      return response.data?.success === true;
    } catch (error) {
      console.error('Error disconnecting session:', error);
      return false;
    }
  }

  /**
   * Upload an attachment to the project's .attachments folder
   */
  async uploadAttachment(
    conversationId: string,
    projectName: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<UploadResult> {
    try {
      // Create form data for upload
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: contentType || 'application/octet-stream',
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
   * Returns the file buffer and metadata for sending to Teams
   */
  async downloadFile(conversationId: string, filename: string): Promise<DownloadResult> {
    try {
      console.log(`[Download] Requesting file: ${filename} for conversationId ${conversationId}`);

      const response = await axios.get(
        `${this.backendUrl}/api/remote-sessions/file/${encodeURIComponent(conversationId)}/${encodeURIComponent(filename)}`,
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
  async listFiles(conversationId: string, path?: string): Promise<{ files: string[]; error?: string }> {
    try {
      const url = `${this.backendUrl}/api/remote-sessions/files/${encodeURIComponent(conversationId)}`;
      const params = path ? { path } : {};

      const response = await this.client.get(url, { params });
      return response.data;
    } catch (error: any) {
      console.error('[ListFiles] Error:', error.message);
      return { files: [], error: error.message };
    }
  }
}
