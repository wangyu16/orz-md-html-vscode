import * as esbuild from 'esbuild';
import * as fs from 'fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * esbuild bundles markdown-it-imsize's glob require with keys like './types/bmp.js',
 * but detector.js looks up './types/bmp' (no extension), causing a runtime error.
 * This plugin patches detector.js at build time to append '.js' to the dynamic path.
 * @type {import('esbuild').Plugin}
 */
const fixImsizeGlobPlugin = {
    name: 'fix-imsize-glob',
    setup(build) {
        const filter = /markdown-it-imsize[/\\]lib[/\\]imsize[/\\](detector|index)\.js$/;
        build.onLoad({ filter }, (args) => {
            let contents = fs.readFileSync(args.path, 'utf8');
            contents = contents.replace(
                /require\('\.\/types\/' \+ type\)/g,
                "require('./types/' + type + '.js')"
            );
            return { contents, loader: 'js' };
        });
    },
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

function copyThemes() {
    const srcDir = './node_modules/orz-markdown/themes';
    const destDir = './out/themes';
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    for (const file of fs.readdirSync(srcDir)) {
        if (file.endsWith('.css')) {
            fs.copyFileSync(`${srcDir}/${file}`, `${destDir}/${file}`);
        }
    }
}

async function main() {
    const ctx = await esbuild.context({
        entryPoints: [
            'src/extension.ts'
        ],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'out/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [
            fixImsizeGlobPlugin,
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
        ],
    });
    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
    copyThemes();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
