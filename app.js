"use strict";

/*
 * ProofLayer Local v0.1
 * All analysis stays inside this page. No network requests, external dependencies,
 * storage APIs, accounts, or server endpoints are used by this script.
 * The matching rules are intentionally conservative heuristics, not an LLM.
 */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const sourceText = $("#sourceText");
  const claimsText = $("#claimsText");
  const runBtn = $("#runBtn");
  const errorMessage = $("#errorMessage");
  const resultsSection = $("#results");
  const ledger = $("#ledger");
  const summaryGrid = $("#summaryGrid");
  let latestResults = [];

  const exampleSource = `Travel Reimbursement Policy

Employees may claim reimbursement for approved business travel.
Hotel expenses are reimbursed up to ₹4,000 per night.
Meals are reimbursed up to ₹800 per day.
Receipts must be submitted within 30 days after the trip ends.
Personal entertainment expenses are not reimbursable.
Manager approval is required for international travel.
Taxi fares are reimbursable when supported by a receipt.`;

  const exampleClaims = `Hotel expenses are reimbursed up to ₹4,000 per night.
Meals are reimbursed up to ₹1,200 per day.
Receipts must be submitted within 30 days after the trip ends.
Personal entertainment expenses are reimbursable.
Manager approval is required for international travel.
Flight upgrades are always covered by the policy.`;

  const STOP_WORDS = new Set([
    "a","an","and","are","as","at","be","been","by","for","from","has","have","in",
    "is","it","its","may","must","of","on","or","per","that","the","their","this",
    "to","up","was","were","will","with","within","after","before","when","where",
    "which","who","what","can","could","should","would","not","no","only","all",
    "every","always","required","reimbursable","reimbursed","expenses","expense"
  ]);

  const normalize = (text) => String(text || "")
    .toLowerCase()
    .replace(/₹\s?/g, " rs ")
    .replace(/\b(inr|rupees?)\b/g, " rs ")
    .replace(/[,;]/g, " ")
    .replace(/[^\p{L}\p{N}\s.%/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = (text) => normalize(text)
    .split(" ")
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));

  const splitSentences = (text) => {
    // One line per claim is preferred; sentence splitting is a fallback.
    return String(text || "").split(/\n+|(?<=[.!?])\s+(?=[A-Z₹])/u)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  const similarity = (a, b) => {
    const left = new Set(tokens(a));
    const right = new Set(tokens(b));
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared++;
    return shared / (left.size + right.size - shared);
  };

  const numbers = (text) => {
    const matches = String(text).match(/(?:₹\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|days?|weeks?|months?|years?|hours?|nights?)?\b)/giu) || [];
    return matches.map((s) => s.toLowerCase().replace(/[,\s]/g, "").replace(/^₹/, "rs"));
  };

  const hasNegation = (text) => /\b(not|no|never|cannot|can't|isn't|aren't|doesn't|don't|excluded|prohibited|non[- ]?reimbursable|ineligible)\b/i.test(text);
  const hasPositivePermission = (text) => /\b(allowed|eligible|reimbursable|reimbursed|covered|permitted|approved|required|must|may)\b/i.test(text);

  const findBestEvidence = (claim, passages) => {
    return passages.map((text, index) => ({ text, index, score: similarity(claim, text) }))
      .sort((a, b) => b.score - a.score)[0] || null;
  };

  function classifyClaim(claim, passages) {
    const best = findBestEvidence(claim, passages);
    if (!best || best.score < 0.2) {
      return {
        claim, status: "insufficient", label: "Insufficient evidence",
        explanation: "No source passage matched enough of this claim's key terms to provide a useful evidence trail.",
        evidence: best && best.score >= 0.12 ? best.text : "",
        score: best ? best.score : 0
      };
    }

    const matched = best.text;
    const claimNums = numbers(claim);
    const sourceNums = numbers(matched);
    const sameTopic = best.score >= 0.3;

    // Only call a numeric mismatch contradictory when the likely subject overlaps.
    if (sameTopic && claimNums.length && sourceNums.length) {
      const claimHasAmountOrLimit = /\b(up to|at least|no more than|within|maximum|minimum|limit|cap|per day|per night|days?|weeks?|months?|years?|%)\b/i.test(claim) || /₹|\b\d+\s?(days?|weeks?|months?|years?|nights?|%)\b/i.test(claim);
      if (claimHasAmountOrLimit && !claimNums.every((n) => sourceNums.includes(n))) {
        return {
          claim, status: "contradicted", label: "Contradicted",
          explanation: "The closest source passage refers to the same apparent topic but does not support the number or limit stated in this claim. Check that both numbers describe the same field and context.",
          evidence: matched, score: best.score
        };
      }
    }

    // Detect an explicit polarity conflict, only when the key terms are closely aligned.
    if (best.score >= 0.35 && hasNegation(claim) !== hasNegation(matched)) {
      const claimPos = hasPositivePermission(claim);
      const sourcePos = hasPositivePermission(matched);
      if (claimPos && sourcePos) {
        return {
          claim, status: "contradicted", label: "Contradicted",
          explanation: "The claim and closest source passage appear to disagree about permission, eligibility, or obligation. This rule is heuristic; verify the wording and scope.",
          evidence: matched, score: best.score
        };
      }
    }

    if (best.score >= 0.48 && (!claimNums.length || claimNums.every((n) => sourceNums.includes(n))) &&
        hasNegation(claim) === hasNegation(matched)) {
      return {
        claim, status: "supported", label: "Supported",
        explanation: "The claim has strong wording overlap with this source passage and no obvious numeric or negation mismatch was found. This is not proof that the claim is true.",
        evidence: matched, score: best.score
      };
    }

    return {
      claim, status: "review", label: "Needs review",
      explanation: "A potentially relevant source passage was found, but the text-matching rules cannot safely determine whether it fully supports or contradicts the claim.",
      evidence: matched, score: best.score
    };
  }

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function runAnalysis() {
    const source = sourceText.value.trim();
    const claims = splitSentences(claimsText.value);
    errorMessage.hidden = true;
    errorMessage.textContent = "";

    if (!source || !claimsText.value.trim()) {
      errorMessage.textContent = "Paste both the source material and the AI-generated answer before running a check.";
      errorMessage.hidden = false;
      return;
    }
    if (!claims.length) {
      errorMessage.textContent = "Add at least one claim to review.";
      errorMessage.hidden = false;
      return;
    }
    if (claims.length > 100) {
      errorMessage.textContent = "This prototype checks up to 100 claims at a time. Split the text into smaller reviews.";
      errorMessage.hidden = false;
      return;
    }

    const passages = source.split(/(?<=[.!?])\s+|\n+/u).map((s) => s.trim()).filter(Boolean);
    if (!passages.length) {
      errorMessage.textContent = "The source needs at least one sentence or line.";
      errorMessage.hidden = false;
      return;
    }
    latestResults = claims.map((claim) => classifyClaim(claim, passages));
    renderResults(latestResults);
  }

  function renderResults(items) {
    const counts = items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const cards = [
      ["supported", "Supported"],
      ["contradicted", "Contradicted"],
      ["insufficient", "Insufficient evidence"],
      ["review", "Needs review"]
    ];
    summaryGrid.innerHTML = cards.map(([key, label]) => `
      <div class="summary-card ${key}">
        <span class="summary-count">${counts[key] || 0}</span>
        <span class="summary-label"><span class="summary-dot"></span>${label}</span>
      </div>`).join("");

    ledger.innerHTML = items.map((item, index) => `
      <article class="finding">
        <div class="finding-top">
          <div><div class="finding-num">CLAIM ${String(index + 1).padStart(2, "0")}</div><p class="finding-claim">${escapeHtml(item.claim)}</p></div>
          <span class="status status-${item.status}">${escapeHtml(item.label)}</span>
        </div>
        <div class="finding-detail">
          <p>${escapeHtml(item.explanation)}</p>
          <p class="evidence-label">CLOSEST SOURCE PASSAGE</p>
          ${item.evidence ? `<p class="evidence-quote">“${escapeHtml(item.evidence)}”</p>` : '<p class="evidence-empty">No sufficiently relevant passage found.</p>'}
          <p><strong>Text overlap:</strong> ${Math.round(item.score * 100)}% <span aria-hidden="true">·</span> heuristic signal, not a probability of truth.</p>
        </div>
      </article>`).join("");
    $("#claimTotal").textContent = `${items.length} claim${items.length === 1 ? "" : "s"} checked`;
    $("#resultsSubtitle").textContent = `Analysis of ${items.length} claim${items.length === 1 ? "" : "s"} against the source text you provided.`;
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toCsv(items) {
    const escapeCell = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const rows = [["Claim", "Status", "Explanation", "Closest source passage", "Text overlap (heuristic)"]];
    for (const item of items) rows.push([item.claim, item.label, item.explanation, item.evidence, Math.round(item.score * 100) + "%"]);
    return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  }

  const updateCounts = () => {
    $("#sourceCount").textContent = `${sourceText.value.length.toLocaleString()} characters`;
    $("#claimsCount").textContent = `${claimsText.value.length.toLocaleString()} characters`;
  };

  $("#exampleBtn").addEventListener("click", () => {
    sourceText.value = exampleSource;
    claimsText.value = exampleClaims;
    updateCounts();
    resultsSection.hidden = true;
    errorMessage.hidden = true;
  });
  $("#clearSource").addEventListener("click", () => { sourceText.value = ""; updateCounts(); });
  $("#clearClaims").addEventListener("click", () => { claimsText.value = ""; updateCounts(); resultsSection.hidden = true; });
  sourceText.addEventListener("input", updateCounts);
  claimsText.addEventListener("input", updateCounts);
  runBtn.addEventListener("click", runAnalysis);
  $("#exportJson").addEventListener("click", () => {
    if (latestResults.length) downloadFile("prooflayer-findings.json", JSON.stringify({
      product: "ProofLayer Local", version: "0.1.0",
      note: "Heuristic text matching; not proof of truth.",
      findings: latestResults.map(({ claim, status, label, explanation, evidence, score }) => ({ claim, status, label, explanation, evidence, textOverlapHeuristic: Math.round(score * 100) / 100 }))
    }, null, 2), "application/json;charset=utf-8");
  });
  $("#exportCsv").addEventListener("click", () => {
    if (latestResults.length) downloadFile("prooflayer-findings.csv", "\uFEFF" + toCsv(latestResults), "text/csv;charset=utf-8");
  });
  updateCounts();
})();