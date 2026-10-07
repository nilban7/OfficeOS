"use client";

import React from "react";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`, and [links](url).
 */
function renderInline(text: string): React.ReactNode[] {
  // Regex to match code, bold, italic, links
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {renderInline(part.slice(2, -2))}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={index} className="italic text-slate-700">
          {renderInline(part.slice(1, -1))}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch && linkMatch[1] && linkMatch[2]) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-600 underline hover:text-primary-700"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

/**
 * Checks if a string line represents a markdown table row.
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|(?:[\s-:]+\|)+$/.test(trimmed);
}

function parseTableCells(row: string): string[] {
  return row
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Rich markdown component rendering bold, italics, tables, lists, and headers
 * without external dependencies.
 */
export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }
    const trimmed = line.trim();

    // 1. Table Detection
    const nextLine = lines[i + 1];
    if (isTableRow(trimmed) && nextLine !== undefined && isTableSeparator(nextLine)) {
      const headerCells = parseTableCells(trimmed);
      i += 2; // skip header and separator

      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        if (rowLine !== undefined && isTableRow(rowLine)) {
          bodyRows.push(parseTableCells(rowLine));
          i++;
        } else {
          break;
        }
      }

      elements.push(
        <div key={`table-${i}`} className="my-2.5 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-700 font-semibold">
              <tr>
                {headerCells.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 text-left font-semibold">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-left">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 2. Headings (###, ##, #)
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={`h3-${i}`} className="mt-3 mb-1.5 text-xs font-bold text-slate-900 tracking-tight">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={`h2-${i}`} className="mt-3.5 mb-1.5 text-sm font-bold text-slate-900 tracking-tight">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={`h1-${i}`} className="mt-4 mb-2 text-base font-bold text-slate-900 tracking-tight">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // 3. Bullet Lists (- , * , • )
    const bulletMatch = trimmed.match(/^([-*•])\s+(.*)$/);
    if (bulletMatch && bulletMatch[2]) {
      const listItems: string[] = [bulletMatch[2]];
      i++;
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined) break;
        const nextTrimmed = itemLine.trim();
        const nextMatch = nextTrimmed.match(/^([-*•])\s+(.*)$/);
        if (nextMatch && nextMatch[2]) {
          listItems.push(nextMatch[2]);
          i++;
        } else if (nextTrimmed === "") {
          break;
        } else {
          break;
        }
      }

      elements.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1 pl-4 list-disc text-xs text-slate-800">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 4. Numbered Lists (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch && numMatch[2]) {
      const listItems: string[] = [numMatch[2]];
      i++;
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined) break;
        const nextTrimmed = itemLine.trim();
        const nextNumMatch = nextTrimmed.match(/^(\d+)\.\s+(.*)$/);
        if (nextNumMatch && nextNumMatch[2]) {
          listItems.push(nextNumMatch[2]);
          i++;
        } else if (nextTrimmed === "") {
          break;
        } else {
          break;
        }
      }

      elements.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1 pl-4 list-decimal text-xs text-slate-800">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 5. Empty line (Spacing)
    if (trimmed === "") {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // 6. Regular Paragraph / Line
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed my-0.5">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className={className}>{elements}</div>;
}
