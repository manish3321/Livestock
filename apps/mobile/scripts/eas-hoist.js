// EAS Build only: Expo SDK 52's Android autolinking needs a flat (hoisted)
// node_modules. Web uses React 19 and mobile React 18, so the hoisted layout
// cannot be committed for the whole workspace; it is applied on the builder,
// which only builds the mobile app.
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../../../pnpm-workspace.yaml');
const text = fs.readFileSync(file, 'utf8');
if (!/^nodeLinker:/m.test(text)) {
  fs.writeFileSync(file, `${text.trimEnd()}\n\nnodeLinker: hoisted\n`);
  console.log('eas-hoist: set nodeLinker: hoisted');
}
