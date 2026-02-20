import { Injectable, OnModuleInit } from '@nestjs/common';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { copyFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data', 'browser-contexts');

@Injectable()
export class LocalStorageService implements OnModuleInit {
  async onModuleInit() {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[LocalStorage] Data directory ready: ${DATA_DIR}`);
  }

  async uploadUserData(userId: string, localPath: string): Promise<void> {
    if (!existsSync(localPath)) {
      console.warn(`[LocalStorage] Local path does not exist: ${localPath}`);
      return;
    }

    const userDir = join(DATA_DIR, userId);
    mkdirSync(userDir, { recursive: true });

    const tarPath = join(userDir, 'user-data.tar.gz');
    try {
      execSync(`tar -czf "${tarPath}" -C "${localPath}" . 2>/dev/null || true`, { stdio: 'pipe' });
      console.log(`[LocalStorage] Saved user data for ${userId}`);
    } catch (error) {
      console.warn(`[LocalStorage] Error saving user data for ${userId} (non-fatal):`, error);
    }
  }

  async downloadUserData(userId: string, destPath: string): Promise<boolean> {
    const tarPath = join(DATA_DIR, userId, 'user-data.tar.gz');

    if (!existsSync(tarPath)) {
      return false;
    }

    try {
      mkdirSync(destPath, { recursive: true });
      execSync(`tar -xzf "${tarPath}" -C "${destPath}"`, { stdio: 'pipe' });
      console.log(`[LocalStorage] Restored user data for ${userId} to ${destPath}`);
      return true;
    } catch (error) {
      console.warn(`[LocalStorage] Failed to restore user data for ${userId}, deleting corrupted archive`);
      // Remove corrupted archive so future sessions start fresh
      try {
        const { unlinkSync } = require('fs');
        unlinkSync(tarPath);
      } catch {
        // ignore cleanup errors
      }
      return false;
    }
  }
}
