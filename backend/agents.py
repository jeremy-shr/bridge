"""The agent team and the build pipeline they run for every venture."""

# The team. Each agent is a role with a distinct remit and voice.
AGENTS = {
    "Chief of Staff": "the orchestrator who frames the problem, sets priorities, and keeps the venture coherent",
    "Scout": "a discovery agent who finds problems worth solving and validates real demand",
    "Analyst": "a market and competitor analyst who maps the landscape and sizes the opportunity",
    "Builder": "a product engineer who specs the MVP, names it, and writes the build plan",
    "Strategist": "a go-to-market operator who designs positioning, channels, and the first-customer plan",
}

# The build pipeline: an ordered sequence of deliverables produced for every
# venture. Each entry is (agent, artifact_type, title, instruction).
PIPELINE = [
    ("Chief of Staff", "brief", "Opportunity brief",
     "Write a sharp one-page brief: the problem, who has it, why now, and the wedge. Concrete and opinionated."),
    ("Scout", "validation", "Demand & validation",
     "How would we validate real demand fast? State the riskiest assumption, 3 cheap tests, and the signal that kills or greenlights this."),
    ("Analyst", "market_scan", "Market & competitor scan",
     "Map the landscape: incumbents, substitutes, and the gap. Name real competitors where you can, and state our differentiated angle."),
    ("Builder", "product_spec", "MVP product spec",
     "Spec the smallest lovable MVP: the core user, the one job it does, the 3-5 must-have features, and a product name + one-line pitch."),
    ("Strategist", "gtm", "Go-to-market plan",
     "Design the GTM: a positioning statement, the 2 highest-leverage channels, and a concrete plan to land the first 10 customers."),
    ("Builder", "copy", "Landing page copy",
     "Write landing page copy: a hero headline + subhead, 3 benefit bullets, and a CTA. Punchy, specific, no fluff."),
    ("Chief of Staff", "risks", "Risks & next moves",
     "List the top risks/open questions and the single most important thing to do next. Be honest about what could kill this."),
]

# After the pipeline, the team keeps going deeper. A rotating pool so a venture
# never runs dry across a long autonomous run.
DEEPEN = [
    ("Strategist", "deep_dive", "Channel playbook",
     "Take our highest-leverage acquisition channel and write a concrete playbook: exact tactics, the first two weeks of actions, and the metric to watch."),
    ("Builder", "pricing", "Pricing & packaging",
     "Propose pricing: tiers, price points, what's gated, the rationale, and one pricing experiment to run."),
    ("Analyst", "competitor_teardown", "Competitor teardown",
     "Pick the most threatening competitor and tear it down: what they do well, where they're weak, and exactly how we beat them."),
    ("Strategist", "content", "Two-week content calendar",
     "Draft a two-week content calendar to build demand: 10 specific pieces with titles, channel, and the hook for each."),
    ("Scout", "experiment", "Next validation experiment",
     "Design the next experiment to de-risk the biggest open assumption: hypothesis, method, sample, and kill/scale criteria."),
    ("Chief of Staff", "operating_plan", "Week-1 operating plan",
     "Write the first week's operating plan: the 5 priorities, which agent owns each, and the definition of done."),
    ("Strategist", "partnerships", "Distribution & partnerships",
     "List 5 concrete partnership or distribution plays, why each fits, and the first outreach step for each."),
    ("Builder", "metrics", "North-star & metrics",
     "Define the north-star metric and the 4-5 input metrics that drive it, with rough month-1 targets."),
]


def _context_block(artifacts):
    if not artifacts:
        return "No prior work yet — you are starting this venture from scratch."
    lines = []
    for a in artifacts[-8:]:
        excerpt = (a.get("body") or "").replace("\n", " ")[:240]
        lines.append(f"- [{a['type']}] {a['title']}: {excerpt}…")
    return "Work the team has already produced for this venture:\n" + "\n".join(lines)


def build_messages(venture, agent, instruction, artifacts):
    """Return (system, user) for one artifact-generation call."""
    persona = AGENTS[agent]
    system = (
        f"You are {agent}, {persona}, on an autonomous founding team that builds real, fundable startups. "
        "You produce concrete, specific, decision-grade work — never generic filler. "
        "Write in clean Markdown: a short '##' title, then tight sections or bullets. "
        "No preamble, no 'as an AI', no restating the task. Straight to the substance."
    )
    user = (
        f"# Venture: {venture['title']}\n"
        f"Seed idea: {venture.get('seed_prompt') or venture['title']}\n\n"
        f"{_context_block(artifacts)}\n\n"
        f"## Your task\n{instruction}\n\n"
        "Deliver it now as a single focused Markdown document."
    )
    return system, user
