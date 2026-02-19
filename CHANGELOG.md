# Changelog

## [v2.0.0] - 2026-02-19

Major rewrite adding AI-powered card generation and interview prep workflows.

### Added
- **AI card generation**: provider-agnostic layer supporting OpenAI, Anthropic, and Google Gemini
- **Structured output parsing**: strict JSON schema with fallback extraction for robustness
- **Basic/Cloze note type awareness**: AI picks the right note type based on content heuristics, with user override
- **Field mapping engine**: validates AI output against live Anki model schemas via AnkiConnect
- **5 card templates** for interview prep: DSA Concept, System Design Concept, LeetCode SR, System Design Case Study, Behavioral Story (STAR)
- **Generate Cards from Notes** command: batch-generate from pasted notes with a review list before adding to Anki
- **Draft/Notes field**: multiline input for raw note capture, feeds into AI actions
- **QoL actions**: Swap Front/Back, Normalize Formatting, Copy/Paste clipboard, Add Card (keep template & tags)
- **Remembered defaults**: last-used deck and model persisted via LocalStorage
- **Default tags preference**: comma-separated tags auto-applied to every card
- **File attachment toggle**: preference to show/hide file pickers (default: hidden)
- **Field hints**: template-specific labels and placeholder text on form fields
- **Dry run mode**: preview AI output without writing to form fields
- **Unit and integration tests**: 73 tests covering parser, field mapper, prompts, templates, and utilities

### Changed
- Rewrote AddCardAction form with template selector, draft field, and AI action panel
- `transformSubmittedData` now accepts `includeFiles` parameter to skip media processing

## [v1.0.0] - 2024-08-06 (upstream)

Initial release by [anton-suprun](https://github.com/raycast/extensions/tree/main/extensions/anki).

- Deck listing with stats (new, learn, due)
- Card browser with Anki search syntax
- Add Card form with dynamic model fields
- File attachment support (image, audio, video)
- AnkiConnect integration with retry logic
- Study deck with answer grading
