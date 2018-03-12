This script synchronizes versions of dependencies from a source package. For each dependency
that exists in both the source and target, the version from the source is adopted. The source package does not
need to be installed; it is looked up from npm or git as required.

To install:

```
npm install -g sync-dependencies
```

Sync dependencies from the version of a package that is specified in package.json:

```
sync-dependencies --source terriajs
```

Sync dependencies from a package.json on disk:

```
sync-dependencies --source terriajs --from ./packages/terriajs/package.json
```
