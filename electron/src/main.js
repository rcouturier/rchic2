const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const portfinder = require('portfinder');
const log = require('electron-log');

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

  // Try bundled R first (production)
  if (!isDev) {
    const rPortablePath = getResourcePath('R-portable');

    if (platform === 'win32') {
      const bundledR = path.join(rPortablePath, 'bin', 'Rscript.exe');
      if (fs.existsSync(bundledR)) {
        log.info('Using bundled R');
        return bundledR;
      }
    } else if (platform === 'darwin') {
      // macOS: Try direct path to R.framework first (more reliable than wrapper)
      // The wrapper can have issues with App Translocation on macOS

      // Try R.framework/Resources/bin/Rscript (symlink path)
      const rFrameworkBin = path.join(rPortablePath, 'R.framework', 'Resources', 'bin', 'Rscript');
      if (fs.existsSync(rFrameworkBin)) {
        log.info('Using bundled R from R.framework/Resources');
        return rFrameworkBin;
      }

      // Try Versions path (handles different R versions for Intel/ARM)
      const versionsPath = path.join(rPortablePath, 'R.framework', 'Versions');
      if (fs.existsSync(versionsPath)) {
        const versions = fs.readdirSync(versionsPath).filter(v => !v.startsWith('.') && v !== 'Current');
        for (const ver of versions) {
          const rscript = path.join(versionsPath, ver, 'Resources', 'bin', 'Rscript');
          if (fs.existsSync(rscript)) {
            log.info(`Using bundled R from R.framework/Versions/${ver}`);
            return rscript;
          }
        }
      }

      // Fallback: try the wrapper script in bin/
      const wrapperScript = path.join(rPortablePath, 'bin', 'Rscript');
      if (fs.existsSync(wrapperScript)) {
        log.info('Using bundled R wrapper script (fallback)');
        return wrapperScript;
      }

      // Debug: list what's in R.framework
      log.warn('R not found in R.framework, listing contents for debug:');
      try {
        const rFrameworkPath = path.join(rPortablePath, 'R.framework');
        if (fs.existsSync(rFrameworkPath)) {
          log.info(`R.framework contents: ${fs.readdirSync(rFrameworkPath).join(', ')}`);
          if (fs.existsSync(versionsPath)) {
            log.info(`Versions contents: ${fs.readdirSync(versionsPath).join(', ')}`);
          }
        } else {
          log.warn('R.framework does not exist!');
        }
      } catch (e) {
        log.warn(`Could not list R.framework: ${e.message}`);
      }
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

      // Start R process with external script
      rProcess = spawn(rPath, [
        startScript,
        serverPort.toString(),
        plumberPath,
        webPath
      ], {
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

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  // Create menu
  const menuTemplate = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir un fichier CSV...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Actualiser' },
        { role: 'toggleDevTools', label: 'Outils de developpement' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom -' },
        { role: 'resetZoom', label: 'Zoom 100%' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein ecran' }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/rchic/Rchic/')
        },
        {
          label: 'A propos',
          click: () => showAbout()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

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

// App lifecycle
app.whenReady().then(async () => {
  log.info('App starting...');

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
