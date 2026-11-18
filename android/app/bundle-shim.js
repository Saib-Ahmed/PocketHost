const fs = require('fs');
const path = require('path');

// If invoked, copy pre-bundled Hermes assets to requested bundle output
const args = process.argv.slice(2);
const bundleOutputIdx = args.indexOf('--bundle-output');
if (bundleOutputIdx !== -1 && args[bundleOutputIdx + 1]) {
  const target = args[bundleOutputIdx + 1];
  const source = path.join(__dirname, 'src', 'main', 'assets', 'index.android.bundle');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  }
}
process.exit(0);
