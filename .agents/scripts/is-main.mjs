// Determina si un mòdul s'executa directament (CLI) i no s'importa.
// Compara realpaths: resol enllaços simbòlics i rutes relatives. Retorna false
// si process.argv[1] falta o no es pot llegir.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(metaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
