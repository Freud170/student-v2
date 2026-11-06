// Konfiguration fuer den Formatierer Oxfmt, wie im Hono-Beispielprojekt.
// https://oxc.rs/docs/guide/usage/formatter/config.html
// https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html

import { defineConfig } from 'oxfmt';

// oxlint-disable-next-line import/no-default-export
export default defineConfig({
    singleQuote: true,
    trailingComma: 'all',
    overrides: [
        {
            files: ['*.toml', '*.yml', '*.yaml'],
            options: {
                singleQuote: false,
            },
        },
    ],
    ignorePatterns: ['*.md', 'src/config/tls/*.crt', 'src/config/tls/*.pem'],

    // von .editorconfig übernommen:
    // end_of_line -> endOfLine
    // indent_style -> useTabs
    // indent_size -> tabWidth
    // max_line_length -> printWidth
    // insert_final_newline -> insertFinalNewline
});
