import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const clientDir = path.resolve(rootDir, 'client');

console.log('====================================================');
console.log('  Smriti Saathi — Production Build Script');
console.log('====================================================');

try {
  console.log('\n[1/3] Ensuring client dependencies are installed...');
  execSync('npm install --include=dev --no-audit --no-fund', {
    cwd: clientDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  console.log('\n[2/3] Compiling React frontend with Vite...');
  execSync('npm run build', {
    cwd: clientDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const distPath = path.resolve(clientDir, 'dist');
  if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
    console.log('\n[3/3] Build verified successfully! Output at client/dist');
    console.log('====================================================\n');
  } else {
    throw new Error('client/dist/index.html was not generated.');
  }
} catch (error) {
  console.error('\n[Build Error] Production build failed:', error.message);
  process.exit(1);
}
