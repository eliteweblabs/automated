const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog } = require('electron');

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 8080);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 3000);
const EXTERNAL_FRONTEND_URL = process.env.ELECTRON_START_URL;
const FRONTEND_URL = EXTERNAL_FRONTEND_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
const USE_EXTERNAL_SERVERS = Boolean(EXTERNAL_FRONTEND_URL);

const managedProcesses = [];

function projectRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.resolve(__dirname, '../..');
}

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const splitIndex = line.indexOf('=');
    if (splitIndex <= 0) continue;

    const key = line.slice(0, splitIndex).trim();
    let value = line.slice(splitIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadRuntimeEnv(rootDir) {
  const candidates = [path.join(rootDir, '.env'), path.join(process.cwd(), '.env')];
  for (const candidate of candidates) {
    loadEnvFileIfPresent(candidate);
  }
}

function attachLogs(child, label) {
  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  child.on('exit', (code, signal) => {
    const status = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[${label}] exited with ${status}`);
  });
}

function spawnNodeScript(scriptPath, args, options) {
  return spawn(process.execPath, [scriptPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...options.env,
    },
    cwd: options.cwd,
  });
}

function startBackend(rootDir) {
  const backendEntry = path.join(rootDir, 'dist/apps/backend/main.js');
  if (!fs.existsSync(backendEntry)) {
    throw new Error(
      `Missing backend bundle at ${backendEntry}. Run "npm run desktop:build" first.`,
    );
  }

  const backendCwd = app.getPath('userData');
  const origins =
    process.env.CORS_ALLOWED_ORIGINS ||
    `http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}`;

  const backend = spawnNodeScript(backendEntry, [], {
    cwd: backendCwd,
    env: {
      PORT: String(BACKEND_PORT),
      CORS_ALLOWED_ORIGINS: origins,
    },
  });

  managedProcesses.push(backend);
  attachLogs(backend, 'backend');
}

function startFrontend(rootDir) {
  const nextBin = path.join(rootDir, 'node_modules/next/dist/bin/next');
  const nextBuildDir = path.join(rootDir, 'apps/frontend/.next');

  if (!fs.existsSync(nextBin)) {
    throw new Error(`Missing Next.js runtime at ${nextBin}. Run "npm install" first.`);
  }
  if (!fs.existsSync(nextBuildDir)) {
    throw new Error(
      `Missing frontend build at ${nextBuildDir}. Run "npm run desktop:build" first.`,
    );
  }

  const frontend = spawnNodeScript(
    nextBin,
    ['start', 'apps/frontend', '-p', String(FRONTEND_PORT), '-H', '127.0.0.1'],
    {
      cwd: rootDir,
      env: {
        PORT: String(FRONTEND_PORT),
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  );

  managedProcesses.push(frontend);
  attachLogs(frontend, 'frontend');
}

function checkHttp(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https://') ? https : http;
    const request = client.get(url, (response) => {
      response.resume();
      resolve((response.statusCode || 0) < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs, name) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHttp(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Timed out waiting for ${name} at ${url}`);
}

function stopManagedProcesses() {
  for (const child of managedProcesses) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Automated',
    show: false,
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(FRONTEND_URL);
}

async function bootstrap() {
  const rootDir = projectRoot();
  loadRuntimeEnv(rootDir);

  if (!USE_EXTERNAL_SERVERS) {
    startBackend(rootDir);
    await waitForServer(`http://127.0.0.1:${BACKEND_PORT}/api`, 60_000, 'backend');

    startFrontend(rootDir);
    await waitForServer(FRONTEND_URL, 90_000, 'frontend');
  } else {
    await waitForServer(FRONTEND_URL, 90_000, 'frontend');
  }

  createWindow();
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[desktop] failed to start', error);
    dialog.showErrorBox('Desktop startup failed', message);
    app.quit();
  }
});

app.on('before-quit', () => {
  stopManagedProcesses();
});

app.on('window-all-closed', () => {
  app.quit();
});

