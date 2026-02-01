import {
  ActivityHandler,
  TurnContext,
  TeamsInfo,
} from 'botbuilder';
import { SessionManagerClientService } from './services/session-manager-client.service';

export class TeamsBot extends ActivityHandler {
  constructor(private readonly sessionManagerClient: SessionManagerClientService) {
    super();

    // Handle incoming messages
    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    // Handle new members added (bot installed)
    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded || []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            '👋 Welcome to Etienne!\n\n' +
            'Type `/start` to begin pairing, or just send a message to get started.'
          );
        }
      }
      await next();
    });
  }

  private async handleMessage(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const text = (context.activity.text || '').trim();
    const userId = context.activity.from.id;
    const userName = context.activity.from.name;

    console.log(`[Message] conversationId=${conversationId} text="${text.substring(0, 50)}..."`);

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(context, text);
      return;
    }

    // Check for project selection command: project 'name' or project "name"
    const projectMatch = text.match(/^project\s+['"]([^'"]+)['"]$/i);
    if (projectMatch) {
      const projectName = projectMatch[1];
      await this.handleProjectSelection(context, projectName);
      return;
    }

    // Check for file download commands: "show me <filename>", "download <filename>", "get <filename>"
    const downloadMatch = text.match(/^(?:show\s+me|download|get)\s+['"]?([^'"]+?)['"]?\s*$/i);
    if (downloadMatch) {
      const filename = downloadMatch[1].trim();
      await this.handleFileDownload(context, filename);
      return;
    }

    // Check if user is paired
    const session = await this.sessionManagerClient.getSession(conversationId);

    if (!session) {
      // Not paired - request pairing
      console.log(`[Message] User ${conversationId} not paired, requesting pairing...`);
      await this.requestPairing(context);
      return;
    }

    // Check if project is selected
    if (!session.project?.name) {
      await this.showProjectList(context);
      return;
    }

    // Send typing indicator
    await context.sendActivity({ type: 'typing' });

    // Forward message to Etienne
    console.log(`[Message] Forwarding to Etienne for project "${session.project.name}"...`);

    const result = await this.sessionManagerClient.sendMessage(conversationId, text);

    if (result.success && result.response) {
      // Send response (split if too long)
      await this.sendLongMessage(context, result.response);

      // Log token usage if available
      if (result.tokenUsage) {
        const { input_tokens, output_tokens } = result.tokenUsage;
        console.log(`[Message] Tokens: in=${input_tokens}, out=${output_tokens}`);
      }
    } else {
      await context.sendActivity(`❌ Error: ${result.error || 'Unknown error'}`);
    }
  }

  private async handleCommand(context: TurnContext, command: string): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const cmd = command.toLowerCase().split(' ')[0];

    switch (cmd) {
      case '/start':
        await this.handleStartCommand(context);
        break;

      case '/status':
        await this.handleStatusCommand(context);
        break;

      case '/projects':
        await this.handleProjectsCommand(context);
        break;

      case '/disconnect':
        await this.handleDisconnectCommand(context);
        break;

      case '/help':
        await this.handleHelpCommand(context);
        break;

      default:
        await context.sendActivity(
          `Unknown command: ${cmd}\n\nType /help to see available commands.`
        );
    }
  }

  private async handleStartCommand(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const userId = context.activity.from.id;
    const userName = context.activity.from.name;

    console.log(`[Command] /start from conversationId=${conversationId}, user=${userName}`);

    // Check if already paired
    const session = await this.sessionManagerClient.getSession(conversationId);

    if (session) {
      // Already paired
      let message = '✅ You are already paired!\n\n';

      if (session.project?.name) {
        message += `📁 Current project: \`${session.project.name}\`\n\n`;
        message += 'You can send messages to Etienne directly.';
      } else {
        const projects = await this.sessionManagerClient.listProjects();
        const projectList = projects.length > 0
          ? projects.map(p => `• \`${p}\``).join('\n')
          : '(No projects available)';

        message += 'Select a project to start:\n' + projectList + '\n\n';
        message += 'Use: `project \'project-name\'`';
      }

      await context.sendActivity(message);
      return;
    }

    // Not paired - send pairing request
    await this.requestPairing(context);
  }

  private async handleStatusCommand(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const session = await this.sessionManagerClient.getSession(conversationId);

    if (!session) {
      await context.sendActivity(
        '❌ Not paired.\n\n' +
        'Send /start to request pairing.'
      );
      return;
    }

    let status = '📊 **Session Status**\n\n';
    status += `Provider: ${session.provider}\n`;
    status += `Status: ${session.status}\n`;

    if (session.project?.name) {
      status += `\n📁 **Project**: \`${session.project.name}\`\n`;
      if (session.project.sessionId) {
        status += `Session ID: ${session.project.sessionId.substring(0, 8)}...\n`;
      }
    } else {
      status += '\n📁 **Project**: (none selected)\n';
    }

    await context.sendActivity(status);
  }

  private async handleProjectsCommand(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const session = await this.sessionManagerClient.getSession(conversationId);

    if (!session) {
      await context.sendActivity(
        '❌ Not paired.\n\n' +
        'Send /start to request pairing.'
      );
      return;
    }

    const projects = await this.sessionManagerClient.listProjects();

    if (projects.length === 0) {
      await context.sendActivity('📁 No projects available.');
      return;
    }

    const projectList = projects.map(p => `• \`${p}\``).join('\n');
    const currentProject = session.project?.name;

    let message = '📁 **Available Projects**\n\n' + projectList;

    if (currentProject) {
      message += `\n\n✅ Current: \`${currentProject}\``;
    }

    message += '\n\nSelect with: `project \'project-name\'`';

    await context.sendActivity(message);
  }

  private async handleDisconnectCommand(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const success = await this.sessionManagerClient.disconnect(conversationId);

    if (success) {
      await context.sendActivity(
        '👋 Disconnected successfully.\n\n' +
        'Send /start to reconnect.'
      );
    } else {
      await context.sendActivity('❌ Failed to disconnect or not connected.');
    }
  }

  private async handleHelpCommand(context: TurnContext): Promise<void> {
    await context.sendActivity(
      '📖 **Available Commands**\n\n' +
      '/start - Start pairing or show status\n' +
      '/status - Show current session status\n' +
      '/projects - List available projects\n' +
      '/disconnect - Disconnect this chat\n' +
      '/help - Show this help message\n\n' +
      '**Project Selection**\n' +
      '`project \'project-name\'` - Select a project\n\n' +
      '**Messaging**\n' +
      'Just type your message to chat with Etienne!'
    );
  }

  private async requestPairing(context: TurnContext): Promise<void> {
    const conversationId = context.activity.conversation.id;
    const userId = context.activity.from.id;
    const userName = context.activity.from.name;

    await context.sendActivity(
      '👋 Welcome! You need to pair this chat before using Etienne.\n\n' +
      'A pairing request has been sent to the admin. Please wait for approval...'
    );

    const result = await this.sessionManagerClient.requestPairing(
      conversationId,
      userId,
      undefined, // Teams doesn't have username like Telegram
      userName,
      undefined,
    );

    if (result.error === 'Already paired') {
      await context.sendActivity(
        '✅ You are already paired! Use `project \'project-name\'` to select a project.'
      );
    } else if (!result.success) {
      await context.sendActivity(`❌ Pairing request failed: ${result.error}`);
    }
    // If success, the SSE listener will handle the approval notification
  }

  private async handleProjectSelection(context: TurnContext, projectName: string): Promise<void> {
    const conversationId = context.activity.conversation.id;
    console.log(`[Project] Selecting "${projectName}" for conversationId=${conversationId}`);

    const result = await this.sessionManagerClient.selectProject(conversationId, projectName);

    if (result.success) {
      await context.sendActivity(
        `✅ Connected to project: \`${projectName}\`\n` +
        `Session: ${result.sessionId || 'new'}\n\n` +
        'You can now send messages to Etienne!'
      );
    } else {
      // List available projects on error
      const projects = await this.sessionManagerClient.listProjects();
      const projectList = projects.length > 0
        ? projects.map(p => `• \`${p}\``).join('\n')
        : '(No projects available)';

      await context.sendActivity(
        `❌ ${result.error}\n\n` +
        'Available projects:\n' +
        projectList
      );
    }
  }

  private async handleFileDownload(context: TurnContext, filename: string): Promise<void> {
    const conversationId = context.activity.conversation.id;
    console.log(`[Download] Requesting file "${filename}" for conversationId=${conversationId}`);

    const session = await this.sessionManagerClient.getSession(conversationId);

    if (!session) {
      await context.sendActivity(
        '❌ You need to pair first before downloading files.\n\n' +
        'Send /start to begin pairing.'
      );
      return;
    }

    if (!session.project?.name) {
      await context.sendActivity(
        '📁 Please select a project first before downloading files.\n\n' +
        'Use: `project \'project-name\'`'
      );
      return;
    }

    // Show typing indicator
    await context.sendActivity({ type: 'typing' });

    const result = await this.sessionManagerClient.downloadFile(conversationId, filename);

    if (!result.success || !result.buffer) {
      await context.sendActivity(`❌ Could not download file: ${result.error || 'File not found'}`);
      return;
    }

    // Note: Sending files in Teams requires different handling (using attachments/cards)
    // For now, we'll inform the user about the file
    await context.sendActivity(
      `📁 File found: \`${result.filename}\`\n` +
      `Size: ${result.buffer.length} bytes\n` +
      `Type: ${result.mimeType}\n\n` +
      'Note: File download to Teams is not yet implemented. Please access the file directly from the project workspace.'
    );
  }

  private async showProjectList(context: TurnContext): Promise<void> {
    const projects = await this.sessionManagerClient.listProjects();
    const projectList = projects.length > 0
      ? projects.map(p => `• \`${p}\``).join('\n')
      : '(No projects available)';

    await context.sendActivity(
      '📁 No project selected.\n\n' +
      'Available projects:\n' +
      projectList + '\n\n' +
      'Select a project with:\n`project \'project-name\'`'
    );
  }

  /**
   * Send a long message by splitting it into chunks
   * Teams supports larger messages (~28KB) but we split for readability
   */
  private async sendLongMessage(context: TurnContext, text: string): Promise<void> {
    const maxLength = 4000; // Conservative limit for readability

    if (text.length <= maxLength) {
      await context.sendActivity(text);
      return;
    }

    // Split by paragraphs first, then by length
    const paragraphs = text.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 > maxLength) {
        // Send current chunk
        if (currentChunk) {
          await context.sendActivity(currentChunk);
        }
        // If single paragraph is too long, split by lines
        if (paragraph.length > maxLength) {
          const lines = paragraph.split('\n');
          currentChunk = '';
          for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
              await context.sendActivity(currentChunk);
              currentChunk = line;
            } else {
              currentChunk += (currentChunk ? '\n' : '') + line;
            }
          }
        } else {
          currentChunk = paragraph;
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Send remaining chunk
    if (currentChunk) {
      await context.sendActivity(currentChunk);
    }
  }
}
