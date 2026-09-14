import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** One retrieval unit: a single H2 section of a corpus document. */
export interface Chunk {
  /** Stable id `<doc-slug>#<heading-slug>`; labels and assertions key on this. */
  id: string;
  /** File slug, e.g. `fees-and-limits`. */
  doc: string;
  /** Document title from the H1 line. */
  title: string;
  /** Section heading text (or "Overview" for text before the first H2). */
  heading: string;
  /** Section body, trimmed. */
  text: string;
}

/** Lowercase, collapse runs of non-alphanumerics to one hyphen, trim hyphens. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Split one markdown document into chunks on H2 headings.
 * Text between the H1 and the first H2 becomes `<doc>#overview` when non-empty.
 * Deeper headings (H3+) are kept inside their parent H2 section.
 */
export function chunkMarkdown(doc: string, markdown: string): Chunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = doc;
  let heading = "Overview";
  let buffer: string[] = [];
  const chunks: Chunk[] = [];
  const seen = new Set<string>();

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text.length === 0) return;
    const id = `${doc}#${slugify(heading)}`;
    if (seen.has(id)) {
      throw new Error(`Duplicate chunk id ${id}: H2 headings must be unique within ${doc}.md`);
    }
    seen.add(id);
    chunks.push({ id, doc, title, heading, text });
  };

  for (const line of lines) {
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h1 && chunks.length === 0 && buffer.join("").trim() === "") {
      title = h1[1] ?? doc;
      continue;
    }
    if (h2) {
      flush();
      heading = h2[1] ?? "Untitled";
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}

const NON_CORPUS_FILES = new Set(["README.md", "FACTS.md"]);

/** Load every `*.md` in `dir` (except README and FACTS) and chunk it. Sorted by file name for determinism. */
export function loadCorpus(dir: string): Chunk[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !NON_CORPUS_FILES.has(f))
    .sort();
  const chunks: Chunk[] = [];
  for (const file of files) {
    const doc = basename(file, ".md");
    chunks.push(...chunkMarkdown(doc, readFileSync(join(dir, file), "utf8")));
  }
  return chunks;
}
