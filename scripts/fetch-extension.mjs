import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = '@earendil-works/pi-coding-agent@1.2.0';
const FILE = 'package/examples/extensions/hello.ts';

const scratch = mkdtempSync(join(tmpdir(), 'pi-ext-'));
const tarball = execFileSync('npm', ['pack', PACKAGE, '--silent', '--pack-destination', scratch], {
  encoding: 'utf8',
}).trim();

execFileSync('tar', ['-xzf', join(scratch, tarball), '-C', scratch, FILE]);
mkdirSync('extensions', { recursive: true });
writeFileSync('extensions/hello.ts', readFileSync(join(scratch, FILE)));
console.log(`extensions/hello.ts from ${PACKAGE}`);
