/**
 * Parses Mermaid source with Mermaid's own parser, in Node.
 *
 * `mermaid.parse` runs the same grammar the browser runs before it draws, so a syntax error that would put Mermaid's
 * "Syntax error" graphic on a page is a thrown error here. Mermaid imports `dompurify` at load time and calls
 * `DOMPurify.addHook`, which exists only where a DOM does; parsing never sanitizes anything, so a resolve hook gives
 * `dompurify` an inert stand-in and no DOM library joins the dependency graph.
 */

'use strict';

// module.register is the way to add a resolve hook on every Node version the repository runs (.nvmrc is 24).
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const { register } = require('node:module');

const STAND_IN =
  'export default { addHook() {}, removeHook() {}, removeAllHooks() {}, setConfig() {}, sanitize: (value) => value, isSupported: false };';

const HOOKS = `
export async function resolve(specifier, context, next) {
  if (specifier === 'dompurify') return { url: 'data:text/javascript,${encodeURIComponent(STAND_IN)}', shortCircuit: true };
  return next(specifier, context);
}
`;

let loading = null;

/** Registers the hook once, then loads Mermaid, which is an ES module. */
function loadMermaid() {
  if (loading === null) {
    register(`data:text/javascript,${encodeURIComponent(HOOKS)}`);
    loading = import('mermaid').then((module) => module.default);
  }
  return loading;
}

/**
 * Parses one diagram. Resolves to the diagram type (`flowchart-v2`, `sequence`, and so on) and rejects with Mermaid's parse error.
 * @param {string} source - The text inside a mermaid fence.
 * @returns {Promise<string>} The diagram type Mermaid detected.
 */
async function parseMermaid(source) {
  const mermaid = await loadMermaid();
  const result = await mermaid.parse(source);
  return result.diagramType;
}

module.exports = { parseMermaid };
