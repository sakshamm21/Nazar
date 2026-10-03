import { z } from "zod";
import { MANUAL_CLASSES } from "@/lib/instruments/asset-classes";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

/** What the user enters for an asset with no price feed (shared by the add and edit endpoints). */
export const ManualAsset = z.object({
  assetClass: z.enum(MANUAL_CLASSES),
  name: z.string().trim().min(1, "Give it a name.").max(80),
  invested: z.number().positive("Amount invested must be more than 0.").max(1e12),
  value: z.number().positive("Current value must be more than 0.").max(1e12),
  valueAsOf: day,
  ratePct: z.number().min(0).max(40, "That interest rate looks too high.").nullable().optional(),
  startDate: day.nullable().optional(),
  maturityDate: day.nullable().optional(),
});
