/** ESM resolve hook: `eval-quality` resolves to the wrapped engine, except from the wrapper itself. */
const WRAPPED = new URL('wrapped-engine.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'eval-quality' && context.parentURL !== WRAPPED) return { url: WRAPPED, shortCircuit: true };
  return nextResolve(specifier, context);
}
