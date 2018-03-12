#!/usr/bin/env node
const childProcess = require('child_process');
const fs = require('fs');
const npa = require('npm-package-arg');
const process = require('process');
const request = require('request');
const yargs = require('yargs');

const argv = yargs.options({
    target: {
        description: 'The path to the package.json to update.',
        type: 'string',
        default: './package.json'
    },
    source: {
        description: 'The name of the package from which to copy dependencies.',
        type: 'string',
        demand: true
    },
    from: {
        description: 'The local file system path in which to find the package. If not specified, the package will be resolved from package.json.',
        type: 'string',
    },
    dev: {
        description: 'True if devDependencies should be sync\'d.',
        type: 'boolean',
        default: true
    },
    prod: {
        description: 'True if dependencies should be sync\'d.',
        type: 'boolean',
        default: true
    },
    preview: {
        description: 'Do not modify package.json; instead, write it to stdout.',
        type: 'boolean',
        default: false
    }
}).help().argv;

const targetPackageJson = JSON.parse(fs.readFileSync(argv.target, 'utf8'));

let sourcePackageJsonPromise;
if (argv.from) {
    sourcePackageJsonPromise = Promise.resolve(JSON.parse(fs.readFileSync(argv.from, 'utf8')));
} else {
    const dependencyVersion = (targetPackageJson.dependencies || {})[argv.source];
    const devDependencyVersion = (targetPackageJson.devDependencies || {})[argv.source];
    const sourcePackageVersion = dependencyVersion || devDependencyVersion;
    if (!sourcePackageVersion) {
        console.error(`Package ${argv.source} does not exist in dependencies or devDependencies.`);
        process.exit(1);
    }

    const resolvedPackage = npa.resolve(argv.source, sourcePackageVersion);
    if (resolvedPackage.type === 'directory') {
        sourcePackageJsonPromise = Promise.resolve(JSON.parse(fs.readFileSync(path.join(argv.source, sourcePackageVersion))));
    } else if (resolvedPackage.type === 'tag' || resolvedPackage.type === 'version' || resolvedPackage.type === 'range') {
        const npmViewResult = childProcess.spawnSync('npm', [
            'view', '--json',
            argv.source + '@' + sourcePackageVersion
        ], { shell: true });
        sourcePackageJsonPromise = Promise.resolve(JSON.parse(npmViewResult.stdout.toString()));
    } else if (resolvedPackage.type === 'git' && resolvedPackage.hosted) {
        const packageJsonUrl = resolvedPackage.hosted.file('package.json');
        sourcePackageJsonPromise = new Promise((resolve, reject) => {
            request(packageJsonUrl, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(JSON.parse(body));
                }
            });
        });
    } else {
        console.error(`Sorry, I don't know how to retrieve package.json for a package of type ${resolvedPackage.type} (${sourcePackageVersion}).`);
        process.exit(1);
    }
}

sourcePackageJsonPromise.then(sourcePackageJson => {
    if (argv.prod) {
        syncDependencies(targetPackageJson.dependencies, sourcePackageJson);
    }

    if (argv.dev) {
        syncDependencies(targetPackageJson.devDependencies, sourcePackageJson);
    }

    const json = JSON.stringify(targetPackageJson, undefined, '  ');
    if (argv.preview) {
        console.log(json);
    } else {
        fs.writeFileSync(argv.target, json, 'utf8');
    }
});

function syncDependencies(dependencies, targetJson, justWarn) {
    for (var dependency in dependencies) {
        if (dependencies.hasOwnProperty(dependency)) {
            var version = targetJson.dependencies[dependency] || targetJson.devDependencies[dependency];
            if (version && version !== dependencies[dependency]) {
                if (justWarn) {
                    console.warn('Warning: There is a version mismatch for ' + dependency + '. This build may fail or hang. You should run `gulp sync-terriajs-dependencies`, then re-run `npm install`, then run gulp again.');
                } else {
                    console.log('Updating ' + dependency + ' from ' + dependencies[dependency] + ' to ' + version + '.');
                    dependencies[dependency] = version;
                }
            }
        }
    }
}
