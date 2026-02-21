const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const portfinder = require('portfinder');
const log = require('electron-log');

// i18n for menus
let currentLocale = 'fr';
let menuTranslations = {};

function loadMenuTranslations() {
  const locales = ['fr', 'en', 'pt'];
  for (const locale of locales) {
    try {
      const localePath = getResourcePath(path.join('web', 'locales', `${locale}.json`));
      if (fs.existsSync(localePath)) {
        const content = fs.readFileSync(localePath, 'utf8');
        const data = JSON.parse(content);
        menuTranslations[locale] = {
          file: locale === 'fr' ? 'Fichier' : (locale === 'en' ? 'File' : 'Arquivo'),
          openFile: locale === 'fr' ? 'Ouvrir un fichier CSV...' : (locale === 'en' ? 'Open CSV file...' : 'Abrir arquivo CSV...'),
          quit: locale === 'fr' ? 'Quitter' : (locale === 'en' ? 'Quit' : 'Sair'),
          view: locale === 'fr' ? 'Affichage' : (locale === 'en' ? 'View' : 'Visualizar'),
          reload: locale === 'fr' ? 'Actualiser' : (locale === 'en' ? 'Reload' : 'Atualizar'),
          devTools: locale === 'fr' ? 'Outils de developpement' : (locale === 'en' ? 'Developer Tools' : 'Ferramentas de desenvolvimento'),
          zoomIn: 'Zoom +',
          zoomOut: 'Zoom -',
          zoomReset: 'Zoom 100%',
          fullscreen: locale === 'fr' ? 'Plein ecran' : (locale === 'en' ? 'Fullscreen' : 'Tela cheia'),
          help: locale === 'fr' ? 'Aide' : (locale === 'en' ? 'Help' : 'Ajuda'),
          documentation: 'Documentation',
          about: locale === 'fr' ? 'A propos' : (locale === 'en' ? 'About' : 'Sobre')
        };
      }
    } catch (e) {
      log.warn(`Could not load locale ${locale}:`, e.message);
    }
  }
  // Default fallback
  if (!menuTranslations.fr) {
    menuTranslations.fr = {
      file: 'Fichier', openFile: 'Ouvrir un fichier CSV...', quit: 'Quitter',
      view: 'Affichage', reload: 'Actualiser', devTools: 'Outils de developpement',
      zoomIn: 'Zoom +', zoomOut: 'Zoom -', zoomReset: 'Zoom 100%', fullscreen: 'Plein ecran',
      help: 'Aide', documentation: 'Documentation', about: 'A propos'
    };
  }
}

function getMenuTranslation(key) {
  const t = menuTranslations[currentLocale] || menuTranslations.fr;
  return t[key] || key;
}

function detectLocale() {
  const systemLocale = app.getLocale().slice(0, 2);
  if (['fr', 'en', 'pt'].includes(systemLocale)) {
    return systemLocale;
  }
  return 'fr';
}

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// On Windows, also log to a known location for debugging
if (process.platform === 'win32') {
  log.transports.file.resolvePathFn = () => path.join(os.homedir(), 'RCHIC-debug.log');
}
log.info('Log file location:', log.transports.file.getFile().path);

let mainWindow = null;
let splashWindow = null;
let rProcess = null;
let serverPort = 8484;
let isDev = process.argv.includes('--dev');

// Paths
function getResourcePath(relativePath) {
  if (isDev) {
    // In dev mode, resources are in inst/ folder
    return path.join(__dirname, '..', '..', 'inst', relativePath);
  }
  return path.join(process.resourcesPath, relativePath);
}

// ---------------------------------------------------------------------------
// Splash screen helpers
// ---------------------------------------------------------------------------

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 370,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js')
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  return new Promise(resolve => {
    splashWindow.webContents.once('did-finish-load', resolve);
  });
}

/**
 * Send a status update to the splash screen.
 * id      – unique step identifier (string)
 * status  – 'pending' | 'success' | 'warning' | 'error'
 * message – short label
 * detail  – optional longer description / path / value
 */
function sendSplashStatus(id, status, message, detail) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const js = `typeof updateStatus === 'function' && updateStatus(
    ${JSON.stringify(id)},
    ${JSON.stringify(status)},
    ${JSON.stringify(message)},
    ${JSON.stringify(detail || '')}
  )`;
  splashWindow.webContents.executeJavaScript(js).catch(() => {});
}

/**
 * Check available memory and report to the splash screen.
 * Returns false only when memory is dangerously low (< 512 MB free).
 */
function checkSystemRequirements() {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const totalGB  = (totalMem / (1024 ** 3)).toFixed(1);
  const freeGB   = (freeMem  / (1024 ** 3)).toFixed(1);

  const detail = `Total RAM: ${totalGB} GB  —  Free: ${freeGB} GB`;

  const MIN_FREE  = 512  * 1024 * 1024; // 512 MB  – hard minimum
  const WARN_FREE = 1024 * 1024 * 1024; // 1 GB    – soft warning

  if (freeMem < MIN_FREE) {
    sendSplashStatus('memory', 'error',
      'Insufficient free memory',
      detail + '  (minimum 512 MB required — R may fail to start)');
    log.error('Insufficient memory:', detail);
    return false;
  }

  if (freeMem < WARN_FREE) {
    sendSplashStatus('memory', 'warning',
      'Low memory detected',
      detail + '  (less than 1 GB free — performance may be affected)');
    log.warn('Low memory:', detail);
    return true;
  }

  sendSplashStatus('memory', 'success', 'System requirements OK', detail);
  log.info('Memory check OK:', detail);
  return true;
}

// ---------------------------------------------------------------------------
// Disk space check (temp folder used by R)
// ---------------------------------------------------------------------------
async function checkDiskSpace() {
  const tmpDir = os.tmpdir();
  sendSplashStatus('disk', 'pending', 'Checking disk space...');

  try {
    let freeBytes = null;

    if (process.platform === 'win32') {
      const drive = path.parse(tmpDir).root.replace(/\\/g, '').replace('/', '');
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`,
        { timeout: 3000, windowsHide: true }
      ).toString();
      const m = out.match(/FreeSpace=(\d+)/);
      freeBytes = m ? parseInt(m[1]) : null;
    } else {
      const out = execSync(`df -Pk "${tmpDir}" 2>/dev/null | tail -1`, { timeout: 3000 }).toString();
      const parts = out.trim().split(/\s+/);
      freeBytes = parts[3] ? parseInt(parts[3]) * 1024 : null; // KB → bytes
    }

    if (freeBytes === null) {
      sendSplashStatus('disk', 'warning', 'Could not determine free disk space', tmpDir);
      return;
    }

    const freeMB = Math.round(freeBytes / (1024 * 1024));
    const detail = `Temp folder (${tmpDir})  —  Free: ${freeMB} MB`;

    if (freeBytes < 200 * 1024 * 1024) {
      sendSplashStatus('disk', 'error',
        'Insufficient disk space in temp folder',
        detail + '  (minimum 200 MB required)');
      log.error('Insufficient disk space:', detail);
    } else if (freeBytes < 500 * 1024 * 1024) {
      sendSplashStatus('disk', 'warning',
        'Low disk space in temp folder',
        detail + '  (less than 500 MB free — large files may fail)');
      log.warn('Low disk space:', detail);
    } else {
      sendSplashStatus('disk', 'success', 'Disk space OK', detail);
      log.info('Disk check OK:', detail);
    }
  } catch (e) {
    sendSplashStatus('disk', 'warning', 'Could not check disk space', e.message);
    log.warn('Disk space check failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// R path detection
// ---------------------------------------------------------------------------

function getRPath() {
  const platform = process.platform;

  // Common R locations on different platforms
  const getSystemRPaths = () => {
    if (platform === 'win32') {
      const paths = [];

      // Check R_HOME environment variable first
      if (process.env.R_HOME) {
        paths.push(path.join(process.env.R_HOME, 'bin', 'x64', 'Rscript.exe'));
        paths.push(path.join(process.env.R_HOME, 'bin', 'Rscript.exe'));
      }

      // Scan Program Files for R installations
      const programFiles = ['C:\\Program Files\\R', 'C:\\Program Files (x86)\\R'];
      for (const pf of programFiles) {
        if (fs.existsSync(pf)) {
          try {
            const rVersions = fs.readdirSync(pf).filter(d => d.startsWith('R-')).sort().reverse();
            for (const ver of rVersions) {
              paths.push(path.join(pf, ver, 'bin', 'x64', 'Rscript.exe'));
              paths.push(path.join(pf, ver, 'bin', 'Rscript.exe'));
            }
          } catch (e) {
            log.warn(`Could not scan ${pf}: ${e.message}`);
          }
        }
      }

      return paths;
    }
    return [
      '/usr/bin/Rscript',
      '/usr/local/bin/Rscript',
      '/opt/R/bin/Rscript',
      '/opt/homebrew/bin/Rscript',
      process.env.R_HOME ? path.join(process.env.R_HOME, 'bin', 'Rscript') : null
    ].filter(Boolean);
  };

  // Try bundled R first (production and dev)
  {
    const rPortablePath = isDev
      ? path.join(__dirname, '..', `R-portable-${platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'}`)
      : getResourcePath('R-portable');

    if (platform === 'win32') {
      // Prefer bin\x64\Rscript.exe — the actual 64-bit binary.
      // bin\Rscript.exe is a launcher with a hardcoded absolute path to the
      // original install location; it breaks when the app is moved to another machine.
      const bundledR64 = path.join(rPortablePath, 'bin', 'x64', 'Rscript.exe');
      const bundledR   = path.join(rPortablePath, 'bin', 'Rscript.exe');
      if (fs.existsSync(bundledR64)) {
        log.info('Using bundled R (x64)');
        return bundledR64;
      }
      if (fs.existsSync(bundledR)) {
        log.info('Using bundled R');
        return bundledR;
      }
    } else if (platform === 'darwin') {
      // macOS: Architecture-aware R selection
      const archSuffix = process.arch === 'arm64' ? 'arm64' : 'x86_64';
      const altArchSuffix = process.arch === 'arm64' ? 'x86_64' : 'arm64';
      log.info(`Detected architecture: ${process.arch} (looking for ${archSuffix})`);

      const versionsPath = path.join(rPortablePath, 'R.framework', 'Versions');
      if (fs.existsSync(versionsPath)) {
        const versions = fs.readdirSync(versionsPath)
          .filter(v => !v.startsWith('.') && v !== 'Current');

        // First pass: prefer matching architecture
        for (const ver of versions) {
          if (ver.includes(archSuffix)) {
            const rBin = path.join(versionsPath, ver, 'Resources', 'bin', 'R');
            if (fs.existsSync(rBin)) {
              log.info(`Using native ${archSuffix} R from R.framework/Versions/${ver}`);
              return rBin;
            }
          }
        }

        // Second pass: fall back to other architecture (Rosetta compatibility)
        for (const ver of versions) {
          if (ver.includes(altArchSuffix)) {
            const rBin = path.join(versionsPath, ver, 'Resources', 'bin', 'R');
            if (fs.existsSync(rBin)) {
              log.warn(`Native ${archSuffix} R not found, falling back to ${altArchSuffix} (via Rosetta)`);
              return rBin;
            }
          }
        }

        // Third pass: any version at all
        for (const ver of versions) {
          const rBin = path.join(versionsPath, ver, 'Resources', 'bin', 'R');
          if (fs.existsSync(rBin)) {
            log.warn(`Using R from R.framework/Versions/${ver} (architecture unknown)`);
            return rBin;
          }
        }
      }

      // Legacy fallback: try Resources symlink
      const rBinScript = path.join(rPortablePath, 'R.framework', 'Resources', 'bin', 'R');
      if (fs.existsSync(rBinScript)) {
        log.info('Using bundled R from R.framework/Resources/bin/R (via symlink)');
        return rBinScript;
      }

      log.warn('Bundled R not found in R.framework');
    } else {
      // Linux
      const bundledR = path.join(rPortablePath, 'bin', 'Rscript');
      if (fs.existsSync(bundledR)) {
        log.info('Using bundled R');
        return bundledR;
      }
    }
    log.info('Bundled R not found, falling back to system R');
  }

  // Fallback to system R
  for (const p of getSystemRPaths()) {
    if (fs.existsSync(p)) {
      log.info(`Using system R: ${p}`);
      return p;
    }
  }

  // Last resort - hope it's in PATH
  log.warn('R not found in standard locations, trying PATH');
  log.warn('Searched paths:', getSystemRPaths().join(', '));
  return platform === 'win32' ? 'Rscript.exe' : 'Rscript';
}

// ---------------------------------------------------------------------------
// Start R Plumber server
// ---------------------------------------------------------------------------
async function startRServer() {
  return new Promise(async (resolve, reject) => {
    try {
      // --- Port ---
      sendSplashStatus('port', 'pending', 'Finding available port...');
      portfinder.basePort = 8484;
      serverPort = await portfinder.getPortPromise();
      sendSplashStatus('port', 'success', `Port ${serverPort} is available`);
      log.info(`Using port: ${serverPort}`);

      // --- Locate R ---
      sendSplashStatus('r-locate', 'pending', 'Locating R installation...');
      const rPath = getRPath();

      const isBundled = rPath.includes('R-portable') || rPath.includes('R.framework');
      const fallbackToPath = rPath === 'Rscript' || rPath === 'Rscript.exe';

      if (fallbackToPath) {
        sendSplashStatus('r-locate', 'warning',
          'Bundled R not found — using system PATH',
          'Install R if the application fails to start');
      } else if (isBundled) {
        sendSplashStatus('r-locate', 'success', 'Bundled R found', rPath);
      } else {
        sendSplashStatus('r-locate', 'success', 'System R found', rPath);
      }
      log.info(`R path: ${rPath}`);

      const plumberPath = getResourcePath('plumber');
      const webPath = getResourcePath('web');
      const startScript = isDev
        ? path.join(__dirname, 'start-server.R')
        : path.join(process.resourcesPath, 'plumber', 'start-server.R');

      log.info(`Plumber path: ${plumberPath}`);
      log.info(`Web path: ${webPath}`);
      log.info(`Start script: ${startScript}`);

      // Build environment with R_HOME for macOS
      const rEnv = { ...process.env };

      // On macOS, derive R_HOME from the selected bin/R path
      if (process.platform === 'darwin') {
        const rDir  = path.dirname(rPath); // .../bin
        const rHome = path.dirname(rDir);  // .../Resources
        if (fs.existsSync(rHome)) {
          rEnv.R_HOME = rHome;
          log.info(`Set R_HOME to: ${rEnv.R_HOME}`);
        }
      }

      // On Linux, the bundled Rscript binary has R_HOME compiled-in and ignores env R_HOME.
      // Set R_LIBS instead — R always respects it and adds it to .libPaths() at startup.
      if (process.platform === 'linux') {
        const rPortablePath = isDev
          ? path.join(__dirname, '..', 'R-portable-linux')
          : getResourcePath('R-portable');
        const portableLib = path.join(rPortablePath, 'library');
        if (fs.existsSync(portableLib)) {
          rEnv.R_LIBS = portableLib;
          log.info(`Set R_LIBS to: ${portableLib}`);
        }
      }

      // Build arguments depending on whether we're using R or Rscript
      const isRBin = rPath.endsWith('/R') || rPath.endsWith('\\R');
      const rArgs = isRBin
        ? ['--slave', '--no-restore', `--file=${startScript}`, '--args', serverPort.toString(), plumberPath, webPath]
        : [startScript, serverPort.toString(), plumberPath, webPath];

      log.info(`Using ${isRBin ? 'R' : 'Rscript'} with args: ${rArgs.join(' ')}`);

      // --- Spawn R ---
      sendSplashStatus('r-start', 'pending', 'Starting R process...');
      rProcess = spawn(rPath, rArgs, {
        cwd: plumberPath,
        env: rEnv
      });

      // settled guards against resolve/reject being called more than once
      let settled = false;
      const settle = (fn, value) => { if (!settled) { settled = true; fn(value); } };

      // Accumulate stderr lines for crash diagnosis
      const stderrLines = [];

      rProcess.stdout.on('data', (data) => {
        log.info(`R stdout: ${data}`);
      });

      rProcess.stderr.on('data', (data) => {
        const message = data.toString();
        log.info(`R: ${message}`);

        // Collect non-empty lines for crash diagnosis
        message.split('\n').forEach(l => { if (l.trim()) stderrLines.push(l.trim()); });

        // Server is up
        if (!settled && (message.includes('Running') || message.includes('Starting server'))) {
          sendSplashStatus('r-start', 'success', 'R server started', `Listening on port ${serverPort}`);
          setTimeout(() => settle(resolve, serverPort), 1000);
        }

        // Surface R error lines in the splash before the server starts
        if (!settled) {
          const errorLines = message.split('\n').filter(l =>
            /^Error\b|^ERROR\b|cannot open|permission denied|no such file|package .* not found/i.test(l.trim())
          );
          if (errorLines.length > 0) {
            sendSplashStatus('r-errors', 'warning',
              'R reported an issue',
              errorLines[0].trim().substring(0, 120));
            log.warn('R error line:', errorLines[0]);
          }
        }
      });

      rProcess.on('error', (err) => {
        log.error(`Failed to start R: ${err}`);
        log.error(`R path was: ${rPath}`);
        sendSplashStatus('r-start', 'error', 'Failed to launch R', err.message);
        settle(reject, err);
      });

      rProcess.on('close', (code) => {
        log.info(`R process exited with code ${code}`);
        rProcess = null;

        if (!settled && code !== null && code !== 0) {
          // R crashed before the server ever started
          const errorSummary = stderrLines
            .filter(l => /error|fatal|cannot|failed|missing|package/i.test(l))
            .slice(0, 2)
            .join('  |  ') || `Exit code: ${code}`;
          sendSplashStatus('r-crash', 'error',
            `R process exited unexpectedly (code ${code})`,
            errorSummary);
          log.error('R crashed before server started:', errorSummary);
          settle(reject, new Error(`R exited with code ${code}: ${errorSummary}`));
        } else if (!settled) {
          // R exited cleanly (code 0) but server never confirmed — unusual
          sendSplashStatus('r-crash', 'warning',
            'R process ended before server started',
            'Trying to connect anyway...');
          settle(resolve, serverPort);
        }
      });

      // 5 s timeout: if R hasn't confirmed startup yet, proceed and let waitForServer decide
      setTimeout(() => {
        if (!settled) {
          sendSplashStatus('r-start', 'warning',
            'R startup confirmation not received',
            'Attempting to connect anyway...');
          settle(resolve, serverPort);
        }
      }, 5000);

    } catch (err) {
      log.error(`Error starting R server: ${err}`);
      sendSplashStatus('r-start', 'error', 'R server error', err.message);
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Stop R server
// ---------------------------------------------------------------------------
function stopRServer() {
  if (rProcess) {
    log.info('Stopping R server...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', rProcess.pid, '/f', '/t']);
    } else {
      rProcess.kill('SIGTERM');
    }
    rProcess = null;
  }
}

// ---------------------------------------------------------------------------
// Build application menu with translations
// ---------------------------------------------------------------------------
function buildMenu() {
  const menuTemplate = [
    {
      label: getMenuTranslation('file'),
      submenu: [
        {
          label: getMenuTranslation('openFile'),
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        { type: 'separator' },
        {
          label: getMenuTranslation('quit'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: getMenuTranslation('view'),
      submenu: [
        { role: 'reload', label: getMenuTranslation('reload') },
        { role: 'toggleDevTools', label: getMenuTranslation('devTools') },
        { type: 'separator' },
        { role: 'zoomIn', label: getMenuTranslation('zoomIn') },
        { role: 'zoomOut', label: getMenuTranslation('zoomOut') },
        { role: 'resetZoom', label: getMenuTranslation('zoomReset') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: getMenuTranslation('fullscreen') }
      ]
    },
    {
      label: getMenuTranslation('help'),
      submenu: [
        {
          label: getMenuTranslation('documentation'),
          click: () => shell.openExternal('https://github.com/rchic/Rchic/')
        },
        {
          label: getMenuTranslation('about'),
          click: () => showAbout()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// Set locale and rebuild menu
function setLocale(locale) {
  if (['fr', 'en', 'pt'].includes(locale)) {
    currentLocale = locale;
    buildMenu();
    log.info('Locale set to:', locale);
  }
}

// ---------------------------------------------------------------------------
// Create main window
// ---------------------------------------------------------------------------
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  log.info('Preload path:', preloadPath);
  log.info('Preload exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: preloadPath
    },
    show: false
  });

  // Create menu with current locale
  buildMenu();

  // Load the app
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Close splash once the main window is visible
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Open file dialog
// ---------------------------------------------------------------------------
async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    mainWindow.webContents.executeJavaScript(`
      fetch('${filePath}')
        .then(r => r.text())
        .then(content => {
          // Trigger file load in the app
          if (window.rchicApp) {
            window.rchicApp.loadFileFromPath('${filePath.replace(/\\/g, '\\\\')}');
          }
        });
    `);
  }
}

// ---------------------------------------------------------------------------
// About dialog
// ---------------------------------------------------------------------------
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'A propos de RCHIC',
    message: 'RCHIC - Analyse Statistique Implicative',
    detail: `Version: ${app.getVersion()}\n\nAuteur: Raphael Couturier\nUniversite de Franche-Comte\n\nBasé sur la theorie de Regis Gras.`
  });
}

// ---------------------------------------------------------------------------
// Wait for server to be ready
// ---------------------------------------------------------------------------
async function waitForServer(port, maxAttempts = 120) {
  const http = require('http');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      log.info(`Server ready after ${i + 1} attempts`);
      sendSplashStatus('server', 'success',
        'Server is ready',
        `Responded on port ${port} after ${i + 1} health-check${i === 0 ? '' : 's'}`);
      return true;
    } catch (e) {
      log.info(`Waiting for server... attempt ${i + 1}`);
      sendSplashStatus('server', 'pending',
        `Connecting to server…  (attempt ${i + 1} / ${maxAttempts})`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
ipcMain.on('set-locale', (event, locale) => {
  log.info('IPC set-locale received:', locale);
  setLocale(locale);
});

ipcMain.on('splash-quit', () => {
  log.info('User closed splash after error');
  app.quit();
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  log.info('App starting...');

  // Initialize locale
  currentLocale = detectLocale();
  loadMenuTranslations();
  log.info('Locale initialized to:', currentLocale);

  // Show splash screen and wait for it to fully load
  await createSplashWindow();

  // Inject current version into splash footer
  splashWindow.webContents
    .executeJavaScript(`typeof setVersion === 'function' && setVersion(${JSON.stringify(app.getVersion())})`)
    .catch(() => {});

  // --- Step 1: memory ---
  sendSplashStatus('memory', 'pending', 'Checking system requirements...');
  await new Promise(r => setTimeout(r, 80)); // let the renderer paint
  const memOK = checkSystemRequirements();
  if (!memOK) {
    await new Promise(r => setTimeout(r, 2000));
  }

  // --- Step 2: disk space ---
  await checkDiskSpace();

  // --- Step 3: start R & wait for server ---
  try {
    await startRServer();
    log.info('R server process started');

    // --- Step 3: wait for HTTP health check ---
    sendSplashStatus('server', 'pending', 'Connecting to server…');
    const isReady = await waitForServer(serverPort);

    if (!isReady) {
      sendSplashStatus('server', 'warning',
        'Server health-check timed out',
        'The application may not work correctly');
      log.warn('Server may not be fully ready, proceeding anyway...');
    }

    // Brief pause so the user can read the "ready" state
    await new Promise(r => setTimeout(r, 500));

    // --- Open main window (splash closes automatically in ready-to-show) ---
    createWindow();

  } catch (err) {
    log.error('Failed to start:', err);
    sendSplashStatus('fatal', 'error', 'Application failed to start', err.message);
    // Show the Quit button and leave the splash open so the user can read the error
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents
        .executeJavaScript('typeof showQuitButton === "function" && showQuitButton()')
        .catch(() => {});
    }
  }
});

app.on('window-all-closed', () => {
  stopRServer();
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (app.isReady() && BrowserWindow.getAllWindows().length === 0 && serverPort) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopRServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
  stopRServer();
});
