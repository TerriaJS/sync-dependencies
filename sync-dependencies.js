#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const npa = require('npm-package-arg');
const path = require('path');
const process = require('process');
const got = require('got');
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
    console.log('Syncing from ' + argv.from);
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
        const fullPath = path.join(sourcePackageVersion, 'package.json');
        console.log('Syncing from ' + fullPath);
        sourcePackageJsonPromise = Promise.resolve(JSON.parse(fs.readFileSync(fullPath, 'utf8')));
    } else if (resolvedPackage.type === 'tag' || resolvedPackage.type === 'version' || resolvedPackage.type === 'range') {
        const npmPackage = argv.source + '@' + sourcePackageVersion;
        console.log('Sync from npm package ' + npmPackage);
        const npmViewResult = childProcess.spawnSync('npm', [
            'view', '--json',
            npmPackage
        ], { shell: true });
        sourcePackageJsonPromise = Promise.resolve(JSON.parse(npmViewResult.stdout.toString()));
    } else if (resolvedPackage.type === 'git' && resolvedPackage.hosted) {
        const packageJsonUrl = resolvedPackage.hosted.file('package.json', {noCommittish: false});
        console.log('Syncing from ' + packageJsonUrl);
        sourcePackageJsonPromise = new Promise((resolve, reject) => {
            got(packageJsonUrl)
            .then(response => {
                resolve(JSON.parse(response.body));
            })
            .catch(error => {
                reject(error);
            })
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

function syncDependencies(dependencies, targetJson) {
    for (var dependency in dependencies) {
        if (dependencies.hasOwnProperty(dependency)) {
            var version = targetJson.dependencies[dependency] || targetJson.devDependencies[dependency];
            if (version && version !== dependencies[dependency]) {
                console.log('Updating ' + dependency + ' from ' + dependencies[dependency] + ' to ' + version + '.');
                dependencies[dependency] = version;
            }
        }
    }
}
