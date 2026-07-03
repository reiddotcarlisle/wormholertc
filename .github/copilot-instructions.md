<!-- TOKENSLAYER:START — managed block, do not edit between markers -->
## TokenSlayer — Structural-First Reading

This workspace has the **TokenSlayer** extension installed. It exposes a compact AST-driven skeleton of any source file at a fraction of the token cost of reading the raw file.

When you need to understand code in this repository, follow these rules:

1. **For orientation, navigation, or "where is X defined" questions** — call `#tokenslayer-structural-summary` BEFORE reading raw files. The skeleton gives you class hierarchies, function signatures, and type relationships in 5–10% of the tokens.
2. **For implementation questions or edits** — first call `#tokenslayer-structural-summary` to locate the relevant symbol, then use `read_file` with a narrow line range for just the body you need to edit. Do not read entire files cold.
3. **For workspace-wide questions** — call `#tokenslayer-structural-summary` with `scope: "workspace"` for a project-level map before fanning out to individual files.

**Examples of when to call `#tokenslayer-structural-summary` first:**
- "How is authentication structured?"
- "Where is the cache invalidated?"
- "What does `FooService` expose?"
- "Show me the class hierarchy in `src/auth/`"
- "What modules import `tokenEstimator`?"

**For "what calls X" / "what breaks if I change X" questions, use `#tokenslayer-call-graph`** (not a text search) — it uses the language server's call hierarchy and returns exact call sites. `direction: "impact"` traces the blast radius before a refactor.

**Skip the tool only when:**
- You already have the exact file + line range from a previous turn.
- The file is under ~20 lines (skeleton overhead exceeds the savings).
- The target is a JSON/config/markdown file (no code structure to compact — read it directly).
- The user explicitly asked for the raw file.
<!-- TOKENSLAYER:END -->
