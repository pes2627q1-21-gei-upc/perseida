// Determina si un mòdul s'executa directament (CLI) i no s'importa.
// Compara realpaths, de manera que funciona amb enllaços simbòlics i
// amb rutes que difereixen per majúscules/minúscules.
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
