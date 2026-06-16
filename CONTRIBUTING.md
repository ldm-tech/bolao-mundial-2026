# Contribuindo com o Bolão Mundial 2026

Obrigado pelo interesse em contribuir! Este guia explica como configurar o ambiente, rodar os testes e abrir um pull request.

---

## Configurando o ambiente local

**Pré-requisito:** Node.js 20 ou superior (recomendado: 22).

```bash
# 1. Clone o repositório
git clone https://github.com/ldm-tech/bolao-mundial-2026.git
cd bolao-mundial-2026

# 2. Instale as dependências
npm install

# 3. Popule o banco de dados de exemplo
npm run seed

# 4. Inicie o servidor
npm start
```

Acesse [http://localhost:3000](http://localhost:3000).

### Senha do admin

O `npm run seed` define a senha do admin a partir da variável de ambiente `BOLAO_ADMIN_SENHA`. Se ela não estiver definida, uma senha aleatória é gerada e impressa no console. Anote-a para acessar `/admin`.

```bash
# Linux/macOS
BOLAO_ADMIN_SENHA="dev123" npm run seed

# Windows PowerShell
$env:BOLAO_ADMIN_SENHA="dev123"; npm run seed
```

### Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores conforme necessário. Para desenvolvimento local, os valores padrão do `.env.example` já são suficientes.

---

## Rodando os testes

```bash
npm test
```

Executa `node --test` sobre todos os arquivos em `test/`. A suíte deve passar com **todos os testes verdes** antes de qualquer pull request ser aceito.

Se você adicionou código novo, escreva testes para ele. Funções puras (como as de `src/scoring.js`) são as mais fáceis de testar — crie um arquivo `test/nome-do-modulo.test.js` seguindo os exemplos existentes.

---

## Padrão de commits

Use o formato **Conventional Commits**:

```
tipo: descrição curta em minúsculas
```

Tipos comuns:

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração sem mudança de comportamento |
| `test` | Adição ou correção de testes |
| `docs` | Alterações em documentação |
| `chore` | Tarefas de manutenção (deps, build, CI) |

Exemplos:

```
feat: exibir estatísticas de defesas no detalhe ao vivo
fix: corrigir orientação de mando no summary da ESPN
test: cobrir caso de palpite com gols nulos no scoring
docs: adicionar exemplo de premiacao.json no README
```

- Uma linha de assunto de até 72 caracteres.
- Corpo opcional separado por linha em branco, explicando o "por quê".
- Evite commits do tipo "wip", "ajustes" ou "fix fix fix" — agrupe e reescreva antes de abrir o PR.

---

## Abrindo issues

Antes de abrir uma issue:

1. Verifique se já existe uma issue semelhante aberta ou fechada.
2. Se for um bug, descreva: o que você esperava, o que aconteceu, e os passos para reproduzir.
3. Se for uma sugestão de funcionalidade, explique o caso de uso e por que ela seria útil.

---

## Abrindo pull requests

1. Crie um fork do repositório e trabalhe em uma branch descritiva:
   ```bash
   git checkout -b feat/nome-da-funcionalidade
   ```
2. Faça suas alterações e escreva (ou atualize) os testes relevantes.
3. Confirme que a suíte está toda verde:
   ```bash
   npm test
   ```
4. Abra o PR contra a branch `main` com:
   - Título seguindo o padrão de commits acima.
   - Descrição explicando o que foi feito e por quê.
   - Referência à issue relacionada, se houver (ex.: `Closes #42`).

PRs com testes falhando não serão mesclados.

---

## O que não incluir

- **Dados pessoais** (e-mails, telefones, nomes reais de participantes). O repositório deve conter apenas dados fictícios de exemplo.
- **Arquivos `.env`** com segredos reais.
- **Banco de dados** (`*.db`, `*.db-shm`, `*.db-wal`) — o `.gitignore` já os exclui.

---

## Dúvidas

Abra uma issue com a etiqueta `question` ou inicie uma discussão na aba **Discussions** do repositório.
