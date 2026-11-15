// SindiHoje para Windows: uma janela própria com o navegador embutido (Electron), que abre
// o SindiHoje publicado. Cada versão nova do site chega sozinha, com o aviso para recarregar;
// depois da primeira abertura, o app funciona também sem internet (o cache offline do site).
// O próprio app (esta janela e o navegador embutido) se atualiza pelos Releases deste
// repositório: baixa em segundo plano e o site mostra o aviso para reiniciar.
const { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const path = require('path');

const Site = 'https://sindihoje.expo.app/';
const Hosts = ['sindihoje.expo.app'];
// O login com o Google (e a Apple) começa no Supabase. O Google recusa login dentro de
// janelas embutidas ("Esse navegador ou app pode não ser seguro"), então ele é feito no
// navegador do computador (abaixo, loginNoNavegador).
const Autorizar = 'https://wwxcnnbtsleeyhfxwiql.supabase.co/auth/v1/authorize';
const HostsLogin = ['wwxcnnbtsleeyhfxwiql.supabase.co'];

// A janela se apresenta como o Chrome (sites que estranham "Electron" no navegador).
const UserAgent = () =>
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

function hostDe(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const doApp = (url) => Hosts.includes(hostDe(url));
const doLogin = (url) => HostsLogin.includes(hostDe(url));

let janela = null;

const PaginaPronto = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>SindiHoje</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;
font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif;background:#F2F2F7;color:#1C1C1E}
@media(prefers-color-scheme:dark){body{background:#0A1C24;color:#fff}}p{opacity:.7}</style></head>
<body><main><h1>Login feito</h1><p>Pode fechar esta aba e voltar ao SindiHoje.</p></main></body></html>`;

let servidorLogin = null;

/**
 * O login com o Google no navegador do computador, de volta para a janela do app:
 * 1. abre o endereço do Supabase no navegador, trocando a volta (redirect_to) pela página
 *    ponte do site (login-desktop.html), com a porta onde este app espera;
 * 2. a ponte entrega o código do login aqui, em 127.0.0.1;
 * 3. a janela abre a volta original (/auth-callback) com o código, e o site conclui o
 *    login com a chave que guardou ao começar (PKCE): o código não serve em outro lugar.
 */
function loginNoNavegador(url) {
  const pedido = new URL(url);
  const voltaOriginal = pedido.searchParams.get('redirect_to');
  const volta = voltaOriginal && doApp(voltaOriginal) ? voltaOriginal : Site + 'auth-callback';
  if (servidorLogin) servidorLogin.close();
  const servidor = http.createServer((req, res) => {
    const recebido = new URL(req.url, 'http://127.0.0.1');
    if (recebido.pathname !== '/callback') {
      res.writeHead(404);
      res.end();
      return;
    }
    const destino = new URL(volta);
    recebido.searchParams.forEach((valor, chave) => {
      if (chave !== 'hash') destino.searchParams.set(chave, valor);
    });
    const hash = recebido.searchParams.get('hash');
    if (hash) destino.hash = hash;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PaginaPronto);
    servidor.close();
    if (servidorLogin === servidor) servidorLogin = null;
    if (janela) {
      janela.loadURL(destino.toString());
      if (janela.isMinimized()) janela.restore();
      janela.show();
      janela.focus();
    }
  });
  servidorLogin = servidor;
  servidor.listen(0, '127.0.0.1', () => {
    const ponte = new URL(Site + 'login-desktop.html');
    ponte.searchParams.set('porta', String(servidor.address().port));
    pedido.searchParams.set('redirect_to', ponte.toString());
    shell.openExternal(pedido.toString());
  });
  // Ninguém voltou em 15 minutos: desiste e libera a porta.
  setTimeout(() => servidor.close(), 15 * 60 * 1000).unref();
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 600,
    title: 'SindiHoje',
    icon: path.join(__dirname, 'icon.png'),
    // As cores do SindiHoje antes de a página desenhar: petróleo no escuro, cinza Apple no claro.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0A1C24' : '#F2F2F7',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  janela.webContents.setUserAgent(UserAgent());
  janela.once('ready-to-show', () => janela.show());

  // Links para fora do SindiHoje (leis, WhatsApp, e-mail) abrem no navegador do computador.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(Autorizar)) {
      loginNoNavegador(url);
    } else if (doApp(url) || doLogin(url)) {
      janela.loadURL(url);
    } else if (/^(https?|mailto|tel):/.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    if (url.startsWith(Autorizar)) {
      evento.preventDefault();
      loginNoNavegador(url);
      return;
    }
    if (doApp(url) || doLogin(url) || url.startsWith('file:')) return;
    evento.preventDefault();
    if (/^(https?|mailto|tel):/.test(url)) shell.openExternal(url);
  });

  // Sem internet na primeira abertura (sem nada no cache): uma página para tentar de novo.
  janela.webContents.on('did-fail-load', (_e, codigo, _desc, url, principal) => {
    if (!principal || codigo === -3 || !doApp(url)) return;
    janela.loadFile(path.join(__dirname, 'offline.html'));
  });

  janela.loadURL(Site);
}

// Uma janela só: abrir de novo traz a que já está aberta para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  ipcMain.on('versao-do-app', (evento) => {
    evento.returnValue = app.getVersion();
  });
  ipcMain.on('reiniciar-e-atualizar', () => autoUpdater.quitAndInstall(true, true));

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setUserAgent(UserAgent());
    // Localização (leis da sua cidade) e notificações: o site pede, a janela permite.
    session.defaultSession.setPermissionRequestHandler((_wc, permissao, responder) => {
      responder(['geolocation', 'notifications', 'clipboard-sanitized-write', 'media', 'fullscreen'].includes(permissao));
    });
    criarJanela();
    atualizar();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => app.quit());
}

const ConferirACadaMs = 4 * 60 * 60 * 1000;
let baixada = null;

/**
 * Atualização do app: confere ao abrir e a cada 4 horas, baixa em segundo plano e avisa a
 * página (o mesmo aviso de versão nova do site, com "Reiniciar"). Se o síndico não
 * reiniciar, a versão baixada se instala sozinha quando ele fechar o app.
 */
function atualizar() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    baixada = { versao: info.version };
    avisarPagina();
  });
  autoUpdater.on('error', (erro) => console.warn('[atualização]', erro?.message ?? erro));
  const conferir = () => autoUpdater.checkForUpdates().catch((erro) => console.warn('[atualização]', erro?.message ?? erro));
  conferir();
  setInterval(conferir, ConferirACadaMs).unref();
}

function avisarPagina() {
  if (baixada && janela && !janela.isDestroyed()) janela.webContents.send('atualizacao-pronta', baixada);
}

// Uma página nova (recarregada, ou depois do login) também fica sabendo.
app.on('web-contents-created', (_e, conteudo) => conteudo.on('did-finish-load', avisarPagina));
