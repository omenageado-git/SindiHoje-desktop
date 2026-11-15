// A ponte entre a página do SindiHoje e o app do Windows: o site pergunta se roda no app,
// fica sabendo quando uma atualização do app terminou de baixar e pede para reiniciar.
// Só isso: a página não ganha nenhum outro acesso ao computador.
const { contextBridge, ipcRenderer } = require('electron');

let pronta = null;
const ouvintes = new Set();

ipcRenderer.on('atualizacao-pronta', (_evento, info) => {
  pronta = info;
  ouvintes.forEach((ouvir) => ouvir(info));
});

contextBridge.exposeInMainWorld('sindihojeDesktop', {
  versao: ipcRenderer.sendSync('versao-do-app'),
  /** Chama `ouvir({ versao })` quando a versão nova do app já está baixada (na hora, se já estiver). */
  aoAtualizar(ouvir) {
    ouvintes.add(ouvir);
    if (pronta) ouvir(pronta);
    return () => ouvintes.delete(ouvir);
  },
  /** Fecha, instala a versão baixada e abre de novo. */
  reiniciar() {
    ipcRenderer.send('reiniciar-e-atualizar');
  },
});
