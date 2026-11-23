const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let serverProcess = null;

// ── health check ──────────────────────────────────────────────────────────────
function checkHealth() {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:4000/api/health', (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1500, () => { req.destroy(); resolve(false); });
    });
}

async function waitForServer(maxWaitMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        if (await checkHealth()) return true;
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

// ── start backend as a child process using the Electron/Node runtime ──────────
function startBackend() {
    return new Promise((resolve) => {
        // The Electron app binary doubles as a Node.js runtime when given
        // the --no-sandbox flag and a script to run. But it's simpler to
        // use process.execPath (the electron binary) with a wrapper env var
        // so the main process detects it and runs the server instead.
        const serverDir = path.join(__dirname, '..', 'server');
        const serverEntry = path.join(serverDir, 'src', 'index.js');
        const envFile = path.join(serverDir, '.env');

        // Read .env file manually so we can pass vars to the child
        const envVars = { ...process.env };
        try {
            const fs = require('fs');
            const lines = fs.readFileSync(envFile, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eq = trimmed.indexOf('=');
                if (eq > 0) {
                    const key = trimmed.slice(0, eq).trim();
                    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
                    envVars[key] = val;
                }
            }
        } catch (e) {
            console.error('[MuseumX] Could not read .env:', e.message);
        }

        // Prefer the bundled node runtime shipped with the app,
        // then fall back to common system paths.
        const nodeBin = (() => {
            const fs = require('fs');
            const candidates = [
                // Bundled node runtime (copied into app during build)
                path.join(__dirname, 'node-runtime'),
                // Common system paths
                '/usr/local/bin/node',
                '/opt/homebrew/bin/node',
                '/usr/bin/node',
                // nvm paths
                process.env.HOME + '/.nvm/versions/node/v24.11.0/bin/node',
                process.env.HOME + '/.nvm/versions/node/v22.0.0/bin/node',
                process.env.HOME + '/.nvm/versions/node/v20.0.0/bin/node',
            ];
            for (const c of candidates) {
                try { if (fs.existsSync(c)) return c; } catch {}
            }
            return null;
        })();

        if (!nodeBin) {
            console.error('[MuseumX] node binary not found — cannot start backend.');
            resolve(false);
            return;
        }

        console.log('[MuseumX] Starting backend with:', nodeBin, serverEntry);
        serverProcess = spawn(nodeBin, [serverEntry], {
            cwd: serverDir,
            env: envVars,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        serverProcess.stdout.on('data', d => console.log('[server]', d.toString().trim()));
        serverProcess.stderr.on('data', d => console.error('[server ERR]', d.toString().trim()));
        serverProcess.on('error', e => { console.error('[MuseumX] spawn error:', e); resolve(false); });
        serverProcess.on('exit', (code) => {
            console.log('[MuseumX] server exited with code', code);
            serverProcess = null;
        });

        // Resolve after giving the process a moment to crash immediately
        setTimeout(() => resolve(true), 500);
    });
}

async function ensureBackendRunning() {
    if (await checkHealth()) {
        console.log('[MuseumX] Backend already running.');
        return true;
    }
    await startBackend();
    // Wait up to 60 s for the server to respond (Neon DB cold-start can be slow)
    return waitForServer(60000);
}

// ── window ────────────────────────────────────────────────────────────────────
function splash(message, isError = false) {
    const color = isError ? '%23f88' : '%23aaa';
    return `data:text/html,<html style='margin:0;background:%231a1a2e;display:flex;` +
        `align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:%23fff'>` +
        `<div style='text-align:center'>` +
        `<div style='font-size:2rem;font-weight:bold;margin-bottom:1.2rem'>&#127916;&nbsp;MuseumX</div>` +
        `<div style='font-size:1rem;color:${color}'>${message}</div>` +
        `</div></html>`;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: 'MuseumX',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', e => e.preventDefault());

    const isProduction = app.isPackaged || process.env.MUSEUMX_PROD === '1';

    if (isProduction) {
        win.loadURL(splash('Starting server\u2026'));

        ensureBackendRunning().then((ready) => {
            if (ready) {
                const filePath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
                win.loadFile(filePath);
            } else {
                win.loadURL(splash(
                    'Could not start the backend server.<br>Check your internet connection and reopen the app.',
                    true
                ));
            }
        });
    } else {
        win.loadURL('http://localhost:5173');
    }

    return win;
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('app:getInfo', () => ({ version: app.getVersion(), platform: process.platform }));
ipcMain.on('window:minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('window:maximize', e => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('window:close', e => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('window:isMaximized', e => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);

// ── lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});
