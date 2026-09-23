/** ESM resolve hook: `eval-quality` and its subpaths resolve to nothing. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'eval-quality' || specifier.startsWith('eval-quality/')) {
    const error = new Error(`Cannot find package '${specifier}'`);
    error.code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }
  return nextResolve(specifier, context);
}
