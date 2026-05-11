import { z } from 'zod';

export const mergeOutputSchema = z.object({
  mergedBody: z.string().min(1),
  contested: z.boolean(),
});
