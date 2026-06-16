// Feedback -> Linear. A LINEAR_API_KEY fica SO no servidor (env); o widget chama
// o nosso backend, que chama o Linear. Visivel apenas no dominio de testes (LDM).

// Gate de dominio: so habilita em ldm.com.br (e subdominios). Em producao
// (bolao.topazio.eng.br) fica desligado.
export function feedbackHabilitado(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return h === 'ldm.com.br' || h.endsWith('.ldm.com.br');
}

// So funciona com as credenciais do Linear presentes (degradacao graciosa).
export function linearConfigurado(env = process.env) {
  return !!env.LINEAR_API_KEY && !!(env.LINEAR_TEAM_KEY || env.LINEAR_TEAM_ID);
}

// Rate-limit simples em memoria: MAX requisicoes por IP em JANELA ms.
const _hits = new Map();
const JANELA_MS = 60 * 1000;
const MAX_POR_JANELA = 5;
export function rateLimitOk(ip, agoraMs = Date.now(), store = _hits) {
  const recentes = (store.get(ip) || []).filter((t) => agoraMs - t < JANELA_MS);
  if (recentes.length >= MAX_POR_JANELA) {
    store.set(ip, recentes);
    return false;
  }
  recentes.push(agoraMs);
  store.set(ip, recentes);
  return true;
}

function primeiraLinha(s) {
  const linha = String(s || '').trim().split('\n')[0].trim();
  if (!linha) return 'Sem título';
  return linha.length > 80 ? linha.slice(0, 77) + '...' : linha;
}

function montaDescricao({ mensagem, nome, url, ua }) {
  return [
    String(mensagem || '').trim(),
    '',
    '---',
    `**Reportado por:** ${nome || 'anônimo'}`,
    `**Página:** ${url || '-'}`,
    `**Navegador:** ${ua || '-'}`,
  ].join('\n');
}

const LINEAR_URL = 'https://api.linear.app/graphql';
const _teamIdCache = new Map();

async function linearQuery(query, variables, env, fetchFn) {
  const resp = await fetchFn(LINEAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  return resp.json();
}

// Resolve o teamId: usa LINEAR_TEAM_ID direto, ou acha pelo LINEAR_TEAM_KEY (cacheado).
async function resolveTeamId(env, fetchFn) {
  if (env.LINEAR_TEAM_ID) return env.LINEAR_TEAM_ID;
  const key = env.LINEAR_TEAM_KEY;
  if (!key) throw new Error('Defina LINEAR_TEAM_KEY ou LINEAR_TEAM_ID');
  if (_teamIdCache.has(key)) return _teamIdCache.get(key);
  const json = await linearQuery('query { teams(first: 250) { nodes { id key } } }', {}, env, fetchFn);
  const nodes = json?.data?.teams?.nodes || [];
  const team = nodes.find((t) => String(t.key).toLowerCase() === key.toLowerCase());
  if (!team) throw new Error(`Time '${key}' nao encontrado no Linear`);
  _teamIdCache.set(key, team.id);
  return team.id;
}

// Cria a issue no Linear. Retorna { ok, url } ou lanca.
export async function criaIssueLinear(
  { tipo, mensagem, nome, url, ua, origem },
  { env = process.env, fetchFn = fetch } = {},
) {
  if (!env.LINEAR_API_KEY) throw new Error('LINEAR_API_KEY ausente');
  const teamId = await resolveTeamId(env, fetchFn);
  const title = `[${origem || 'Feedback'}][${tipo || 'Feedback'}] ${primeiraLinha(mensagem)}`;
  const description = montaDescricao({ mensagem, nome, url, ua });
  const mutation =
    'mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { url identifier } } }';
  const json = await linearQuery(mutation, { input: { teamId, title, description } }, env, fetchFn);
  if (json?.errors || !json?.data?.issueCreate?.success) {
    throw new Error('Linear issueCreate falhou: ' + JSON.stringify(json?.errors || json?.data));
  }
  return { ok: true, url: json.data.issueCreate.issue?.url };
}
