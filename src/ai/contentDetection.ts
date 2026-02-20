export type ContentType =
  | 'DSA_CONCEPT'
  | 'LEETCODE_PROBLEM'
  | 'SYSTEM_DESIGN_CONCEPT'
  | 'SYSTEM_DESIGN_PRACTICE'
  | 'PROGRAMMING_LANGUAGE'
  | 'BEHAVIORAL_QA'
  | 'OTHER';

interface DetectionRule {
  type: ContentType;
  /** Each pattern group is OR'd; groups themselves are scored by match count */
  strongSignals: RegExp[];
  weakSignals: RegExp[];
  /** Minimum strong-signal matches to consider this type */
  threshold: number;
}

const RULES: DetectionRule[] = [
  {
    type: 'LEETCODE_PROBLEM',
    strongSignals: [
      /leetcode/i,
      /\bInput\s*:/,
      /\bOutput\s*:/,
      /\bConstraints?\s*:/i,
      /\bExample\s+\d+\s*:/,
      /#\d{1,4}\b/,
      /\bneetcode\b/i,
    ],
    weakSignals: [
      /\btime complexity\b/i,
      /\bspace complexity\b/i,
      /O\([^)]+\)/,
      /\bbrute\s*force\b/i,
      /\boptimal\b/i,
    ],
    threshold: 2,
  },
  {
    type: 'DSA_CONCEPT',
    strongSignals: [
      /\bdata\s+structure/i,
      /\balgorithm\b/i,
      /\bbinary\s+(tree|search)\b/i,
      /\bhash\s*(map|table|set)\b/i,
      /\blinked\s+list\b/i,
      /\b(BFS|DFS|dijkstra|topological)\b/i,
      /\bheap\b/i,
      /\btrie\b/i,
      /\bstack\b/i,
      /\bqueue\b/i,
      /\bgraph\b/i,
      /\bsorting\b/i,
      /\bdynamic\s+programming\b/i,
      /\bsliding\s+window\b/i,
      /\btwo\s+pointer/i,
      /\bmonotonic\b/i,
    ],
    weakSignals: [
      /O\([^)]+\)/,
      /\btime complexity\b/i,
      /\bspace complexity\b/i,
      /\brecursion\b/i,
      /\bamortized\b/i,
    ],
    threshold: 2,
  },
  {
    type: 'SYSTEM_DESIGN_PRACTICE',
    strongSignals: [
      /\bdesign\s+(a|an|the)\s+\w/i,
      /\bdesign\s+(youtube|twitter|instagram|uber|whatsapp|facebook|netflix|tiktok|slack|discord|reddit|url\s+shortener|pastebin|rate\s+limiter|chat|notification|search\s+engine|google\s+drive|dropbox|payment|booking)/i,
      /\bhow\s+would\s+you\s+design\b/i,
    ],
    weakSignals: [
      /\bscalability\b/i,
      /\bload\s+balancer\b/i,
      /\bdatabase\s+(schema|design)\b/i,
      /\bAPI\s+design\b/i,
      /\bmicroservice/i,
      /\bcaching\b/i,
    ],
    threshold: 1,
  },
  {
    type: 'SYSTEM_DESIGN_CONCEPT',
    strongSignals: [
      /\bsystem\s+design\b/i,
      /\bscalability\b/i,
      /\bdistributed\s+(system|computing)\b/i,
      /\bCAP\s+theorem\b/i,
      /\bload\s+balanc/i,
      /\bconsistent\s+hashing\b/i,
      /\bsharding\b/i,
      /\breplication\b/i,
      /\bmessage\s+queue\b/i,
      /\bCDN\b/,
      /\bmicroservice/i,
      /\bevent[\s-]driven\b/i,
      /\bCQRS\b/i,
    ],
    weakSignals: [
      /\bthroughput\b/i,
      /\blatency\b/i,
      /\bavailability\b/i,
      /\bpartition\s+tolerance\b/i,
      /\bcaching\b/i,
      /\bRedis\b/i,
      /\bKafka\b/i,
    ],
    threshold: 2,
  },
  {
    type: 'PROGRAMMING_LANGUAGE',
    strongSignals: [
      /\bdef\s+\w+\s*\(/,
      /\bfunc\s+\w+\s*\(/,
      /\bfn\s+\w+\s*\(/,
      /\bgoroutine/i,
      /\bchannel\b.*\bgo\b/i,
      /\bpython\b/i,
      /\bgolang\b|\bgo\s+language\b/i,
      /\brust\b/i,
      /\btypescript\b/i,
      /\bjavascript\b/i,
      /\bjava\b/i,
      /\bswift\b/i,
      /\bkotlin\b/i,
      /\bdecorator\b/i,
      /\bgenerator\b/i,
      /\basync\s+await\b/i,
      /\btype\s+hint/i,
      /\bgeneric[s]?\b/i,
      /\bclosure\b/i,
      /\bprotocol\b/i,
      /\btrait\b/i,
      /\binterface\b/i,
    ],
    weakSignals: [
      /\bsyntax\b/i,
      /\bcompiler\b/i,
      /\binterpreter\b/i,
      /\bruntime\b/i,
      /\bmemory\s+management\b/i,
    ],
    threshold: 2,
  },
  {
    type: 'BEHAVIORAL_QA',
    strongSignals: [
      /tell\s+me\s+about\s+a\s+time/i,
      /\bSTAR\b/,
      /\bbehavioral\b/i,
      /\bsituation\b.*\btask\b.*\baction\b.*\bresult\b/is,
      /\bleadership\b/i,
      /\bconflict\s+resolution\b/i,
      /\bteamwork\b/i,
      /describe\s+a\s+(situation|time|challenge)/i,
      /\bwhat\s+would\s+you\s+do\s+if\b/i,
      /\bgive\s+me\s+an\s+example\b/i,
    ],
    weakSignals: [
      /\binterview\b/i,
      /\bstrength/i,
      /\bweakness/i,
      /\bchallenge\b/i,
      /\baccomplishment\b/i,
    ],
    threshold: 1,
  },
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter(p => p.test(text)).length;
}

export function detectContentType(text: string): ContentType {
  let bestType: ContentType = 'OTHER';
  let bestScore = 0;

  for (const rule of RULES) {
    const strong = countMatches(text, rule.strongSignals);
    if (strong < rule.threshold) continue;

    const weak = countMatches(text, rule.weakSignals);
    const score = strong * 3 + weak;

    if (score > bestScore) {
      bestScore = score;
      bestType = rule.type;
    }
  }

  return bestType;
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  DSA_CONCEPT: 'DSA Concept',
  LEETCODE_PROBLEM: 'LeetCode Problem',
  SYSTEM_DESIGN_CONCEPT: 'System Design Concept',
  SYSTEM_DESIGN_PRACTICE: 'System Design Practice',
  PROGRAMMING_LANGUAGE: 'Programming Language',
  BEHAVIORAL_QA: 'Behavioral Q&A',
  OTHER: 'General',
};

export function getContentTypeLabel(type: ContentType): string {
  return CONTENT_TYPE_LABELS[type];
}

export function getContentTypePromptEnhancement(type: ContentType): string {
  switch (type) {
    case 'LEETCODE_PROBLEM':
      return `## Content Type Detected: LeetCode Problem

Create cards optimized for pattern recognition and problem-solving recall:
- **Front**: "[Problem Name] — 1-line description" format
- **Back**: Pattern name + 2-3 line approach outline (NO full code). Include time/space complexity.
- **Extra**: Recognition signals — what clues in the problem hint at this pattern? Include edge cases.
- **Code**: Only include a short pseudocode snippet if it clarifies the approach. Keep under 5 lines.
- **Tags**: Include the pattern name (e.g., "two-pointer", "sliding-window", "hash-map"), difficulty level, and topic.
- Prefer BASIC note type for LeetCode problems (pattern → approach mapping works best as Q&A).`;

    case 'DSA_CONCEPT':
      return `## Content Type Detected: DSA Concept

Create cards optimized for data structure and algorithm mastery:
- **Front**: Clear definition prompt — "What is X?" or "When would you use X?"
- **Back**: Concise definition + key constraints (time/space complexity) + 1 tiny example
- **Extra**: Common pitfalls, when this approach fails, edge cases to watch for
- **Code**: Only if a short code snippet illustrates the concept better than words. Keep minimal.
- Focus on atomic concepts — one idea per card.
- Prefer BASIC for definitions and comparisons, CLOZE for memorizing specific complexities or properties.`;

    case 'SYSTEM_DESIGN_CONCEPT':
      return `## Content Type Detected: System Design Concept

Create cards optimized for system design interview recall:
- **Front**: "What is X?" or "Why use X?" — concept-level question
- **Back**: Structure as "Why → How → Tradeoffs" (3-5 bullets)
- **Extra**: Signals (when to use) and anti-signals (when NOT to use) in interviews
- Focus on tradeoffs and decision-making, not implementation details.
- Prefer BASIC note type for system design concepts.`;

    case 'SYSTEM_DESIGN_PRACTICE':
      return `## Content Type Detected: System Design Practice (Case Study)

Create cards optimized for end-to-end system design recall:
- **Front**: "Design a [System]" or a specific design decision question
- **Back**: 3-5 bullet key decisions + core tradeoffs. Include the "why" behind each decision.
- **Extra**: Scale assumptions, bottleneck analysis, failure modes, and what makes this design unique
- Break large designs into multiple atomic cards (one per major decision or component).
- Prefer BASIC note type for design case studies.`;

    case 'PROGRAMMING_LANGUAGE':
      return `## Content Type Detected: Programming Language Concept

Create cards optimized for language-specific knowledge retention:
- **Front**: Precise question about syntax, behavior, or concept — "What does X do in [Language]?" or "How does [Language] handle X?"
- **Back**: Clear, concise answer with a tiny code example if helpful
- **Extra**: Common gotchas, comparison with other languages, when to use vs. alternatives
- **Code**: Include short code snippets when they clarify behavior. Keep under 5 lines.
- Use CLOZE for syntax memorization (e.g., "In Python, {{c1::@staticmethod}} decorates a method that...")
- Use BASIC for conceptual understanding and comparisons.`;

    case 'BEHAVIORAL_QA':
      return `## Content Type Detected: Behavioral Interview Q&A

Create cards optimized for behavioral interview storytelling:
- **Front**: The behavioral question — "Tell me about a time when..." format
- **Back**: STAR outline — Situation (1 line), Task (1 line), Action (2-3 lines), Result (1 line + metric)
- **Extra**: "What I'd do differently" reflection + 1-line lesson learned
- Keep stories concise but specific — include concrete numbers and outcomes.
- Always prefer BASIC note type for behavioral questions.
- Tags should include the competency being tested (e.g., "leadership", "conflict-resolution", "technical-decision").`;

    case 'OTHER':
    default:
      return `## Content Type: General

Create well-structured, atomic flashcards following spaced repetition best practices:
- One idea per card
- Clear, unambiguous questions
- Concise answers
- Use Extra field only when it adds genuine value (pitfalls, mnemonics, context)
- Choose between BASIC and CLOZE based on what best suits the content.`;
  }
}
