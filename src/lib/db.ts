import { PrismaClient } from '@prisma/client'
import { ensureSeeded } from './salonflow/bootstrap'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// On Vercel the filesystem is read-only except /tmp — keep the SQLite file there.
// Locally the DATABASE_URL from .env is used as-is.
const isServerless = Boolean(process.env.VERCEL)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(isServerless ? { datasources: { db: { url: 'file:/tmp/salonflow.db' } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/** Resolves once the schema + demo data are guaranteed present. */
export const dbReady = ensureSeeded(db)
