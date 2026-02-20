/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** anki-connect port - Port that anki-connect uses. (Default: 8765) */
  "port"?: string,
  /** undefined - If selected, duplicate cards can be created */
  "allow_dup_cards"?: boolean,
  /** Duplicate Scope - Can be used to specify the scope for which duplicates are checked */
  "dup_scope": "deck" | "collection",
  /** Default Deck - Deck name to pre-select when adding cards (overrides remembered value) */
  "default_deck"?: string,
  /** Default Note Type - Note type (model) to pre-select when adding cards (overrides remembered value) */
  "default_model"?: string,
  /** Default Tags - Comma-separated tags applied automatically to new cards */
  "default_tags"?: string,
  /** undefined - Show AI-powered actions for card generation and improvement */
  "ai_enabled": boolean,
  /** AI Provider - Which AI provider to use for card generation */
  "ai_provider": "openai" | "anthropic" | "gemini",
  /** AI API Key - API key for the selected AI provider (stored securely) */
  "ai_api_key"?: string,
  /** AI Model - Model name (e.g. gpt-4o-mini, claude-sonnet-4-20250514, gemini-2.0-flash). Leave blank for provider default. */
  "ai_model"?: string,
  /** AI Max Output Tokens - Maximum tokens in AI response */
  "ai_max_output_tokens": string,
  /** AI Temperature - Creativity level (0.0 = deterministic, 1.0 = creative) */
  "ai_temperature": string,
  /** AI Note Type Mode - How AI chooses between Basic and Cloze note types */
  "ai_note_type_mode": "auto" | "prefer_basic" | "prefer_cloze" | "basic_only" | "cloze_only",
  /** Max Clozes per Card - Maximum cloze deletions per card to keep cards atomic */
  "ai_max_clozes_per_card": string,
  /** undefined - Preview AI output without writing to form fields */
  "ai_dry_run": boolean,
  /** Basic Model Name - Name of your Anki Basic note type */
  "basic_model_name": string,
  /** Cloze Model Name - Name of your Anki Cloze note type */
  "cloze_model_name": string,
  /** AI Base URL - Custom API base URL (e.g., Vercel AI Gateway). Leave blank for default provider URL. */
  "ai_base_url"?: string,
  /** AI Model — Generation & Scoring - Model for card generation, improvement, and quality scoring. Leave blank to use default model. */
  "ai_model_heavy"?: string,
  /** AI Model — Tags & Auto-Fill - Model for tag suggestions, auto-fill, and other quick tasks. Leave blank to use default model. */
  "ai_model_light"?: string,
  /** undefined - When enabled, Add Card runs AI quality scoring first and asks for confirmation. */
  "ai_auto_score_on_add": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `decks` command */
  export type Decks = ExtensionPreferences & {}
  /** Preferences accessible in the `browseCards` command */
  export type BrowseCards = ExtensionPreferences & {}
  /** Preferences accessible in the `addCard` command */
  export type AddCard = ExtensionPreferences & {
  /** undefined - Enabling this will allow you to create cards with empty fields */
  "allow_empty_card_fields"?: boolean,
  /** undefined - Show file picker fields for each card field */
  "enable_attachments": boolean,
  /** undefined - Show a multiline field for pasting raw notes that AI can process into card fields */
  "show_draft_field": boolean
}
  /** Preferences accessible in the `viewStats` command */
  export type ViewStats = ExtensionPreferences & {}
  /** Preferences accessible in the `generateCards` command */
  export type GenerateCards = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `decks` command */
  export type Decks = {}
  /** Arguments passed to the `browseCards` command */
  export type BrowseCards = {}
  /** Arguments passed to the `addCard` command */
  export type AddCard = {}
  /** Arguments passed to the `viewStats` command */
  export type ViewStats = {}
  /** Arguments passed to the `generateCards` command */
  export type GenerateCards = {}
}
