import { createRequire } from 'node:module';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, '.vercel/output');
const funcDir = join(output, 'functions/api/[...path].func');
const entryRel = 'scripts/vercel-api-entry.cjs';
const REQUIRE_RE = /require\((['"])([^'"]+)\1\)/g;
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
const COPY_EXT = new Set(['.js', '.cjs', '.mjs', '.json', '.node', '.wasm']);

async function collectJsRequires(entryAbs) {
  const queue = [entryAbs];
  const files = new Set();

  while (queue.length > 0) {
    const file = queue.pop();
    if (files.has(file)) continue;
    files.add(file);
    const ext = extname(file);
    if (ext !== '.js' && ext !== '.cjs' && ext !== '.mjs') continue;
    let src = '';
    try {
      src = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const localRequire = createRequire(file);
    const specs = [
      ...[...src.matchAll(REQUIRE_RE)].map((match) => match[2]),
      ...[...src.matchAll(IMPORT_RE)].map((match) => match[1]),
    ];
    for (const spec of specs) {
      if (!spec || spec.startsWith('node:')) continue;
      try {
        const resolved = localRequire.resolve(spec);
        if (resolved.startsWith(root)) queue.push(resolved);
      } catch {
        /* optional */
      }
    }
  }
  return files;
}

async function packageRootOf(file) {
  let dir = dirname(file);
  while (dir.startsWith(root) && dir !== root) {
    try {
      await stat(join(dir, 'package.json'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  return null;
}

async function copyFiltered(fromDir, toDir) {
  const entries = await readdir(fromDir, { recursive: true, withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = entry.parentPath ? join(entry.parentPath, entry.name) : join(fromDir, entry.name);
    const rel = relative(fromDir, abs);
    if (rel.split('/').includes('node_modules')) continue;
    if (rel.endsWith('.map') || rel.endsWith('.d.ts')) continue;
    if (!COPY_EXT.has(extname(abs))) continue;
    const dest = join(toDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(abs, dest, { dereference: true });
    count += 1;
  }
  return count;
}

const webDist = join(root, 'apps/web/dist');
const apiDist = join(root, 'apps/api/dist/create-app.js');
await stat(webDist);
await stat(apiDist);

await mkdir(join(output, 'static'), { recursive: true });
await mkdir(funcDir, { recursive: true });
await cp(webDist, join(output, 'static'), { recursive: true, dereference: true });
await cp(join(root, 'apps/api/dist'), join(funcDir, 'apps/api/dist'), { recursive: true, dereference: true });
await cp(join(root, entryRel), join(funcDir, entryRel), { dereference: true, recursive: true });
await cp(join(root, 'packages/contracts/dist'), join(funcDir, 'packages/contracts/dist'), {
  recursive: true,
  dereference: true,
});

const traced = await collectJsRequires(join(root, entryRel));
const packages = new Map();
for (const file of traced) {
  const pkgRoot = await packageRootOf(file);
  if (!pkgRoot || pkgRoot === root) continue;
  const manifest = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'));
  if (!manifest.name) continue;
  packages.set(manifest.name, pkgRoot);
}

let copied = 0;
for (const [name, pkgRoot] of packages) {
  copied += await copyFiltered(pkgRoot, join(funcDir, 'node_modules', name));
}

for (const [name] of packages) {
  if (name.startsWith('prisma-client-')) {
    await cp(join(funcDir, 'node_modules', name), join(funcDir, 'node_modules/.prisma/client'), {
      recursive: true,
      dereference: true,
    });
  }
}

const prismaCandidates = [
  join(root, 'node_modules/.prisma'),
  join(root, 'node_modules/@prisma/client/.prisma'),
];
for (const [name, pkgRoot] of packages) {
  if (name === '@prisma/client') {
    prismaCandidates.push(join(pkgRoot, '.prisma'));
    prismaCandidates.push(join(pkgRoot, '..', '.prisma'));
  }
}
for (const dir of prismaCandidates) {
  try {
    await stat(dir);
    copied += await copyFiltered(dir, join(funcDir, 'node_modules/.prisma'));
  } catch {
    /* skip */
  }
}

await writeFile(
  join(funcDir, 'index.js'),
  `'use strict';\nmodule.exports = require('./${entryRel}');\n`,
);
await writeFile(
  join(funcDir, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      // Same AWS region as Supabase (ap-northeast-2). Default iad1 made every DB round-trip slow.
      regions: ['icn1'],
      maxDuration: 30,
      memory: 1024,
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  join(output, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(v1|health|api)(/.*)?$', dest: '/api/[...path]' },
        { handle: 'filesystem' },
        { src: '^/(?!assets/).*$', dest: '/index.html' },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`Vercel output: ${packages.size} packages, ${copied} files hoisted to the function`);

const leftoverLinks = [];
const outputEntries = await readdir(output, { recursive: true, withFileTypes: true });
for (const entry of outputEntries) {
  if (!entry.isSymbolicLink()) continue;
  leftoverLinks.push(relative(output, join(entry.parentPath ?? output, entry.name)));
}
if (leftoverLinks.length > 0) {
  throw new Error(`Build output still has symlinks (Vercel rejects these): ${leftoverLinks.slice(0, 20).join(', ')}`);
}
