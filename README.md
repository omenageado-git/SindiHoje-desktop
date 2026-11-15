# SindiHoje para Windows

O app do [SindiHoje](https://sindihoje.expo.app) para Windows: uma janela própria, com o
navegador embutido (Electron), que abre o SindiHoje publicado.

**Baixar:** [última versão](https://github.com/omenageado-git/SindiHoje-desktop/releases/latest)
(arquivo `SindiHoje-Setup-….exe`).

- As telas e funções chegam com o site, a cada versão, com o aviso para recarregar.
- O próprio app se atualiza sozinho por estes Releases: baixa em segundo plano e o
  SindiHoje mostra o aviso para reiniciar (ou instala ao fechar o app).
- O login com o Google é feito no navegador do computador e volta para o app.

Cada push na `main` gera e publica uma versão nova (`.github/workflows/publicar.yml`).
Para testar localmente: `npm ci` e `npm start`.
