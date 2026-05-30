# Contributing to Pragati

Thank you for considering a contribution. This project exists because someone cared enough to build the tool their team actually needed. If you are reading this, you probably have the same instinct.

---

## The spirit of contribution here

Amazon's **Have Backbone; Disagree and Commit** principle applies directly to open-source contributions:

- If you think something is wrong — an architecture decision, a UI choice, a bad copy string — raise it. Open an issue. Be specific about why.
- Once a direction is agreed on, commit to it fully and ship it cleanly.

We do not want contributions that hedge. A clear "I think this is wrong because X, and here is what I would do instead" is infinitely more useful than a timid suggestion.

---

## What we want contributions on

- **Pharma lifecycle templates** — if your team uses a lifecycle we have not modelled, add it to `src/lib/lifecycles.ts`. One object, one PR, immediate value.
- **Cultural layer** — greetings in other languages, seasonal festivals, quality quotes from voices outside the Western canon. The culture file (`src/lib/culture.ts`) is explicitly designed to grow.
- **ALP interpretations** — if you have a better QI lens on any of the 16 principles in `src/lib/alp.ts`, propose it. The principles are fixed; the interpretation for quality work is not.
- **UI improvements** — the app is desktop-first today. Mobile layout contributions are very welcome.
- **Bug fixes** — always welcome. Include a reproduction case in the PR.
- **AI model improvements** — the triage and risk models are in `src/lib/ai/`. They are deliberately simple; improvements that preserve explainability are welcome; improvements that trade explainability for accuracy are not.

## What we do not want

- Features that add complexity without removing more complexity elsewhere
- Changes that introduce external AI API calls (the on-premise constraint is a core principle)
- UI library additions — we use Tailwind and Lucide; keep it that way
- Changes to the role model without a very clear justification (the three roles — contributor, lead, admin — are deliberate)

---

## Development setup

```bash
# Fork and clone
git clone https://github.com/<your-fork>/MicroMacro.git
cd MicroMacro

# Install
npm install

# Run with in-memory MongoDB (auto-seeded, no setup needed)
npm run dev
```

The dev server auto-seeds demo data on first boot. Credentials print to the server console. No manual seed step.

## Branching

- `main` — production-ready at all times
- `feat/<thing>` — feature branches
- `fix/<thing>` — bug fix branches

Never push directly to `main`. Always open a PR.

## PR checklist

- [ ] `npm run build` passes with no TypeScript errors
- [ ] The change is scoped to what the PR title says it does
- [ ] If you added a new pharma lifecycle: a brief note in the PR body explaining which regulatory standard it maps to
- [ ] If you changed UI copy: explain *why* the new copy is better, not just that it is different
- [ ] No new npm dependencies unless absolutely unavoidable (and never in `dependencies` — only `devDependencies`)

## Commit message style

```
type(scope): short description (present tense, no period)

Why this change matters, not what it does — the diff shows what.
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

Examples:
```
feat(lifecycles): add EU CTD Module 3 validation template
fix(dashboard): prevent celebration from firing on status revert
docs(alp): sharpen QI lens for Earn Trust principle
```

---

## Code philosophy

We follow the same principles the AI features follow: **explainability over cleverness**. If a reviewer needs to read a function three times to understand it, rewrite it. Comments should explain *why*, never *what*.

The code has no comments explaining what a function does. The name and the types do that. Comments appear only when there is a non-obvious constraint, a regulatory justification, or a workaround for a known upstream bug.

---

## Questions

Open an issue with the `question` label. Or just read the code — it is not long.

---

*"If you cannot describe what you are doing as a process, you do not know what you are doing." — W. Edwards Deming*
