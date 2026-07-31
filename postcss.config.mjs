import postcssImport from 'postcss-import';
import postcssNesting from 'postcss-nesting';
import tailwindcss from '@tailwindcss/postcss';

export default {
    plugins: [
        postcssImport(),          // to combine multiple css files
        postcssNesting(),         // W3C CSS Nesting spec plugin
        tailwindcss(),            // Tailwind CSS
    ]
};
