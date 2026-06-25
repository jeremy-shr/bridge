import type {
  AgentName,
  Artifact,
  ArtifactType,
  Message,
  Task,
  Venture,
} from "./types";

/**
 * Opt-in demo mode (?demo=1 or NEXT_PUBLIC_DEMO=1). Seeds a believable
 * snapshot of Bridge mid-run and then SIMULATES realtime: new tasks start,
 * complete, and emit artifacts + comms on a loop, so the dashboard looks alive
 * without a backend. Default (no env) stays on clean empty states per the brief.
 */

type Step = { agent: AgentName; type: ArtifactType; title: string };

const PIPELINE_STEPS: Step[] = [
  { agent: "Chief of Staff", type: "brief", title: "Opportunity brief" },
  { agent: "Scout", type: "validation", title: "Demand & validation" },
  { agent: "Analyst", type: "market_scan", title: "Market & competitor scan" },
  { agent: "Builder", type: "product_spec", title: "MVP product spec" },
  { agent: "Strategist", type: "gtm", title: "Go-to-market plan" },
  { agent: "Builder", type: "copy", title: "Landing page copy" },
  { agent: "Chief of Staff", type: "risks", title: "Risks & next moves" },
];

const DEEPEN_STEPS: Step[] = [
  { agent: "Strategist", type: "deep_dive", title: "Channel playbook" },
  { agent: "Builder", type: "pricing", title: "Pricing & packaging" },
  { agent: "Analyst", type: "competitor_teardown", title: "Competitor teardown" },
  { agent: "Strategist", type: "content", title: "Two-week content calendar" },
  { agent: "Scout", type: "experiment", title: "Next validation experiment" },
  { agent: "Chief of Staff", type: "operating_plan", title: "Week-1 operating plan" },
  { agent: "Strategist", type: "partnerships", title: "Distribution & partnerships" },
  { agent: "Builder", type: "metrics", title: "North-star & metrics" },
];

function stepFor(phase: number): Step {
  return phase < PIPELINE_STEPS.length
    ? PIPELINE_STEPS[phase]
    : DEEPEN_STEPS[(phase - PIPELINE_STEPS.length) % DEEPEN_STEPS.length];
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

// ---- hand-written hero artifacts for the lead venture (judges may open these) ----
const NEWSLETTER_BODIES: Partial<Record<ArtifactType, string>> = {
  brief: `## Opportunity brief: Pixel Dispatch

**The problem.** Indie game developers ship into a void. They are great at building and bad at distribution, and the existing channels (Twitter, Reddit, Discord) reward noise over signal. There is no trusted weekly read that aggregates *what actually matters* for a working indie dev.

**Who has it.** The tens of thousands of serious solo and small-studio devs shipping on Steam and itch.io each year, plus the tool-makers and publishers who want to reach them.

**Why now.** Twitter's fragmentation scattered the indie community across Bluesky, Mastodon, and Discord. Attention is up for grabs and no one has consolidated it.

**The wedge.** A sharp, curated paid newsletter: one issue a week, ruthlessly edited, covering launches worth studying, tools worth trying, and the business of shipping. Free tier for reach, paid tier for the deep teardown and the data.

**The opinion.** This is a media-as-wedge play. The newsletter is the audience; the audience is the asset. Jobs, sponsorships, and a tools marketplace compound from there.`,

  validation: `## Demand & validation

**Riskiest assumption.** That indie devs will *pay* for curation when free alternatives are everywhere. Everything else is secondary.

### Three cheap tests
1. **Landing page + waitlist.** Ship the positioning, drive 500 clicks from r/gamedev and indie Discords, measure email capture. Target: above 12% visit to email.
2. **Pre-sell the paid tier.** Offer a $5/mo founding rate to the waitlist before a single issue ships. Target: above 3% of emails convert to a paid pledge.
3. **Manual issue zero.** Hand-write one exceptional issue, send to 100 devs, measure open and forward rate. Target: above 55% open, 5+ forwards.

### Kill / greenlight
- **Greenlight** if pre-sell clears 3% and issue-zero opens beat 55%.
- **Kill** if the waitlist converts below 1% to paid. Curation alone is not a business at that price.`,

  market_scan: `## Market & competitor scan

### The landscape
- **Game Developer (Informa)** broad industry news, enterprise-leaning, not indie-native. Weak on the solo-dev reality.
- **How To Market A Game (Chris Zukowski)** excellent, adjacent, marketing-only. Proves devs pay for focused operator content.
- **deconstructoroffun** monetization-deep, mobile/F2P slant. Not our reader.
- **Substack dev logs** fragmented, inconsistent, no editorial bar.

### The gap
No one owns *the weekly indie operator read*: launches worth studying, tools, and the business of shipping, edited to a high bar. The closest (Zukowski) is marketing-only and leaves the rest open.

### Our angle
Editorial taste as moat. We are not a news aggregator; we are the trusted filter. Win on signal-to-noise, then expand from newsletter into jobs and a tools marketplace once the audience trusts us.`,

  product_spec: `## MVP product spec: Pixel Dispatch

**Core user.** A solo or small-studio dev, mid-build, who wants to ship smarter without doom-scrolling for signal.

**The one job.** Every Tuesday, deliver the single most useful 8-minute read in indie games.

### Must-have features
1. **The weekly issue** with three sections: *Launch teardown*, *Tools & tech*, *The business of shipping*.
2. **Free + paid tiers.** Free gets the issue; paid ($6/mo) gets the full teardown, the data appendix, and the archive.
3. **One-click web + email.** Readable in inbox or browser, no app.
4. **Founding-member wall.** Names paid supporters, creates social proof and belonging.

**Name + pitch.** *Pixel Dispatch* the 8-minute weekly read for people who actually ship games.

### Out of scope (v1)
Community forum, podcast, mobile app, job board. All earned later.`,

  gtm: `## Go-to-market plan

**Positioning.** *The weekly read for people who actually ship games.* Not news. Not hype. The operator's filter.

### Two highest-leverage channels
1. **Reddit (r/gamedev, r/IndieDev).** Publish issue-zero teardowns as standalone posts, link the newsletter as the "get this weekly." High intent, near-zero CAC.
2. **Creator cross-promo.** Trade shout-outs with 10 mid-size indie YouTubers and devloggers. Their audience is exactly ours.

### Landing the first 10 customers
- Hand-pick 30 respected devs, send a personal issue-zero, ask 10 to become founding members at $5/mo locked for life.
- Convert the loudest 3 into testimonials before any paid push.
- Only then open the public founding-member wall.

**First metric that matters.** Paid founding members in week one. Target: 25.`,

  copy: `## Landing page copy

### Hero
**The 8-minute weekly read for people who actually ship games.**

Launch teardowns, the tools worth your time, and the business of shipping. Edited to a high bar, in your inbox every Tuesday.

**[ Claim a founding seat ]**

### Why it's worth it
- **Signal, not noise.** One issue a week. Ruthlessly edited. No "10 tips" filler.
- **Teardowns that teach.** We dissect a real launch every week: what worked, what it earned, what you can steal.
- **By people who ship.** Written for the working indie dev, not the conference keynote.

### Founding offer
**$5/mo, locked for life. First 100 seats.**`,
};

const LEADS: Partial<Record<ArtifactType, string>> = {
  brief: "A sharp, opinionated read on the opportunity and the wedge.",
  validation: "The riskiest assumption, the cheap tests, and what kills or greenlights it.",
  market_scan: "The incumbents, the substitutes, the gap, and our differentiated angle.",
  product_spec: "The smallest lovable MVP: one core user, one job, the must-haves.",
  gtm: "Positioning, the two highest-leverage channels, and the first-10-customers plan.",
  copy: "Hero headline, the benefit case, and a CTA that converts.",
  risks: "The honest list of what could kill this, and the single most important next move.",
  deep_dive: "The highest-leverage channel, turned into a concrete two-week playbook.",
  pricing: "Tiers, price points, what is gated, and the experiment to run.",
  competitor_teardown: "The most threatening competitor, and exactly how we beat them.",
  content: "A two-week content calendar engineered to build demand.",
  experiment: "The next experiment to de-risk the biggest open assumption.",
  operating_plan: "Week-1 priorities, owners, and the definition of done.",
  partnerships: "Five distribution plays and the first outreach step for each.",
  metrics: "The north-star metric and the input metrics that drive it.",
};

/** Believable structured markdown for any step not hand-written above. */
function genBody(ventureTitle: string, step: Step): string {
  const lead = LEADS[step.type] ?? "A concrete, decision-grade deliverable.";
  return `## ${step.title}

${lead}

**Context.** ${ventureTitle}. The team is building this in the open, one deliverable at a time, each one decision-grade and specific.

### What we concluded
- The sharpest version of this is narrow on purpose: do one thing exceptionally before widening.
- The constraint that matters most is distribution, not the build. We design around earning attention.
- There is a clear wedge here that incumbents are structurally unwilling to copy.

### The move
Ship the smallest test that produces a real signal this week, instrument it, and let the result decide the next step. No vanity work.`;
}

function bodyFor(isLead: boolean, ventureTitle: string, step: Step): string {
  if (isLead && NEWSLETTER_BODIES[step.type]) {
    return NEWSLETTER_BODIES[step.type] as string;
  }
  return genBody(ventureTitle, step);
}

export interface DemoSeed {
  ventures: Venture[];
  tasks: Task[];
  artifacts: Artifact[];
  messages: Message[];
  /** tasks already in flight at snapshot time, to be completed first by the stream */
  inflight: { task: Task; venture: Venture; step: Step }[];
}

export function buildDemoData(): DemoSeed {
  const NOW = Date.now();
  const START = NOW - 132 * 60_000; // ~2h12m of "uptime"
  const at = (min: number) => new Date(START + min * 60_000).toISOString();

  const vNews: Venture = {
    id: "v-pixel-dispatch",
    title: "Paid newsletter for indie game devs",
    seed_prompt: "Paid newsletter for indie game devs",
    status: "active",
    phase: 6,
    created_at: at(0),
  };
  const vEv: Venture = {
    id: "v-ev-charging",
    title: "On-demand EV charging for apartment dwellers",
    seed_prompt: "On-demand EV charging for apartment dwellers",
    status: "active",
    phase: 2,
    created_at: at(40),
  };
  const ventures = [vNews, vEv];

  const tasks: Task[] = [];
  const artifacts: Artifact[] = [];
  const messages: Message[] = [];
  const inflight: DemoSeed["inflight"] = [];

  // newsletter: 6 completed steps along the timeline
  const newsTimes = [
    [2, 6],
    [20, 24],
    [42, 47],
    [66, 72],
    [88, 94],
    [110, 115],
  ];
  for (let i = 0; i < 6; i++) {
    const step = PIPELINE_STEPS[i];
    const [start, end] = newsTimes[i];
    tasks.push({
      id: `t-news-${i}`,
      venture_id: vNews.id,
      agent: step.agent,
      title: step.title,
      status: "done",
      created_at: at(start),
      completed_at: at(end),
    });
    artifacts.push({
      id: `a-news-${i}`,
      venture_id: vNews.id,
      agent: step.agent,
      type: step.type,
      title: step.title,
      body: bodyFor(true, vNews.title, step),
      created_at: at(end),
    });
  }
  // newsletter: risks step running now
  {
    const step = PIPELINE_STEPS[6];
    const task: Task = {
      id: "t-news-running",
      venture_id: vNews.id,
      agent: step.agent,
      title: step.title,
      status: "running",
      created_at: at(130),
      completed_at: null,
    };
    tasks.push(task);
    inflight.push({ task, venture: vNews, step });
  }

  // EV: 2 completed steps + 1 running
  const evTimes = [
    [44, 49],
    [70, 75],
  ];
  for (let i = 0; i < 2; i++) {
    const step = PIPELINE_STEPS[i];
    const [start, end] = evTimes[i];
    tasks.push({
      id: `t-ev-${i}`,
      venture_id: vEv.id,
      agent: step.agent,
      title: step.title,
      status: "done",
      created_at: at(start),
      completed_at: at(end),
    });
    artifacts.push({
      id: `a-ev-${i}`,
      venture_id: vEv.id,
      agent: step.agent,
      type: step.type,
      title: step.title,
      body: bodyFor(false, vEv.title, step),
      created_at: at(end),
    });
  }
  {
    const step = PIPELINE_STEPS[2];
    const task: Task = {
      id: "t-ev-running",
      venture_id: vEv.id,
      agent: step.agent,
      title: step.title,
      status: "running",
      created_at: at(120),
      completed_at: null,
    };
    tasks.push(task);
    inflight.push({ task, venture: vEv, step });
  }

  // comms
  messages.push(
    { id: "m-0", venture_id: null, direction: "system", channel: "system", body: "All 5 agents online. Tick interval 150s.", created_at: at(0) },
    { id: "m-1", venture_id: vNews.id, direction: "in", channel: "whatsapp", body: "Paid newsletter for indie game devs. Can the team run with this?", created_at: at(0) },
    { id: "m-2", venture_id: vNews.id, direction: "system", channel: "seed", body: "Venture seeded: Paid newsletter for indie game devs", created_at: at(0) },
    { id: "m-3", venture_id: vNews.id, direction: "out", channel: "whatsapp", body: "🟢 Analyst finished “Market & competitor scan” for Paid newsletter for indie game devs", created_at: at(47) },
    { id: "m-4", venture_id: vEv.id, direction: "in", channel: "whatsapp", body: "On-demand EV charging for apartment dwellers — worth a look?", created_at: at(40) },
    { id: "m-5", venture_id: vEv.id, direction: "system", channel: "seed", body: "Venture seeded: On-demand EV charging for apartment dwellers", created_at: at(40) },
    { id: "m-6", venture_id: vNews.id, direction: "out", channel: "whatsapp", body: "🟢 Strategist finished “Go-to-market plan” for Paid newsletter for indie game devs", created_at: at(94) },
    { id: "m-7", venture_id: vEv.id, direction: "out", channel: "whatsapp", body: "🟢 Scout finished “Demand & validation” for On-demand EV charging for apartment dwellers", created_at: at(75) },
    { id: "m-8", venture_id: vNews.id, direction: "in", channel: "whatsapp", body: "Love the positioning. Push on pricing next?", created_at: at(118) },
  );

  return { ventures, tasks, artifacts, messages, inflight };
}

export type EmitFn = (
  table: "ventures" | "tasks" | "artifacts" | "messages",
  row: Venture | Task | Artifact | Message,
) => void;

/**
 * Drives the live simulation. Completes in-flight tasks, then keeps the
 * ventures moving through the pipeline + deepen loop, emitting tasks,
 * artifacts, venture phase bumps, and the occasional comms message.
 */
export function startDemoStream(seed: DemoSeed, emit: EmitFn): () => void {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const ventures: Record<string, Venture> = Object.fromEntries(
    seed.ventures.map((v) => [v.id, { ...v }]),
  );
  let completions = 0;

  const after = (ms: number, fn: () => void) => {
    if (stopped) return;
    timers.push(setTimeout(() => !stopped && fn(), ms));
  };

  const complete = (venture: Venture, step: Step, task: Task) => {
    if (stopped) return;
    const nowIso = new Date().toISOString();
    emit("tasks", { ...task, status: "done", completed_at: nowIso });
    emit("artifacts", {
      id: uid("a"),
      venture_id: venture.id,
      agent: step.agent,
      type: step.type,
      title: step.title,
      body: bodyFor(venture.id === "v-pixel-dispatch", venture.title, step),
      created_at: nowIso,
    });
    const bumped = { ...ventures[venture.id], phase: ventures[venture.id].phase + 1 };
    ventures[venture.id] = bumped;
    emit("ventures", bumped);

    completions += 1;
    if (completions % 2 === 1) {
      emit("messages", {
        id: uid("m"),
        venture_id: venture.id,
        direction: "out",
        channel: "whatsapp",
        body: `🟢 ${step.agent} finished “${step.title}” for ${venture.title}`,
        created_at: new Date().toISOString(),
      });
    }
    if (completions % 4 === 0) {
      const prompts = [
        "Nice. What's the riskiest assumption left?",
        "Can we get a teardown of the closest competitor?",
        "How many founding members are we targeting week one?",
      ];
      emit("messages", {
        id: uid("m"),
        venture_id: venture.id,
        direction: "in",
        channel: "whatsapp",
        body: prompts[(completions / 4 - 1) % prompts.length],
        created_at: new Date().toISOString(),
      });
    }
    after(4200 + Math.random() * 3500, startNext);
  };

  const startNext = () => {
    if (stopped) return;
    // pick the active venture with the least progress
    const list = Object.values(ventures).filter((v) => v.status === "active");
    list.sort((a, b) => a.phase - b.phase);
    const venture = list[0];
    if (!venture) return;
    const step = stepFor(venture.phase);
    const task: Task = {
      id: uid("t"),
      venture_id: venture.id,
      agent: step.agent,
      title: step.title,
      status: "running",
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    emit("tasks", task);
    after(3200 + Math.random() * 2600, () => complete(venture, step, task));
  };

  // finish the two snapshot tasks first, staggered, then run the loop
  seed.inflight.forEach((f, i) => {
    after(5000 + i * 6500, () => complete(f.venture, f.step, f.task));
  });

  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}
