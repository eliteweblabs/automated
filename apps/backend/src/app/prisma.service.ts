import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient as PostgresPrismaClient } from '@automated/prisma';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolveDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || '';
}

function isPostgresUrl(databaseUrl: string) {
  return databaseUrl.toLowerCase().includes('postgres');
}

function workspaceRoot() {
  return path.resolve(__dirname, '../../../../');
}

function toSafeDefaultSqliteUrl() {
  return 'file:./data/local.db';
}

function resolveSqliteDatabaseUrl(databaseUrl: string) {
  const rawUrl = databaseUrl || toSafeDefaultSqliteUrl();
  if (!rawUrl.startsWith('file:')) {
    return toSafeDefaultSqliteUrl();
  }

  const rawPath = rawUrl.slice(5);
  if (!rawPath || rawPath.startsWith(':memory:') || path.isAbsolute(rawPath)) {
    return rawUrl;
  }

  // Prisma db tooling may use schema-relative URLs like ../../../../data/local.db.
  // Those can escape the runtime cwd and break app startup, so normalize to a safe app-relative path.
  const resolvedFromCwd = path.resolve(process.cwd(), decodeURIComponent(rawPath));
  const root = workspaceRoot();
  if (!resolvedFromCwd.startsWith(root + path.sep)) {
    return toSafeDefaultSqliteUrl();
  }

  return rawUrl;
}

function resolveRuntimePrismaClient(): typeof PostgresPrismaClient {
  const databaseUrl = resolveDatabaseUrl();
  if (isPostgresUrl(databaseUrl)) {
    return PostgresPrismaClient;
  }

  try {
    const sqliteClientModule = require('../../../../libs/prisma/generated/prisma-sqlite/client');
    return sqliteClientModule.PrismaClient as typeof PostgresPrismaClient;
  } catch (error) {
    const message = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(
      `DATABASE_URL does not contain "postgres" and SQLite Prisma client is missing. Run "npm run prisma:generate:sqlite".${message}`,
    );
  }
}

const RuntimePrismaClient = resolveRuntimePrismaClient();
type TypedPrismaClientCtor = new (...args: ConstructorParameters<typeof PostgresPrismaClient>) => PostgresPrismaClient;

@Injectable()
export class PrismaService extends (RuntimePrismaClient as TypedPrismaClientCtor) implements OnModuleInit {
  constructor() {
    const databaseUrl = resolveDatabaseUrl();
    if (!isPostgresUrl(databaseUrl)) {
      let sqliteUrl = resolveSqliteDatabaseUrl(databaseUrl);
      if (sqliteUrl.startsWith('file:')) {
        const rawPath = sqliteUrl.slice(5);
        if (!rawPath.startsWith(':memory:')) {
          const sqliteFilePath = path.resolve(process.cwd(), decodeURIComponent(rawPath));
          fs.mkdirSync(path.dirname(sqliteFilePath), { recursive: true });
          // Always pass an absolute file URL to Prisma so it resolves correctly
          // regardless of schema/client location.
          sqliteUrl = 'file:' + sqliteFilePath;
        }
      }
      process.env.DATABASE_URL = sqliteUrl;

      super({
        datasources: {
          db: {
            url: sqliteUrl,
          },
        },
      });
      return;
    }

    super();
  }

  async onModuleInit() {
    await this.$connect();
  }
}
