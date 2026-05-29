/**
 * One-off: register the nightly progress recompute as a scheduler task.
 * Used after the event-handling.json fix to recover the missing nightly
 * job that previously lived (broken) as a rule with a cron trigger.
 *
 * Idempotent. Run:
 *   cd c:\Data\GitHub\claude-multitenant
 *   npx tsx scripts/seed-knowledge-transfer/register-scheduler-task.ts
 */
import { login } from '../seed-requirements-hv/lib/auth';
import { apiFetch, ApiError } from '../seed-requirements-hv/lib/api';
import { PROJECT_NAME } from './fixtures/mission';
import { SCHEDULED_TASKS } from './fixtures/event-rules';

async function main() {
  const auth = await login();
  const ctx = { accessToken: auth.accessToken };
  for (const task of SCHEDULED_TASKS) {
    try {
      await apiFetch(ctx, `/api/scheduler/${PROJECT_NAME}/task`, {
        method: 'POST',
        body: JSON.stringify(task),
      });
      console.log(`  ✓ ${task.id} (${task.cronExpression} ${task.timeZone})`);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        console.log(`  · ${task.id} already registered`);
      } else {
        console.log(`  ✗ ${task.id}: ${err?.message ?? err}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
