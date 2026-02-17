const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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
  const os = require('os');
  log.transports.file.resolvePathFn = () => path.join(os.homedir(), 'RCHIC-debug.log');
}
log.info('Log file location:', log.transports.file.getFile().path);

let mainWindow = null;
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

function getRPath() {
  const platform = process.platform;
  const fs = require('fs');

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
      const bundledR = path.join(rPortablePath, 'bin', 'Rscript.exe');
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

// Start R Plumber server
async function startRServer() {
  return new Promise(async (resolve, reject) => {
    try {
      // Find available port
      portfinder.basePort = 8484;
      serverPort = await portfinder.getPortPromise();
      log.info(`Using port: ${serverPort}`);

      const rPath = getRPath();
      const plumberPath = getResourcePath('plumber');
      const webPath = getResourcePath('web');
      const startScript = isDev
        ? path.join(__dirname, 'start-server.R')
        : path.join(process.resourcesPath, 'plumber', 'start-server.R');

      log.info(`R path: ${rPath}`);
      log.info(`Plumber path: ${plumberPath}`);
      log.info(`Web path: ${webPath}`);
      log.info(`Start script: ${startScript}`);

      // Build environment with R_HOME for macOS
      const rEnv = { ...process.env };

      // On macOS, set R_HOME to R.framework/Resources
      if (process.platform === 'darwin' && !isDev) {
        const rPortablePath = getResourcePath('R-portable');
        const fs = require('fs');

        // Try the symlink path first
        let rFrameworkResources = path.join(rPortablePath, 'R.framework', 'Resources');
        if (!fs.existsSync(rFrameworkResources)) {
          // Try to find actual Resources in Versions
          const versionsPath = path.join(rPortablePath, 'R.framework', 'Versions');
          if (fs.existsSync(versionsPath)) {
            const versions = fs.readdirSync(versionsPath).filter(v => !v.startsWith('.') && v !== 'Current');
            for (const ver of versions) {
              const candidate = path.join(versionsPath, ver, 'Resources');
              if (fs.existsSync(candidate)) {
                rFrameworkResources = candidate;
                break;
              }
            }
          }
        }

        if (fs.existsSync(rFrameworkResources)) {
          rEnv.R_HOME = rFrameworkResources;
          log.info(`Set R_HOME to: ${rEnv.R_HOME}`);
        } else {
          log.warn(`R_HOME not found: ${rFrameworkResources}`);
        }
      }

      // Build arguments depending on whether we're using R or Rscript
      const isRBin = rPath.endsWith('/R') || rPath.endsWith('\\R');
      const rArgs = isRBin
        ? ['--slave', '--no-restore', `--file=${startScript}`, '--args', serverPort.toString(), plumberPath, webPath]
        : [startScript, serverPort.toString(), plumberPath, webPath];

      log.info(`Using ${isRBin ? 'R' : 'Rscript'} with args: ${rArgs.join(' ')}`);

      // Start R process with external script
      rProcess = spawn(rPath, rArgs, {
        cwd: plumberPath,
        env: rEnv
      });

      rProcess.stdout.on('data', (data) => {
        log.info(`R: ${data}`);
      });

      rProcess.stderr.on('data', (data) => {
        const message = data.toString();
        log.info(`R: ${message}`);

        // Check if server is running
        if (message.includes('Running') || message.includes('Starting server')) {
          setTimeout(() => resolve(serverPort), 1000);
        }
      });

      rProcess.on('error', (err) => {
        log.error(`Failed to start R: ${err}`);
        log.error(`R path was: ${rPath}`);
        dialog.showErrorBox('Erreur R', `Impossible de lancer R:\n${err.message}\n\nChemin: ${rPath}`);
        reject(err);
      });

      rProcess.on('close', (code) => {
        log.info(`R process exited with code ${code}`);
        rProcess = null;
      });

      // Timeout - assume server started after 5 seconds
      setTimeout(() => resolve(serverPort), 5000);

    } catch (err) {
      log.error(`Error starting R server: ${err}`);
      reject(err);
    }
  });
}

// Stop R server
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

// Build application menu with translations
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

// Create main window
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
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Open file dialog
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

// Show about dialog
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'A propos de RCHIC',
    message: 'RCHIC - Analyse Statistique Implicative',
    detail: `Version: ${app.getVersion()}\n\nAuteur: Raphael Couturier\nUniversite de Franche-Comte\n\nBasé sur la theorie de Regis Gras.`
  });
}

// Wait for server to be ready
async function waitForServer(port, maxAttempts = 30) {
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
      return true;
    } catch (e) {
      log.info(`Waiting for server... attempt ${i + 1}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

// IPC handlers
ipcMain.on('set-locale', (event, locale) => {
  log.info('IPC set-locale received:', locale);
  setLocale(locale);
});

// App lifecycle
app.whenReady().then(async () => {
  log.info('App starting...');

  // Initialize locale
  currentLocale = detectLocale();
  loadMenuTranslations();
  log.info('Locale initialized to:', currentLocale);

  try {
    await startRServer();
    log.info('R server started');

    // Wait for server to be actually ready
    const isReady = await waitForServer(serverPort);
    if (!isReady) {
      log.warn('Server may not be fully ready, proceeding anyway...');
    }

    createWindow();
  } catch (err) {
    log.error('Failed to start:', err);
    dialog.showErrorBox('Erreur', `Impossible de demarrer le serveur R:\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopRServer();
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
