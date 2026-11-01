import fs from 'fs';
import path from 'path';

function getImports(dir) {
  const imports = new Set();
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const regex = /(?:import\s+(?:.*?\s+from\s+)?|require\()['"]([^'"./][^'"]*)['"]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          let pkg = match[1];
          if (pkg.startsWith('@')) {
            pkg = pkg.split('/').slice(0, 2).join('/');
          } else {
            pkg = pkg.split('/')[0];
          }
          imports.add(pkg);
        }
      }
    }
  }
  walk(dir);
  return Array.from(imports).sort();
}

console.log('Client imports:', getImports('client/src'));
console.log('Server imports:', getImports('server/src'));

