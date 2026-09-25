import { z } from 'zod';

/**
 * Data captured by the operator at particular procurement stages. Keys mirror
 * what transition_procurement_stage() reads (snake_case); the RPC re-validates
 * every value — this only keeps obviously bad input off the wire.
 */
export const stageDataSchema = z.object({
  weighed_quantity_quintal: z.number().positive('Weight must be greater than zero').max(100000).optional(),
  quality_grade: z.enum(['A', 'B', 'C']).optional(),
  accepted_quantity_quintal: z.number().positive('Accepted quantity must be greater than zero').max(100000).optional(),
  remarks: z.string().max(500).optional(),
});
export type StageData = z.infer<typeof stageDataSchema>;
