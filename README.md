# 🏆 Bolão Pedreira & Amigos 2026

Site do bolão da Copa do Mundo de 2026 do grupo Pedreira & Amigos. Lista o ranking de todos os
jogadores, tem uma área de admin para lançar os resultados reais e calcula a
pontuação automaticamente conforme o regulamento.

- **Ranking geral** com pódio e tabela completa
- **Ranking da 1ª fase** (para o prêmio do líder da fase de grupos)
- **Detalhe por jogador** com a pontuação jogo a jogo
- **Jogo a jogo** com o palpite de todos e os pontos de cada um
- **Área admin** (protegida por senha) para lançar placares e palpites especiais

Os palpites de cada participante já vêm das planilhas e são **somente leitura**.
A única coisa que o admin edita é o resultado real dos jogos.

## Stack

- Node.js (Express) + EJS
- SQLite (via `better-sqlite3`) — banco em arquivo, zero serviços externos
- Motor de pontuação em funções puras, coberto por testes (`node --test`)

## Como rodar localmente

```bash
npm install
node scripts/seed.js          # popula o banco a partir de data/seed.json
npm start                     # http://localhost:3000
```

Na primeira vez, defina a senha do admin:

```bash
# Linux/macOS
BOLAO_ADMIN_SENHA="suaSenhaForte" node scripts/seed.js

# Windows PowerShell
$env:BOLAO_ADMIN_SENHA="suaSenhaForte"; node scripts/seed.js
```

Se não definir, o seed gera uma senha aleatória e a imprime no console.

### Testes

```bash
npm test
```

## Variáveis de ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta do servidor | `3000` |
| `NOME_BOLAO` | Nome exibido no site | `Bolão Pedreira & Amigos 2026` |
| `BOLAO_ADMIN_SENHA` | Senha do admin (usada só no seed inicial) | gera aleatória |
| `BOLAO_SESSION_SECRET` | Segredo do cookie de sessão | aleatório por boot |
| `BOLAO_DB` | Caminho do arquivo SQLite | `data/bolao.db` |
| `BOLAO_ODDS_API_TOKEN` | Token do the-odds-api.com p/ odds de mercado (opcional) | desligado |

> Em produção, **defina `BOLAO_SESSION_SECRET`** com um valor fixo e secreto,
> senão todos os logins de admin caem a cada reinício do servidor.

## Extração dos palpites das planilhas

Os palpites ficam nas planilhas Excel (em `planilhas/`, que é **gitignored** —
não vai para o repo porque contém dados pessoais). Para gerar o seed:

```bash
python scripts/extract.py   # planilhas/*.xlsx -> data/seed.json + data/contatos.json
node scripts/seed.js        # data/seed.json   -> SQLite
```

`data/seed.json` (palpites, sem PII) é **commitado** e vai para a VPS junto com o código.

`data/contatos.json` (e-mails, WhatsApp) é **gitignored** — contém PII. Para levá-lo
ao servidor existem duas opções:

1. **scp manual** após o deploy: copiar `data/contatos.json` para dentro do volume
   de dados do container e rodar `node scripts/seed.js` novamente.
2. **Preencher pela interface**: Admin › Contatos — o admin cadastra e-mail/telefone
   de cada participante diretamente no site.

O app funciona normalmente sem `contatos.json` — cria os jogadores sem e-mail/telefone
e o admin pode preencher depois.

### Notas de extração

- **Gols** vêm da aba `PONTUAÇÃO` (numerada 1–104). Exceção: o **jogo 103**
  (disputa de 3º lugar) tem essa aba desatualizada no template, então os gols
  desse jogo são corrigidos pela aba `PALPITES` (a fonte que o participante
  preenche).
- **Pênaltis** vêm da aba `PALPITES` e são casados por **confronto** (os times),
  não por número — as duas abas usam numerações diferentes para o mata-mata.
  Pênaltis **não contam pontos** (regulamento); são só registro/exibição.

## Deploy na VPS (Linux)

> Configure o `Host(...)` no `deploy/docker-compose.yml` para o seu domínio.

Roda como container Docker atrás do **Traefik** (Docker Swarm + Portainer), com
TLS/Let's Encrypt e redirect feitos pelo Traefik. Arquivos prontos:
[`Dockerfile`](Dockerfile) e [`deploy/docker-compose.yml`](deploy/docker-compose.yml).
Passo a passo completo em [`deploy/INSTALL.md`](deploy/INSTALL.md).

Build local rápido (para testar a imagem):

```bash
docker build -t bolao-pedreira:latest .
docker run --rm -p 3000:3000 -e BOLAO_ADMIN_SENHA=teste \
  -v "$(pwd)/data:/data" bolao-pedreira:latest
```

Para atualizar o serviço na VPS após um `git pull`:

```bash
./deploy/update.sh
```

## Regulamento (pontuação)

| Acerto | Pontos |
|---|---|
| Placar exato | 35 |
| Vencedor + nº de gols de uma equipe | 20 |
| Vencedor/empate sem acertar gols | 10 |
| Só o nº de gols de uma equipe | 5 |
| Confronto / seleção certa — 1/16 | 30 / 15 |
| Confronto / seleção certa — Oitavas | 50 / 25 |
| Confronto / seleção certa — Quartas | 75 / 35 |
| Confronto / seleção certa — Semis | 100 / 50 |
| Artilheiro da Copa | 100 |
| Acertar os 2 finalistas | 200 |
| Acertar o campeão | 500 |
