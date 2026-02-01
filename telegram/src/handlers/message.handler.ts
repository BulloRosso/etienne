import { Bot, Context, InputFile } from 'grammy';
import { SessionManagerClientService } from '../services/session-manager-client.service';
import { markdownToTelegramHtml, splitTelegramMessage } from '../utils/markdown-to-telegram';

export function registerMessageHandler(
  bot: Bot<Context>,
  sessionManagerClient: SessionManagerClientService,
): void {
  // Handle all text messages
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name;
    const lastName = ctx.from?.last_name;

    console.log(`[Message] chatId=${chatId} text="${text.substring(0, 50)}..."`);

    // Skip commands (handled by command handlers)
    if (text.startsWith('/')) {
      return;
    }

    // Check for project selection command: project 'name' or project "name"
    const projectMatch = text.match(/^project\s+['"]([^'"]+)['"]$/i);
    if (projectMatch) {
      const projectName = projectMatch[1];
      await handleProjectSelection(ctx, sessionManagerClient, chatId, projectName);
      return;
    }

    // Check for file download commands: "show me <filename>", "download <filename>", "get <filename>"
    const downloadMatch = text.match(/^(?:show\s+me|download|get)\s+['"]?([^'"]+?)['"]?\s*$/i);
    if (downloadMatch) {
      const filename = downloadMatch[1].trim();
      await handleFileDownload(ctx, sessionManagerClient, chatId, filename);
      return;
    }

    // Check if user is paired
    const session = await sessionManagerClient.getSession(chatId);

    if (!session) {
      // Not paired - request pairing
      console.log(`[Message] User ${chatId} not paired, requesting pairing...`);

      await ctx.reply(
        '👋 Welcome! You need to pair this chat before using Etienne.\n\n' +
        'A pairing request has been sent to the admin. Please wait for approval...'
      );

      const result = await sessionManagerClient.requestPairing(
        chatId,
        userId,
        username,
        firstName,
        lastName,
      );

      if (result.error === 'Already paired') {
        await ctx.reply(
          '✅ You are already paired! Use `project \'project-name\'` to select a project.',
          { parse_mode: 'Markdown' }
        );
      } else if (!result.success) {
        await ctx.reply(`❌ Pairing request failed: ${result.error}`);
      }
      // If success, the SSE listener will handle the approval notification

      return;
    }

    // Check if project is selected
    if (!session.project?.name) {
      // List available projects
      const projects = await sessionManagerClient.listProjects();
      const projectList = projects.length > 0
        ? projects.map(p => `• \`${p}\``).join('\n')
        : '(No projects available)';

      await ctx.reply(
        '📁 No project selected.\n\n' +
        'Available projects:\n' +
        projectList + '\n\n' +
        'Select a project with:\n`project \'project-name\'`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Send typing indicator
    await ctx.replyWithChatAction('typing');

    // Forward message to Etienne
    console.log(`[Message] Forwarding to Etienne for project "${session.project.name}"...`);

    const result = await sessionManagerClient.sendMessage(chatId, text);

    if (result.success && result.response) {
      // Send response (split if too long)
      await sendLongMessage(ctx, result.response);

      // Show token usage if available
      if (result.tokenUsage) {
        const { input_tokens, output_tokens } = result.tokenUsage;
        console.log(`[Message] Tokens: in=${input_tokens}, out=${output_tokens}`);
      }
    } else {
      await ctx.reply(`❌ Error: ${result.error || 'Unknown error'}`);
    }
  });

  // Handle photo messages
  bot.on('message:photo', async (ctx) => {
    await handleMediaMessage(ctx, sessionManagerClient, 'photo');
  });

  // Handle document/file messages
  bot.on('message:document', async (ctx) => {
    await handleMediaMessage(ctx, sessionManagerClient, 'document');
  });

  // Handle video messages
  bot.on('message:video', async (ctx) => {
    await handleMediaMessage(ctx, sessionManagerClient, 'video');
  });

  // Handle voice messages
  bot.on('message:voice', async (ctx) => {
    await handleMediaMessage(ctx, sessionManagerClient, 'voice');
  });

  // Handle audio messages
  bot.on('message:audio', async (ctx) => {
    await handleMediaMessage(ctx, sessionManagerClient, 'audio');
  });
}

async function handleMediaMessage(
  ctx: Context,
  sessionManagerClient: SessionManagerClientService,
  mediaType: 'photo' | 'document' | 'video' | 'voice' | 'audio',
): Promise<void> {
  const chatId = ctx.chat!.id;
  const caption = ctx.message?.caption || '';

  console.log(`[Media] chatId=${chatId} type=${mediaType} caption="${caption.substring(0, 50)}"`);

  // Check if user is paired
  const session = await sessionManagerClient.getSession(chatId);

  if (!session) {
    await ctx.reply(
      '👋 You need to pair first before sending files.\n\n' +
      'Send /start to begin pairing.'
    );
    return;
  }

  if (!session.project?.name) {
    await ctx.reply(
      '📁 Please select a project first before sending files.\n\n' +
      'Use: `project \'project-name\'`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Get file info based on media type
  let fileId: string | undefined;
  let fileName: string | undefined;

  if (mediaType === 'photo') {
    // Photos come in multiple sizes, get the largest one
    const photos = ctx.message?.photo;
    if (photos && photos.length > 0) {
      const largestPhoto = photos[photos.length - 1];
      fileId = largestPhoto.file_id;
      fileName = `photo_${Date.now()}.jpg`;
    }
  } else if (mediaType === 'document') {
    const doc = ctx.message?.document;
    if (doc) {
      fileId = doc.file_id;
      fileName = doc.file_name || `document_${Date.now()}`;
    }
  } else if (mediaType === 'video') {
    const video = ctx.message?.video;
    if (video) {
      fileId = video.file_id;
      fileName = video.file_name || `video_${Date.now()}.mp4`;
    }
  } else if (mediaType === 'voice') {
    const voice = ctx.message?.voice;
    if (voice) {
      fileId = voice.file_id;
      fileName = `voice_${Date.now()}.ogg`;
    }
  } else if (mediaType === 'audio') {
    const audio = ctx.message?.audio;
    if (audio) {
      fileId = audio.file_id;
      fileName = audio.file_name || `audio_${Date.now()}.mp3`;
    }
  }

  if (!fileId || !fileName) {
    await ctx.reply('❌ Could not process this file type.');
    return;
  }

  try {
    await ctx.replyWithChatAction('upload_document');

    // Download file from Telegram
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    console.log(`[Media] Downloading from: ${fileUrl}`);

    // Upload to backend
    const uploadResult = await sessionManagerClient.uploadAttachment(
      chatId,
      session.project.name,
      fileName,
      fileUrl,
    );

    if (uploadResult.success) {
      await ctx.reply(`✅ File uploaded: \`${fileName}\``, { parse_mode: 'Markdown' });

      // If there's a caption, send it as a message referencing the file
      if (caption) {
        await ctx.replyWithChatAction('typing');

        const messageWithFile = `Please have a look at ${fileName} in the .attachments folder. ${caption}`;
        const result = await sessionManagerClient.sendMessage(chatId, messageWithFile);

        if (result.success && result.response) {
          await sendLongMessage(ctx, result.response);
        } else if (result.error) {
          await ctx.reply(`❌ Error: ${result.error}`);
        }
      }
    } else {
      await ctx.reply(`❌ Failed to upload file: ${uploadResult.error}`);
    }
  } catch (error: any) {
    console.error('[Media] Error processing file:', error);
    await ctx.reply(`❌ Error processing file: ${error.message || 'Unknown error'}`);
  }
}

async function handleFileDownload(
  ctx: Context,
  sessionManagerClient: SessionManagerClientService,
  chatId: number,
  filename: string,
): Promise<void> {
  console.log(`[Download] Requesting file "${filename}" for chatId=${chatId}`);

  // Check if user is paired
  const session = await sessionManagerClient.getSession(chatId);

  if (!session) {
    await ctx.reply(
      '❌ You need to pair first before downloading files.\n\n' +
      'Send /start to begin pairing.'
    );
    return;
  }

  if (!session.project?.name) {
    await ctx.reply(
      '📁 Please select a project first before downloading files.\n\n' +
      'Use: `project \'project-name\'`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Show upload indicator while downloading/sending
  await ctx.replyWithChatAction('upload_document');

  // Download the file from the project workspace
  const result = await sessionManagerClient.downloadFile(chatId, filename);

  if (!result.success || !result.buffer) {
    await ctx.reply(`❌ Could not download file: ${result.error || 'File not found'}`);
    return;
  }

  try {
    // Determine if this is an image or document based on mime type
    const isImage = result.mimeType?.startsWith('image/') && !result.mimeType?.includes('svg');

    if (isImage) {
      // Send as photo for images (better preview in Telegram)
      await ctx.replyWithPhoto(
        new InputFile(result.buffer, result.filename),
        { caption: `📁 ${result.filename}` }
      );
    } else {
      // Send as document for other files
      await ctx.replyWithDocument(
        new InputFile(result.buffer, result.filename),
        { caption: `📁 Downloaded from project workspace` }
      );
    }

    console.log(`[Download] File sent: ${result.filename}`);
  } catch (error: any) {
    console.error('[Download] Error sending file to Telegram:', error);
    await ctx.reply(`❌ Error sending file: ${error.message || 'Unknown error'}`);
  }
}

async function handleProjectSelection(
  ctx: Context,
  sessionManagerClient: SessionManagerClientService,
  chatId: number,
  projectName: string,
): Promise<void> {
  console.log(`[Project] Selecting "${projectName}" for chatId=${chatId}`);

  const result = await sessionManagerClient.selectProject(chatId, projectName);

  if (result.success) {
    await ctx.reply(
      `✅ Connected to project: \`${projectName}\`\n` +
      `Session: ${result.sessionId || 'new'}\n\n` +
      'You can now send messages to Etienne!',
      { parse_mode: 'Markdown' }
    );
  } else {
    // List available projects on error
    const projects = await sessionManagerClient.listProjects();
    const projectList = projects.length > 0
      ? projects.map(p => `• \`${p}\``).join('\n')
      : '(No projects available)';

    await ctx.reply(
      `❌ ${result.error}\n\n` +
      'Available projects:\n' +
      projectList,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * Send a long message by splitting it into chunks
 * Converts markdown to Telegram HTML and respects the 4096 character limit
 */
async function sendLongMessage(ctx: Context, text: string): Promise<void> {
  // Convert markdown to Telegram HTML
  const htmlText = markdownToTelegramHtml(text);

  // Split into chunks if needed
  const chunks = splitTelegramMessage(htmlText);

  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    } catch (error: any) {
      // If HTML parsing fails, fall back to plain text
      console.error('[Message] HTML parse error, falling back to plain text:', error.message);
      await ctx.reply(text.substring(0, 4000));
    }
  }
}
