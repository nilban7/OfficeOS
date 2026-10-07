import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownMessage } from "@/components/ai/markdown-message";

describe("MarkdownMessage Component", () => {
  it("renders bold text properly without raw asterisks", () => {
    const content = "Hello **World** and **Niladri**!";
    const { container } = render(<MarkdownMessage content={content} />);
    
    // Bold content should be in strong tags
    const strongs = container.querySelectorAll("strong");
    expect(strongs.length).toBe(2);
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.queryByText("**World**")).not.toBeInTheDocument();
  });

  it("renders markdown tables properly", () => {
    const tableMd = `
| Employee | Role | Return Date |
|---|---|---|
| Niladri | CEO | 2026-10-08 |
| Aritra | Asst Director | 2026-10-10 |
`;
    render(<MarkdownMessage content={tableMd} />);
    expect(screen.getByText("Employee")).toBeInTheDocument();
    expect(screen.getByText("Niladri")).toBeInTheDocument();
    expect(screen.getByText("2026-10-08")).toBeInTheDocument();
  });

  it("renders bullet points properly", () => {
    const listMd = "- Item One\n- Item Two\n- Item Three";
    render(<MarkdownMessage content={listMd} />);
    expect(screen.getByText("Item One")).toBeInTheDocument();
    expect(screen.getByText("Item Two")).toBeInTheDocument();
  });
});
