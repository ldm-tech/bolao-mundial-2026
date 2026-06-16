import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Gera "salt:hash" em hex para guardar no config.
export function hashSenha(senha) {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

// Compara senha com o registro "salt:hash" de forma resistente a timing.
export function verificaSenha(senha, registro) {
  if (!registro || !registro.includes(':')) return false;
  const [saltHex, hashHex] = registro.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = scryptSync(senha, salt, esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}
