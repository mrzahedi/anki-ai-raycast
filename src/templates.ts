export interface TemplateFieldHint {
  placeholder: string;
  helpText: string;
  label?: string;
}

export interface CardTemplate {
  id: string;
  name: string;
  tags: string[];
  preferredModel: 'Basic' | 'Cloze';
  fields: Record<string, TemplateFieldHint>;
}

export const TEMPLATES: CardTemplate[] = [
  {
    id: 'DSA_CONCEPT',
    name: 'DSA Concept (HelloInterview)',
    tags: ['dsa', 'hellointerview', 'concept'],
    preferredModel: 'Basic',
    fields: {
      Front: {
        label: 'Question / Definition Prompt',
        placeholder: 'What is a monotonic stack?',
        helpText: 'Concise definition or question prompt',
      },
      Back: {
        label: 'Key Idea + Constraints + Example',
        placeholder:
          'A stack where elements are always in sorted order...\n\nConstraints: O(n) amortized\n\nExample: Next Greater Element',
        helpText: 'Key idea + constraints + 1 tiny example',
      },
      Extra: {
        label: 'Pitfalls / When It Fails',
        placeholder:
          'Common pitfall: forgetting to handle equal elements\nFails when: random access needed',
        helpText: 'Common pitfalls / when the approach fails',
      },
    },
  },
  {
    id: 'SD_CONCEPT',
    name: 'System Design Concept (HelloInterview)',
    tags: ['system-design', 'hellointerview', 'concept'],
    preferredModel: 'Basic',
    fields: {
      Front: {
        label: 'Concept Prompt',
        placeholder: 'What is consistent hashing?',
        helpText: 'Concept question prompt',
      },
      Back: {
        label: 'Why + How + Tradeoffs',
        placeholder:
          '• Why: distributes load evenly across nodes\n• How: hash ring with virtual nodes\n• Tradeoff: complexity vs. simple modulo',
        helpText: '3-5 bullets: why + how + tradeoffs',
      },
      Extra: {
        label: 'Signals / Anti-signals',
        placeholder:
          'Signals: distributed cache, dynamic cluster\nAnti-signals: single-node system, fixed cluster size',
        helpText: 'When to use (signals) + when NOT to use (anti-signals)',
      },
    },
  },
  {
    id: 'LEETCODE_SR',
    name: 'LeetCode Problem SR (Pattern)',
    tags: ['leetcode', 'sr', 'pattern'],
    preferredModel: 'Basic',
    fields: {
      Front: {
        label: 'Problem — 1-Line Description',
        placeholder: 'Two Sum — Find two numbers that add to target',
        helpText: '[Problem Name] — 1-line description',
      },
      Back: {
        label: 'Pattern + Approach',
        placeholder:
          'Pattern: Hash Map\n1. Iterate array, check complement in map\n2. Store num→index\n3. Return indices when found',
        helpText: 'Pattern name + 2-3 line approach (NO full code)',
      },
      Extra: {
        label: 'Signals',
        placeholder: 'Signals: "find pair", "two numbers", unsorted array, O(n) expected',
        helpText: 'What about the problem points to this pattern',
      },
    },
  },
  {
    id: 'SD_CASE',
    name: 'System Design Case Study (HelloInterview)',
    tags: ['system-design', 'case-study', 'hellointerview'],
    preferredModel: 'Basic',
    fields: {
      Front: {
        label: 'Design Prompt',
        placeholder: 'Design a URL Shortener',
        helpText: 'Design <System>',
      },
      Back: {
        label: 'Key Decisions + Tradeoffs',
        placeholder:
          '• base62 encoding for short URLs\n• read-heavy → cache layer (Redis)\n• 301 vs 302: 301 for SEO, 302 for analytics\n• DB: NoSQL for high write throughput',
        helpText: '3-5 bullet key decisions + core tradeoffs',
      },
      Extra: {
        label: 'Scale + Bottlenecks + Failures',
        placeholder:
          'Scale: 100M URLs/day, 10:1 read/write\nBottleneck: DB writes at peak\nFailure: cache stampede on popular URLs',
        helpText: 'Scale assumptions + bottlenecks + failure modes',
      },
    },
  },
  {
    id: 'BEHAVIORAL',
    name: 'Behavioral Story (HelloInterview)',
    tags: ['behavioral', 'star', 'hellointerview'],
    preferredModel: 'Basic',
    fields: {
      Front: {
        label: 'Behavioral Question',
        placeholder:
          'Tell me about a time when you had to make a difficult technical decision under pressure.',
        helpText: '"Tell me about a time when …"',
      },
      Back: {
        label: 'STAR Outline + Metric',
        placeholder:
          'S: Legacy migration blocking launch\nT: Choose between rewrite and adapter\nA: Built adapter layer, ran parallel tests\nR: Shipped on time, 40% fewer bugs in prod',
        helpText: 'STAR bullets (Situation/Task/Action/Result) + 1 metric',
      },
      Extra: {
        label: 'Reflection + Lesson',
        placeholder:
          "What I'd do differently: start with a spike earlier\nLesson: pragmatic solutions beat perfect ones under time pressure",
        helpText: '"What I\'d do differently" + "1-line lesson"',
      },
    },
  },
];

export function getTemplateById(id: string): CardTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}
