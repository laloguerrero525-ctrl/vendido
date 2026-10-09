// Genera códigos para desbloquear los mapas de paga (Cosmos + Europa 1700).
// Uso:  node scripts/generar-codigos.mjs 50
//
// • Los códigos en texto se guardan en codigos-privados.txt (NO se sube a GitHub; está en .gitignore).
// • En public/shared/codigos.js solo se guardan sus huellas, que es lo que el juego revisa.
// • Después de generar códigos nuevos, sube los cambios a GitHub para que funcionen en línea.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sha256, normalizeUnlockCode } from '../public/shared/premium.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HASHES_FILE = path.join(ROOT, 'public/shared/codigos.js');
const PRIVATE_FILE = path.join(ROOT, 'codigos-privados.txt');
const n = Math.max(1, Math.min(1000, Number(process.argv[2]) || 20));
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const part = () => Array.from(crypto.randomBytes(4), (b) => ABC[b % ABC.length]).join('');
const codes = Array.from({ length: n }, () => `VEND-${part()}-${part()}`);

const current = fs.existsSync(HASHES_FILE) ? [...fs.readFileSync(HASHES_FILE, 'utf8').matchAll(/'([0-9a-f]{64})'/g)].map((m) => m[1]) : [];
const added = codes.map((c) => sha256('vendido:' + normalizeUnlockCode(c)));
const all = [...new Set([...current, ...added])];
fs.writeFileSync(HASHES_FILE, `// Huellas (SHA-256) de los códigos válidos. Generado por scripts/generar-codigos.mjs — no edites a mano.\nexport const CODE_HASHES = [\n${all.map((h) => `  '${h}',`).join('\n')}\n];\n`);

const stamp = new Date().toLocaleString('es-MX');
fs.appendFileSync(PRIVATE_FILE, `\n# ${n} códigos generados el ${stamp} — dale uno a cada persona que pague\n${codes.join('\n')}\n`);

console.log(`\n✅ ${n} códigos nuevos (total válidos: ${all.length}).`);
console.log(`   Guardados en: codigos-privados.txt  (no lo compartas ni lo subas)\n`);
console.log(codes.slice(0, 5).join('\n') + (n > 5 ? '\n…' : ''));
