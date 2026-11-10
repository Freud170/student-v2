// Startet OWASP Dependency Check aus C:\Zimmermann (Windows) bzw. /Zimmermann.
// Aufruf:   pnpm run dependency-check
// Der NVD-API-Key kommt aus der Umgebungsvariable NVD_API_KEY (nicht ins Repo!).
// Ergebnis: dependency-check-report.html im Projektverzeichnis

import { exec } from 'node:child_process';
import { platform } from 'node:os';
import process from 'node:process';
import { resolve } from 'node:path';

const nvdApiKey = process.env['NVD_API_KEY'];
if (nvdApiKey === undefined || nvdApiKey === '') {
    console.error('Die Umgebungsvariable NVD_API_KEY ist nicht gesetzt.');
    process.exit(1);
}
const project = 'student-v2';

let rootDir;
let baseScript = 'dependency-check';
let pnpmExecutable = 'pnpm';

// https://nodejs.org/api/os.html#osplatform
const betriebssystem = platform(); // win32, linux, ...
if (betriebssystem === 'win32') {
    rootDir = resolve('C:/');
    baseScript += '.bat';
    // Dependency Check findet pnpm unter Windows nicht selbst (pnpm.cmd in PNPM_HOME\bin)
    pnpmExecutable = resolve(process.env['PNPM_HOME'] ?? '', 'bin', 'pnpm.cmd');
} else {
    rootDir = resolve('/');
}
const script = resolve(rootDir, 'Zimmermann', 'dependency-check', 'bin', baseScript);
console.log(`script=${script}`);

const dataPath = resolve(rootDir, 'Zimmermann', 'dependency-check-data');
const suppressionPath = resolve('scripts', 'dependency-check-suppression.xml');
const reportPath = '.';

const options = `--nvdApiKey ${nvdApiKey} --project ${project} `.concat(
    `--scan . --suppression ${suppressionPath} `,
    `--out ${reportPath} --data ${dataPath} --pnpm ${pnpmExecutable} `,
    // https://jeremylong.github.io/DependencyCheck/dependency-check-cli/arguments.html
    // dependency-check.bat --advancedHelp
    '--nodeAuditSkipDevDependencies ',
    '--nodePackageSkipDevDependencies ',
    '--disableArchive ',
    '--disableAssembly ',
    '--disableAutoconf ',
    '--disableBundleAudit ',
    '--disableCarthageAnalyzer ',
    '--disableCentral ',
    '--disableCentralCache ',
    '--disableCmake ',
    '--disableCocoapodsAnalyzer ',
    '--disableComposer ',
    '--disableCpan ',
    '--disableDart ',
    '--disableGolangDep ',
    '--disableGolangMod ',
    '--disableJar ',
    '--disableMavenInstall ',
    '--disableMSBuild ',
    '--disableNugetconf ',
    '--disableNuspec ',
    '--disableOssIndex ',
    '--disablePip ',
    '--disablePipfile ',
    '--disablePoetry ',
    '--disablePyDist ',
    '--disablePyPkg ',
    '--disableRubygems ',
    '--disableSwiftPackageManagerAnalyzer ',
    '--disableSwiftPackageResolvedAnalyzer ',
    '--disableYarnAudit',
);
// Den Key nicht ausgeben
console.log(`options=${options.replace(nvdApiKey, '***')}`);
console.log('');

// https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows
// Bei einem Fehler nur Exit-Code und stderr ausgeben: err selbst enthaelt den
// kompletten Aufruf und damit den Key.
// oxlint-disable-next-line promise/prefer-await-to-callbacks
exec(`${script} ${options}`, (err, stdout, stderr) => {
    console.log(stdout);
    if (err) {
        console.error(`Dependency Check ist mit Exit-Code ${err.code} beendet worden.`);
        console.error(stderr.replaceAll(nvdApiKey, '***'));
    }
});
