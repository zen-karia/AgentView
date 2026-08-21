import { useState } from "react";

import { CONDITION_META, type AgentView, type Condition } from "@contracts";
import { AGENT_VIEW_T01, RAW_PAGE_T01 } from "@mocks/scenarios";
import { CONDITION_STORIES } from "../data/liveReplay";
import { PagePreview } from "./PagePreview";

interface TranslationInspectorProps {
  selected: Condition;
}

type InspectorView = "visual" | "json";

function ActionSignature({ view }: { view: AgentView }) {
  const action = view.actions[0];
  const params = Object.entries(action.params)
    .map(([name, schema]) => `${name}: ${schema.type}${schema.required ? "" : "?"}`)
    .join(", ");

  return (
    <div className="live-action-schema">
      <span>AVAILABLE ACTION</span>
      <code>{action.name}({`{ ${params} }`})</code>
      <p>{action.description}</p>
      <small>grounded to <code>{action.target_selector}</code></small>
    </div>
  );
}

export function TranslationInspector({ selected }: TranslationInspectorProps) {
  const [view, setView] = useState<InspectorView>("visual");
  const story = CONDITION_STORIES[selected];
  const meta = CONDITION_META[selected];

  return (
    <section className="live-inspector">
      <div className="live-section-head">
        <div>
          <span className="live-kicker">Under the hood</span>
          <h2>What the agent sees</h2>
          <p>AgentView keeps the evidence and executable actions needed for this goal—nothing else.</p>
        </div>
        <div className="live-inspector-tabs" role="group" aria-label="Inspector display">
          <button type="button" aria-pressed={view === "visual"} onClick={() => setView("visual")}>Visual diff</button>
          <button type="button" aria-pressed={view === "json"} onClick={() => setView("json")}>AgentView JSON</button>
        </div>
      </div>

      <div className="live-lens" style={{ "--lane-color": `var(--cond-${selected})` } as React.CSSProperties}>
        <span className="live-lens__swatch" />
        <div>
          <span>{story.eyebrow}</span>
          <strong>{meta.label}</strong>
        </div>
        <p>{story.sees}</p>
        <small>{story.consequence}</small>
      </div>

      {view === "visual" ? (
        <div className="live-inspector-grid">
          <article className="live-inspector-panel live-inspector-panel--source">
            <div className="live-panel-label"><span>01</span><div><strong>Human page</strong><small>Designed for eyes</small></div></div>
            <PagePreview />
            <div className="live-source-stats tnum">
              <span><strong>164</strong> DOM nodes</span>
              <span><strong>38</strong> interactive</span>
              <span><strong>4.8k</strong> tokens</span>
            </div>
          </article>

          <article className="live-inspector-panel live-inspector-panel--diff">
            <div className="live-panel-label"><span>02</span><div><strong>Task-conditioned filter</strong><small>Goal: cheapest blue shirt</small></div></div>
            <div className="live-diff-columns">
              <div className="live-kept">
                <span className="live-diff-title"><i /> KEPT · 2 ITEMS</span>
                {AGENT_VIEW_T01.relevant_content.map((item) => (
                  <div className="live-content-chip" key={item.id}>
                    <span>{item.id}</span><strong>{item.text}</strong>
                    <small>price: ${String(item.meta?.price)} · color: {String(item.meta?.color)}</small>
                  </div>
                ))}
              </div>
              <div className="live-stripped">
                <span className="live-diff-title"><i /> STRIPPED · NOISE</span>
                {["Promo banner", "Cookie modal", "Site navigation", "Red Polo · $15", "Newsletter form", "Footer + legal"].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
            <div className="live-reduction">
              <strong className="tnum">96%</strong>
              <span>less context</span>
              <div><i /><i /><i /><i /><i /><i /><i /><i /><i /><i className="live-reduction__kept" /></div>
            </div>
          </article>

          <article className="live-inspector-panel live-inspector-panel--output">
            <div className="live-panel-label"><span>03</span><div><strong>AgentView</strong><small>Ready to reason + act</small></div></div>
            <div className="live-summary-block">
              <span>SUMMARY</span>
              <p>{AGENT_VIEW_T01.summary}</p>
            </div>
            <ActionSignature view={AGENT_VIEW_T01} />
            <div className="live-decision">
              <span>DECISION</span>
              <p><code>p2</code> has the minimum price among <code>color=blue</code>.</p>
              <strong>add_to_cart({`{ product_id: "p2" }`})</strong>
            </div>
          </article>
        </div>
      ) : (
        <div className="live-json-view">
          <div className="live-json-view__head">
            <span><i /> Valid AgentView</span>
            <small className="tnum">{JSON.stringify(AGENT_VIEW_T01).length} chars · source {RAW_PAGE_T01.url}</small>
          </div>
          <pre><code>{JSON.stringify(AGENT_VIEW_T01, null, 2)}</code></pre>
        </div>
      )}
    </section>
  );
}
