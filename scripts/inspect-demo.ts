/** Prints a summary of the local demo data (dev aid): `npx tsx --conditions=react-server scripts/inspect-demo.ts`. */
import path from "node:path";
import { sql } from "drizzle-orm";

async function main() {
  const { createPglite } = await import("../src/lib/db");
  const db = await createPglite(path.join(process.cwd(), ".data", "nazar"));
  const q = async (label: string, s: ReturnType<typeof sql>) => {
    const r = (await db.execute(s)) as unknown as { rows: Record<string, unknown>[] };
    console.log(`\n== ${label}`);
    console.table(r.rows);
  };
  await q("users", sql`select email, is_demo, is_test_account from users order by email`);
  await q("alerts by type (template)", sql`select type, severity, count(*)::int n from alert_events a join users u on u.id=a.user_id where u.email like 'template%' group by 1,2 order by 1`);
  // await q("stock_move magnitudes + ratings", sql`select a.trade_date, a.title_en, round((a.data->>'magnitude')::numeric,1) mag, f.rating, a.data->'reason'->>'kind' reason from alert_events a join users u on u.id=a.user_id left join alert_feedback f on f.alert_id=a.id where u.email like 'template%' and a.type in ('stock_move','portfolio_move','results','learned') order by a.trade_date`);
  await q("threshold changes", sql`select t.alert_type, t.old_value, t.new_value, t.created_at, t.evidence::text, t.message_en from threshold_changes t join users u on u.id=t.user_id where u.email like 'template%'`);
  await q("results events", sql`select symbol, quarter_end, detected_on, source from results_events`);
  await q("reports", sql`select p.name, r.week_start, r.week_end, r.content->'en'->>'subject' subject from reports r join portfolios p on p.id=r.portfolio_id join users u on u.id=r.user_id where u.email like 'template%'`);
  await q("latest demo nifty", sql`select trade_date, price, change_pct from symbol_snapshots where symbol='^NSEI' and source='demo' order by trade_date desc limit 3`);
  process.exit(0);
}
main();
