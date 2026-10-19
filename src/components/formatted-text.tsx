import type { ReactNode } from "react";

// Renders a plain-text program description with real formatting:
// - blank lines / new lines start new paragraphs
// - "## Heading", or a short line with no ending punctuation, becomes a heading
// - lines starting with "-", "*" or "•" become bullet lists
// - "Label (Ages 5-7): text" gets a bold lead-in label
// - **bold** text is supported inline

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  );
}

function withLead(text: string, key: string | number): ReactNode {
  const m = text.match(/^([A-Z][^:.!?]{2,60}(?:\([^)]*\))?):\s+(.+)$/);
  if (m) {
    return (
      <p key={key}>
        <strong className="font-semibold text-foreground">{m[1]}:</strong> {inline(m[2])}
      </p>
    );
  }
  return <p key={key}>{inline(text)}</p>;
}

/** Older descriptions were saved as one long block; add breaks before "Name (Ages x-y):" lead-ins. */
function normalize(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").trim();
  if (!t.includes("\n")) {
    t = t.replace(/([.!?])\s+(?=(?:[A-Z][\w'-]*\s){1,5}\(Ages [^)]+\):)/g, "$1\n\n");
  }
  return t;
}

export function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  const lines = normalize(text).split("\n").map((l) => l.trim());
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1.5 pl-5 marker:text-primary">
          {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };

  lines.forEach((line, i) => {
    if (!line) return flush();
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) return void bullets.push(bullet[1]);
    flush();
    const md = line.match(/^#{1,3}\s+(.+)$/);
    const next = lines.slice(i + 1).find((l) => l);
    const looksHeading = !!md || (line.length <= 60 && !/[.!?,:;]$/.test(line) && !!next);
    if (looksHeading) {
      blocks.push(
        <h3 key={i} className="pt-2 text-lg font-bold normal-case text-foreground">{md ? md[1] : line}</h3>,
      );
    } else {
      blocks.push(withLead(line, i));
    }
  });
  flush();

  return <div className={`space-y-3 leading-relaxed text-muted-foreground ${className}`}>{blocks}</div>;
}
