// Prints a terminal QR code for Expo Go (used by scripts/demo.ps1). It reuses the QR printer that
// ships inside the Expo CLI, so no extra dependency. Usage: node scripts/demo-qr.cjs exp://host:port
const path = require('node:path');

const url = process.argv[2];
if (!url) process.exit(0);
try {
  const qr = path.join(
    __dirname,
    '..',
    'node_modules',
    '@expo',
    'cli',
    'build',
    'src',
    'utils',
    'qr.js',
  );
  require(qr).printQRCode(url).print();
} catch {
  process.stdout.write('(No QR code here: use the one in the Expo window, or type the URL.)\n');
}
