import { Bot, Context } from 'grammy';
import { SessionManagerClientService } from '../services/session-manager-client.service';

export function registerCommandHandlers(
  bot: Bot<Context>,
  sessionManagerClient: SessionManagerClientService,
): void {
  // /start command - show welcome message and request pairing if needed
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;

    console.log(`[Command] /start from chatId=${chatId}, username=${username}`);

    // Check if already paired
    const session = await sessionManagerClient.getSession(chatId);

    if (session) {
      // Already paired
      let message = '✅ You are already paired!\n\n';

      if (session.project?.name) {
        message += `📁 Current project: \`${session.project.name}\`\n\n`;
        message += 'You can send messages to Etienne directly.';
      } else {
        const projects = await sessionManagerClient.listProjects();
        const projectList = projects.length > 0
          ? projects.map(p => `• \`${p}\``).join('\n')
          : '(No projects available)';

        message += 'Select a project to start:\n' + projectList + '\n\n';
        message += 'Use: `project \'project-name\'`';
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }

    // Not paired - send pairing request
    await ctx.reply(
      '👋 Welcome to Etienne!\n\n' +
      'A pairing request is being sent to the admin.\n' +
      'Please wait for approval...'
    );

    const result = await sessionManagerClient.requestPairing(
      chatId,
      userId,
      username,
      firstName,
      lastName,
    );

    if (!result.success && result.error !== 'Already paired') {
      await ctx.reply(`❌ Pairing request failed: ${result.error}`);
    }
  });

  // /status command - show current session status
  bot.command('status', async (ctx) => {
    const chatId = ctx.chat.id;

    const session = await sessionManagerClient.getSession(chatId);

    if (!session) {
      await ctx.reply(
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

    await ctx.reply(status, { parse_mode: 'Markdown' });
  });

  // /projects command - list available projects
  bot.command('projects', async (ctx) => {
    const chatId = ctx.chat.id;

    // Check if paired first
    const session = await sessionManagerClient.getSession(chatId);

    if (!session) {
      await ctx.reply(
        '❌ Not paired.\n\n' +
        'Send /start to request pairing.'
      );
      return;
    }

    const projects = await sessionManagerClient.listProjects();

    if (projects.length === 0) {
      await ctx.reply('📁 No projects available.');
      return;
    }

    const projectList = projects.map(p => `• \`${p}\``).join('\n');
    const currentProject = session.project?.name;

    let message = '📁 **Available Projects**\n\n' + projectList;

    if (currentProject) {
      message += `\n\n✅ Current: \`${currentProject}\``;
    }

    message += '\n\nSelect with: `project \'project-name\'`';

    await ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // /disconnect command - disconnect session
  bot.command('disconnect', async (ctx) => {
    const chatId = ctx.chat.id;

    const success = await sessionManagerClient.disconnect(chatId);

    if (success) {
      await ctx.reply(
        '👋 Disconnected successfully.\n\n' +
        'Send /start to reconnect.'
      );
    } else {
      await ctx.reply('❌ Failed to disconnect or not connected.');
    }
  });

  // /help command - show available commands
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📖 **Available Commands**\n\n' +
      '/start - Start pairing or show status\n' +
      '/status - Show current session status\n' +
      '/projects - List available projects\n' +
      '/disconnect - Disconnect this chat\n' +
      '/help - Show this help message\n\n' +
      '**Project Selection**\n' +
      '`project \'project-name\'` - Select a project\n\n' +
      '**Messaging**\n' +
      'Just type your message to chat with Etienne!',
      { parse_mode: 'Markdown' }
    );
  });
}
