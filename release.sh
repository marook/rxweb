#!/bin/bash
set -e
version="$1"
if [[ -z "${version}" ]]
then
    echo "Usage: $0 VERSION" >&2
    exit 1
fi
package_version=`jq -r .version package.json `
if [[ "${version}" != "${package_version}" ]]
then
    echo "package.json contains version ${package_version}" >&2
    exit 1
fi
npm run build
git tag "${version}"
npm publish
git push origin "${version}"
