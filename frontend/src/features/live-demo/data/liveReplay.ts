import {
  CONDITION_META,
  CONDITION_ORDER,
  type Condition,
  type RunEvent,
} from "@contracts";

export interface ScheduledEvent {
  offsetMs: number;
  event: RunEvent;
}

export interface ConditionStory {
  eyebrow: string;
  sees: string;
  consequence: string;
}

export const CONDITION_STORIES: Record<Condition, ConditionStory> = {
  raw: {
    eyebrow: "Human interface",
    sees: "Navigation, banners, product cards, footer links, scripts, and modal markup.",
    consequence: "The goal signal is buried in page chrome; the agent spends its budget orienting itself.",
  },
  markdown: {
    eyebrow: "Static content",
    sees: "Readable product text, promotional copy, policies, and newsletter content in one long stream.",
    consequence: "Cleaner than HTML, but it loses executable action schemas and still keeps irrelevant content.",
  },
  a11y: {
    eyebrow: "Accessible structure",
    sees: "Roles, accessible names, buttons, links, and the surrounding page hierarchy.",
    consequence: "Grounding improves, but the representation is generic rather than conditioned on this task.",
  },
  stagehand: {
    eyebrow: "LLM browser control",
    sees: "A fresh DOM interpretation at every action step, backed by a large model.",
    consequence: "It completes the task reliably, but repeated model calls raise latency, tokens, and cost.",
  },
  prompted_av: {
    eyebrow: "Gemini teacher",
    sees: "Only the two blue shirts and a typed add_to_cart action grounded to product IDs.",
    consequence: "Task conditioning removes exploration. The large teacher remains more expensive than the student.",
  },
  trained_av: {
    eyebrow: "Freesolo student",
    sees: "The same compact goal-conditioned content and action schema, produced by the trained small model.",
    consequence: "The agent reaches the grounded action immediately with the lowest token and latency footprint.",
  },
};

const BASE_TIME = Date.parse("2026-07-18T12:00:00.000Z");

function at(offsetMs: number): string {
  return new Date(BASE_TIME + offsetMs).toISOString();
}

function started(condition: Condition): ScheduledEvent {
  return {
    offsetMs: 80,
    event: {
      type: "run_started",
      runId: `demo-${condition}`,
      taskId: "t01",
      condition,
      goal: "Add the cheapest blue shirt to the cart",
      at: at(80),
    },
  };
}

function step(
  condition: Condition,
  stepIndex: number,
  offsetMs: number,
  thought: string,
  tokens: number,
  action?: { name: string; args: Record<string, unknown> },
): ScheduledEvent {
  return {
    offsetMs,
    event: {
      type: "agent_step",
      runId: `demo-${condition}`,
      condition,
      stepIndex,
      thought,
      action,
      tokens,
      at: at(offsetMs),
    },
  };
}

function observation(
  condition: Condition,
  stepIndex: number,
  offsetMs: number,
  text: string,
  ok = true,
): ScheduledEvent {
  return {
    offsetMs,
    event: {
      type: "action_result",
      runId: `demo-${condition}`,
      condition,
      stepIndex,
      ok,
      observation: text,
      at: at(offsetMs),
    },
  };
}

function finished(
  condition: Condition,
  offsetMs: number,
  status: "success" | "failure",
  steps: number,
  tokens: number,
  latencyMs: number,
): ScheduledEvent {
  return {
    offsetMs,
    event: {
      type: "run_finished",
      runId: `demo-${condition}`,
      condition,
      status,
      steps,
      tokens,
      latency_ms: latencyMs,
      at: at(offsetMs),
    },
  };
}

const scripts: Record<Condition, ScheduledEvent[]> = {
  raw: [
    started("raw"),
    step("raw", 1, 700, "The cookie modal blocks the product grid. I should dismiss it first.", 610, {
      name: "click",
      args: { selector: "#accept-cookies" },
    }),
    observation("raw", 1, 1050, "Modal dismissed. 164 interactive DOM nodes remain."),
    step("raw", 2, 1800, "I need to inspect every product card and compare names, colours, and prices.", 1480),
    step("raw", 4, 3300, "The first blue result looks relevant, but I may have missed a cheaper card below the fold.", 2940, {
      name: "scroll",
      args: { y: 640 },
    }),
    observation("raw", 4, 3700, "Footer and newsletter form revealed; no additional products found."),
    step("raw", 6, 5150, "The repeated card markup is ambiguous. I will try the visible first blue shirt.", 4310, {
      name: "click",
      args: { selector: ".card .add-button" },
    }),
    observation("raw", 6, 5500, "Grounding matched p1: Blue Oxford Shirt, $24.", false),
    finished("raw", 6200, "failure", 7, 4890, 8200),
  ],
  markdown: [
    started("markdown"),
    step("markdown", 1, 620, "The content is readable, but product copy and promotions are mixed together.", 440),
    step("markdown", 2, 1550, "Blue Linen Shirt at $19 is cheapest. I need an executable target for it.", 930, {
      name: "find",
      args: { text: "Blue Linen Shirt" },
    }),
    observation("markdown", 2, 1950, "Text found, but the markdown contains no stable action target."),
    step("markdown", 4, 3500, "I can infer the answer but cannot ground add-to-cart to product p2.", 1780),
    finished("markdown", 4700, "failure", 5, 2210, 5900),
  ],
  a11y: [
    started("a11y"),
    step("a11y", 1, 560, "I will scan named product groups and their adjacent buttons.", 390),
    step("a11y", 2, 1350, "Two accessible groups contain ‘Blue’. I need to compare their price text.", 810),
    step("a11y", 4, 2700, "Blue Linen Shirt is $19. Its nearest Add button is the correct target.", 1510, {
      name: "press",
      args: { role: "button", name: "Add Blue Linen Shirt" },
    }),
    observation("a11y", 4, 3150, "Cart updated: Blue Linen Shirt × 1."),
    finished("a11y", 4100, "success", 6, 2010, 4800),
  ],
  stagehand: [
    started("stagehand"),
    step("stagehand", 1, 500, "Ask the browser model to identify the cheapest blue shirt.", 520, {
      name: "observe",
      args: { instruction: "find cheapest blue shirt" },
    }),
    observation("stagehand", 1, 1050, "Model identified Blue Linen Shirt, $19, with a candidate button."),
    step("stagehand", 2, 1850, "Re-ground the candidate element before acting.", 1210, {
      name: "act",
      args: { instruction: "add Blue Linen Shirt to cart" },
    }),
    observation("stagehand", 2, 2500, "Action dispatched; cart badge changed from 0 to 1."),
    step("stagehand", 4, 3450, "Verify the cart contains the intended product.", 2090),
    finished("stagehand", 4300, "success", 5, 2520, 5100),
  ],
  prompted_av: [
    started("prompted_av"),
    step("prompted_av", 1, 460, "The view exposes two blue products with numeric prices. p2 is the minimum.", 260),
    step("prompted_av", 2, 1250, "Dispatch the provided typed action with product_id p2.", 590, {
      name: "add_to_cart",
      args: { product_id: "p2" },
    }),
    observation("prompted_av", 2, 1720, "Cart updated: Blue Linen Shirt × 1. Verifier passed."),
    finished("prompted_av", 2500, "success", 3, 760, 2700),
  ],
  trained_av: [
    started("trained_av"),
    step("trained_av", 1, 380, "p2 is the cheapest relevant item. Use the grounded add_to_cart action.", 120, {
      name: "add_to_cart",
      args: { product_id: "p2" },
    }),
    observation("trained_av", 1, 820, "Cart updated: Blue Linen Shirt × 1. Verifier passed."),
    finished("trained_av", 1450, "success", 2, 210, 1200),
  ],
};

export const LIVE_REPLAY: ScheduledEvent[] = CONDITION_ORDER.flatMap(
  (condition) => scripts[condition],
).sort((a, b) => a.offsetMs - b.offsetMs);

export const MAX_REPLAY_MS = Math.max(...LIVE_REPLAY.map(({ offsetMs }) => offsetMs));

export const REPLAY_SUMMARY = CONDITION_ORDER.map((condition) => ({
  condition,
  label: CONDITION_META[condition].label,
  finalEvent: scripts[condition].at(-1)?.event,
}));
