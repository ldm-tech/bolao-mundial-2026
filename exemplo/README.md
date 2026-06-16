# Importação de Palpites por Planilha

Esta pasta contém o modelo de planilha para importação em lote de palpites.

## Arquivo modelo

`palpites-modelo.xlsx` — planilha com a aba "Palpites" e uma linha de exemplo.

Para gerar/regenerar o modelo:
```bash
node scripts/gera-modelo.js
```

---

## Formato da planilha

A planilha deve ter **uma aba chamada "Palpites"** com as colunas abaixo na primeira linha (cabeçalho):

| Coluna        | Obrigatória | Tipo    | Descrição                                                       |
|---------------|-------------|---------|----------------------------------------------------------------|
| `participante` | Sim         | Texto   | Nome do participante (exato; criado automaticamente se novo)   |
| `jogo`         | Sim         | Número  | Número do jogo (coluna `numero` na tabela de jogos)            |
| `gols_casa`    | Não         | Inteiro | Palpite de gols do time da casa                                |
| `gols_fora`    | Não         | Inteiro | Palpite de gols do time de fora                                |
| `time_casa`    | Não*        | Texto   | Sigla do time da casa *(apenas mata-mata)*                     |
| `time_fora`    | Não*        | Texto   | Sigla do time de fora *(apenas mata-mata)*                     |
| `pen_casa`     | Não*        | Inteiro | Gols na disputa de pênaltis — casa *(apenas se houve pênaltis)* |
| `pen_fora`     | Não*        | Inteiro | Gols na disputa de pênaltis — fora *(apenas se houve pênaltis)* |

> **\* Mata-mata:** `time_casa`, `time_fora`, `pen_casa` e `pen_fora` só são gravados
> em jogos com `fase ≠ 'grupos'`. Para jogos de grupos deixe essas células em branco.

---

## Regras de preenchimento

1. **Uma linha = um palpite** (participante × jogo).
2. Linhas completamente vazias são ignoradas.
3. Células em branco viram `null` no banco — **não viram 0**.
4. O nome do participante é sensível a maiúsculas/minúsculas e espaços.
   - Se o participante ainda não existir no bolão, ele é criado automaticamente.
   - Se já existir, o palpite é **sobrescrito** (upsert).
5. Vários participantes e vários jogos podem constar na mesma planilha; a ordem das linhas não importa.

---

## Como rodar a importação

```bash
# Usando o arquivo padrão (exemplo/palpites-modelo.xlsx):
node scripts/import-planilha.js

# Ou especificando outro arquivo:
node scripts/import-planilha.js caminho/da/sua/planilha.xlsx
```

A saída mostra quantos palpites foram importados e eventuais erros por linha.

---

## Exemplo de planilha preenchida

| participante  | jogo | gols_casa | gols_fora | time_casa | time_fora | pen_casa | pen_fora |
|---------------|------|-----------|-----------|-----------|-----------|----------|----------|
| Ana Silva     | 1    | 2         | 1         |           |           |          |          |
| Ana Silva     | 2    | 0         | 0         |           |           |          |          |
| Bruno Costa   | 1    | 3         | 0         |           |           |          |          |
| Ana Silva     | 65   | 1         | 1         | BRA       | ARG       | 4        | 2        |

> Jogo 65 é mata-mata: `time_casa`, `time_fora` e pênaltis são preenchidos.

---

## Observações importantes

- A importação é **totalmente opcional**; o admin pode lançar palpites manualmente pela interface.
- O arquivo `.xlsx` não contém dados pessoais — é apenas um template em branco.
- Mantenha o arquivo modelo no controle de versão para facilitar a distribuição.
