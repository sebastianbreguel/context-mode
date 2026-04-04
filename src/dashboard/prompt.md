# Dashboard Insight Generation Prompt

Read the metrics JSON from `{{METRICS_PATH}}`.

Analyze the data for patterns, anomalies, correlations, wins, and risks.

Generate 3-7 insight cards following **Persona → Metric → Evidence → Action → ROI**:

```json
[
  {
    "severity": "high | medium | positive | info",
    "badge": "Action needed | Pattern | Win | Trend | Alert | Suggestion",
    "source": "which metric(s) — e.g. 'CLAUDE.md freshness + error rate'",
    "when": "today | this session | this week | 7-day trend",
    "metric": "One sentence. What the data shows. Include numbers.",
    "evidence": "Why this matters. Correlations, comparisons, trends. Use <strong> for key numbers.",
    "action": "Specific thing to do. Not generic advice. A concrete next step.",
    "roi": "Estimated time or quality impact. Be specific."
  }
]
```

## What to look for

- **Stale project instructions** → correlate with error rate per project
- **Iteration cycles** → files with >2 edit→run→fix loops likely need tests
- **Rework** → files edited 3+ times suggest unclear requirements
- **Error rate changes** → did it improve or worsen? What changed?
- **Time patterns** → AM vs PM productivity, which days are best
- **Tool diversity** → low diversity = missing opportunities
- **Context savings** → if below 95%, user may be bypassing sandbox
- **Compaction frequency** → high = context filling up too fast
- **Efficiency score trend** → improving or declining?
- **Subagent patterns** → could parallel agents speed things up?
- **Permission denials** → confirms routing is protecting context
- **Commits per session** → productivity benchmark

## Rules

- Sort by severity: high first, positive last
- Only surface what's **surprising or actionable** — not everything
- Each insight must have **specific numbers** from the data
- Each action must be **concrete** — not "consider improving"
- Cross-reference metrics — the best insights connect 2+ data points
- Include at least 1 positive insight (wins matter for motivation)
- Badge text must be 1-2 words max

## Output

Write the insight array into the template file at `{{TEMPLATE_PATH}}`.
Replace `{{INSIGHTS_JSON}}` with the JSON array.
Replace `{{METRICS}}` with the full metrics JSON object.
Then open the HTML file in the browser.
