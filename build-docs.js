'use strict';

const { resolve } = require('path');
const { writeFileSync } = require('fs');
const { execSync } = require('child_process');

const options = [
	'--out docs',
	'--mode file',
	'--excludeExternals',
	'--excludePrivate',
	// '--excludeProtected',
];

const typedoc = resolve(__dirname, './node_modules/.bin/typedoc');
const typedocCommand = `${typedoc} ${options.join(' ')} ./src`;

const generateDocs = () => execSync(typedocCommand, { stdio: 'inherit' });
const createDocsConfig = () => {
	console.log('Writing github docs _config.yml...');

	const contents = `
include:
  - "_*_.html"
  - "_*_.*.html"`;

	const configFile = resolve(__dirname, './docs/_config.yml');

	writeFileSync(configFile, contents, 'utf8');
};

generateDocs();
createDocsConfig();
console.log('Done');