// Startet den SonarQube-Scanner aus C:\Zimmermann (Windows) bzw. /Zimmermann.
// Aufruf:   pnpm run sonar
// Der Scanner liest sonar-project.properties und den Token aus SONAR_TOKEN.

import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { resolve } from 'node:path';

let baseExecPath;
let baseScript = 'sonar-scanner';

// https://nodejs.org/api/os.html#osplatform
const betriebssystem = platform(); // win32, linux, ...
if (betriebssystem === 'win32') {
    baseExecPath = resolve('C:/', 'Zimmermann');
    baseScript += '.bat';
} else {
    baseExecPath = resolve('/', 'Zimmermann');
}

const script = resolve(baseExecPath, 'sonar-scanner', 'bin', baseScript);
console.log(`script=${script}`);
console.log('');

// https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows
// oxlint-disable-next-line promise/prefer-await-to-callbacks no-unused-vars
exec(script, (err, stdout, _) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(stdout);
});
