import "server-only";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/lib/db";

export const authSecret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  // Dev convenience only; set NEXTAUTH_SECRET in production.
  (process.env.NODE_ENV !== "production" ? "stockai-dev-secret-change-me" : undefined);

function hashFingerprint(fp: string) {
  return createHash("sha256").update(`${authSecret ?? ""}:${fp}`).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Account linking: "device user → Google/GitHub account"              */
/* ------------------------------------------------------------------ */

export const LINK_COOKIE = "stockai_link";

/** Signed "<userId>.<expiry>.<sig>" so the OAuth callback knows which device user started sign-in. */
export function signLink(userId: string) {
  const exp = Date.now() + 10 * 60_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${createHmac("sha256", authSecret ?? "").update(payload).digest("base64url")}`;
}

function verifyLink(v: string | undefined): string | null {
  if (!v) return null;
  const i = v.lastIndexOf(".");
  const payload = v.slice(0, i);
  const sig = Buffer.from(v.slice(i + 1));
  const want = Buffer.from(createHmac("sha256", authSecret ?? "").update(payload).digest("base64url"));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  const [uid, exp] = payload.split(".");
  return Number(exp) > Date.now() ? uid : null;
}

/** Moves chats, watchlist, alerts and usage from one user to another (used when a device joins an account). */
async function mergeUsers(fromId: string, intoId: string) {
  if (fromId === intoId) return;
  const db = await getDb();
  await db.update(schema.chats).set({ userId: intoId }).where(eq(schema.chats.userId, fromId));
  await db.update(schema.usage).set({ userId: intoId }).where(eq(schema.usage.userId, fromId));
  await db.update(schema.alerts).set({ userId: intoId }).where(eq(schema.alerts.userId, fromId));
  await db.execute(sql`insert into watchlist (user_id, symbol, added_at) select ${intoId}, symbol, added_at from watchlist where user_id = ${fromId} on conflict do nothing`);
  await db.delete(schema.watchlist).where(eq(schema.watchlist.userId, fromId));
}

/** Finds or creates the user for an OAuth identity, linking/merging the current device user if there is one. */
async function resolveOAuthUser(provider: string, providerAccountId: string, profile: { email?: string | null; name?: string | null; image?: string | null }) {
  const db = await getDb();
  let linkUid: string | null = null;
  try {
    const jar = await cookies();
    linkUid = verifyLink(jar.get(LINK_COOKIE)?.value);
    jar.delete(LINK_COOKIE);
  } catch {}
  if (linkUid) {
    const exists = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, linkUid)).limit(1);
    if (!exists[0]) linkUid = null;
  }

  const [linked] = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.provider, provider), eq(schema.accounts.providerAccountId, providerAccountId)))
    .limit(1);

  let uid: string;
  if (linked) {
    uid = linked.userId;
    // Signing in on another device: bring that device's research into the account.
    if (linkUid && linkUid !== uid) await mergeUsers(linkUid, uid);
  } else {
    uid = linkUid ?? randomUUID();
    if (!linkUid) await db.insert(schema.users).values({ id: uid, fingerprintHash: `oauth:${provider}:${providerAccountId}` }).onConflictDoNothing();
    await db.insert(schema.accounts).values({ provider, providerAccountId, userId: uid, email: profile.email ?? null }).onConflictDoNothing();
  }
  await db
    .update(schema.users)
    .set({ email: profile.email ?? null, name: profile.name ?? null, image: profile.image ?? null, lastSeenAt: new Date() })
    .where(eq(schema.users.id, uid));
  return uid;
}

/* ------------------------------------------------------------------ */
/* Providers                                                            */
/* ------------------------------------------------------------------ */

const oauthProviders = [
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })
    : null,
  process.env.GITHUB_ID && process.env.GITHUB_SECRET ? GitHubProvider({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET }) : null,
].filter((p) => p !== null);

/** OAuth providers that are configured (shown as "Sign in with …" buttons). */
export const enabledOAuth = oauthProviders.map((p) => ({ id: p.id, name: p.name }));

/**
 * Two ways in:
 * 1. Fingerprint (default, zero-friction): the browser computes a stable device fingerprint and
 *    signs in with it. We only store a salted SHA-256 of it.
 * 2. Google / GitHub (optional, when env vars are set): links the device's history to a real
 *    account so it syncs across devices.
 */
export const authOptions: NextAuthOptions = {
  secret: authSecret,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
  pages: { signIn: "/" },
  providers: [
    CredentialsProvider({
      id: "fingerprint",
      name: "Device fingerprint",
      credentials: { fingerprint: { label: "Fingerprint", type: "text" } },
      async authorize(credentials) {
        const fp = credentials?.fingerprint;
        if (!fp || typeof fp !== "string" || !/^[a-f0-9]{64}$/.test(fp)) return null;
        const fingerprintHash = hashFingerprint(fp);
        const db = await getDb().catch((e) => {
          console.error("[auth] database unavailable:", e);
          throw e;
        });
        const existing = await db.select().from(schema.users).where(eq(schema.users.fingerprintHash, fingerprintHash)).limit(1);
        if (existing[0]) {
          await db.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, existing[0].id));
          return { id: existing[0].id, name: existing[0].name ?? `Analyst ${existing[0].id.slice(0, 4).toUpperCase()}`, email: existing[0].email, image: existing[0].image };
        }
        const id = randomUUID();
        await db.insert(schema.users).values({ id, fingerprintHash }).onConflictDoNothing();
        const row = await db.select().from(schema.users).where(eq(schema.users.fingerprintHash, fingerprintHash)).limit(1);
        const uid = row[0]?.id ?? id;
        return { id: uid, name: `Analyst ${uid.slice(0, 4).toUpperCase()}` };
      },
    }),
    ...oauthProviders,
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account && account.provider !== "fingerprint") {
        token.uid = await resolveOAuthUser(account.provider, account.providerAccountId, {
          email: user?.email ?? (profile as { email?: string } | undefined)?.email,
          name: user?.name,
          image: user?.image,
        });
        token.provider = account.provider;
      } else if (user) {
        token.uid = user.id;
        token.provider = user.email ? "linked-device" : "fingerprint";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as { id?: string; provider?: string };
        u.id = token.uid as string;
        u.provider = token.provider as string;
      }
      return session;
    },
  },
};

export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as { id?: string } | undefined)?.id) ?? null;
}
