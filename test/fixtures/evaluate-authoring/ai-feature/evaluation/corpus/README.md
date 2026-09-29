# Corpus partition

`development/` contains the inputs available during gap repair. `held-out/` and probes P-011 through P-013 are sealed authoring material. The development gap stage may see their IDs, classes, and scored outcomes only through `gap-view.json`. Do not read their input or manifestation witnesses during that stage. Run held-out after the development evidence review.

`D08-invalid-json.txt` records the required raw malformed body. The installed HTTP port currently serializes only JSON or sends an absent body. The maintainer must add a schema-supported raw-body route or a separate authorized malformed-input operation before claiming that invalid JSON is covered by live eval-quality evidence. The direct endpoint spot check may corroborate this case but cannot substitute for a sealed trial.
