"use client";

import type { ReactNode } from "react";

/**
 * Restricted Markdown-ish renderer for assistant chat.
 * Supports: paragraphs (blank lines), soft breaks, **bold**, *italic*,
 * unordered lists (- / *), ordered lists (1.), and safe http(s) links [label](url).
 * Never uses dangerouslySetInnerHTML.
 */

function isSafeHref(href: string): boolean {
  const t = href.trim().toLowerCase();
  return t.startsWith("https://") || t.startsWith("http://") || t.startsWith("mailto:");
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on links, bold, italic — process left to right
  const pattern =
    /(!?\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const key = `${keyPrefix}-${i++}`;
    if (match[1] && match[2] != null && match[3] != null) {
      const label = match[2];
      const href = match[3];
      if (isSafeHref(href) && !match[1].startsWith("!")) {
        nodes.push(
          <a
            key={key}
            href={href}
            className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {label}
          </a>
        );
      } else {
        nodes.push(label);
      }
    } else if (match[4] && match[5] != null) {
      nodes.push(
        <strong key={key} className="font-semibold text-[var(--color-ink)]">
          {match[5]}
        </strong>
      );
    } else if ((match[6] && match[7] != null) || (match[8] && match[9] != null)) {
      nodes.push(
        <em key={key} className="italic">
          {match[7] ?? match[9]}
        </em>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes.length ? nodes : [text];
}

function renderBlock(block: string, bi: number): ReactNode {
  const lines = block.split("\n").filter((l, idx, arr) => !(l === "" && idx === arr.length - 1));
  const isUl = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l.trim()) || l.trim() === "");
  const isOl =
    lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === "");

  if (isUl) {
    return (
      <ul key={`b-${bi}`} className="my-1 list-disc space-y-0.5 pl-5">
        {lines
          .filter((l) => l.trim())
          .map((l, li) => (
            <li key={`b-${bi}-li-${li}`}>
              {renderInline(l.trim().replace(/^[-*]\s+/, ""), `b${bi}li${li}`)}
            </li>
          ))}
      </ul>
    );
  }
  if (isOl) {
    return (
      <ol key={`b-${bi}`} className="my-1 list-decimal space-y-0.5 pl-5">
        {lines
          .filter((l) => l.trim())
          .map((l, li) => (
            <li key={`b-${bi}-ol-${li}`}>
              {renderInline(l.trim().replace(/^\d+\.\s+/, ""), `b${bi}ol${li}`)}
            </li>
          ))}
      </ol>
    );
  }

  return (
    <p key={`b-${bi}`} className="whitespace-pre-wrap">
      {lines.map((line, li) => (
        <span key={`b-${bi}-l-${li}`}>
          {li > 0 ? <br /> : null}
          {renderInline(line, `b${bi}l${li}`)}
        </span>
      ))}
    </p>
  );
}

export function SafeChatMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--color-ink)]">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}
