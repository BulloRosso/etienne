import { Bot, Context } from 'grammy';

export function createBot(token: string): Bot<Context> {
  const bot = new Bot<Context>(token);

  // Error handling
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Bot] Error while handling update ${ctx.update.update_id}:`);
    console.error(err.error);

    // Try to notify user of error
    try {
      ctx.reply('❌ An error occurred. Please try again.');
    } catch {
      // Ignore if we can't send the error message
    }
  });

  return bot;
}
