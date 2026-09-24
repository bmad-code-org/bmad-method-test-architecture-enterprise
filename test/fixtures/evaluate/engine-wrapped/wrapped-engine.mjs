/** The real eval-quality with `runPreflight` replaced by one that fails as `TEA_EVALUATE_WRAP_RUNPREFLIGHT` asks. */
import { runPreflight as realRunPreflight } from 'eval-quality';

export * from 'eval-quality';

export async function runPreflight(options) {
  const mode = process.env.TEA_EVALUATE_WRAP_RUNPREFLIGHT;
  if (mode === 'structural-before-legs') {
    const error = new Error('planted: the plan is structurally unsound');
    error.name = 'StructuralFailure';
    throw error;
  }
  if (mode === 'error-after-one-leg') {
    let calls = 0;
    const port = {
      probe: async (request, signal) => {
        calls += 1;
        if (calls > 1) throw new Error('planted: the legs stopped after one');
        return options.port.probe(request, signal);
      },
    };
    return realRunPreflight({ ...options, port });
  }
  return realRunPreflight(options);
}
