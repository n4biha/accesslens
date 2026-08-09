/**
 * Pulls the text layer out of a PDF in the browser.
 *
 * Extraction happens client-side on purpose: the rest of the pipeline verifies
 * that every evidence quote appears verbatim in the source, and highlights it
 * by position. Sending the PDF straight to the model would produce an analysis
 * with no text to check those quotes against.
 */

export class PdfTextError extends Error {}

/** A line that starts a new block rather than continuing the previous one. */
const BLOCK_START = /^(\d+[.)]\s|[-•–*]\s|step\s+\d+|part\s+[a-z0-9]+\b)/i;

/**
 * Rejoins lines that a PDF wrapped mid-sentence. Without this, a sentence split
 * across two lines never matches the verbatim quote the model returns, and the
 * barrier trace loses its highlight.
 */
function reflow(lines: string[]): string {
  const out: string[] = [];

  for (const line of lines) {
    const previous = out[out.length - 1];
    const continuesPrevious =
      previous !== undefined &&
      !/[.!?:;"”]$/.test(previous) &&
      !BLOCK_START.test(line) &&
      // A short unpunctuated line is a heading, not a wrapped sentence.
      previous.length >= 50;

    if (continuesPrevious) {
      out[out.length - 1] = previous.endsWith("-")
        ? previous.slice(0, -1) + line
        : `${previous} ${line}`;
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // Bundled worker, resolved by the build rather than fetched from a CDN, so
  // the app keeps working offline during a demo.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  let document;
  try {
    const buffer = await file.arrayBuffer();
    document = await pdfjs.getDocument({ data: buffer }).promise;
  } catch {
    throw new PdfTextError("That PDF could not be opened. It may be corrupt or password protected.");
  }

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();

    // The text layer is a bag of positioned runs, so lines are rebuilt by
    // grouping on the baseline y. A run's `hasEOL` flag is deliberately ignored:
    // some producers set it mid-word, which would split words and break the
    // verbatim evidence matching this text later feeds.
    const rows = new Map<number, { x: number; str: string }[]>();

    for (const item of content.items) {
      if (!("str" in item) || item.str === "") continue;
      const x = item.transform[4] as number;
      const y = Math.round((item.transform[5] as number) / 3) * 3; // 3pt tolerance
      const row = rows.get(y);
      if (row) row.push({ x, str: item.str });
      else rows.set(y, [{ x, str: item.str }]);
    }

    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // top of page first
      .map(([, runs]) =>
        runs
          .sort((a, b) => a.x - b.x)
          .map((run) => run.str)
          .join("")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);

    pages.push(reflow(lines));
  }

  const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

  if (text.length < 40) {
    throw new PdfTextError(
      "No readable text found. This looks like a scanned PDF — AccessLens needs a text layer, so paste the assignment text instead."
    );
  }

  return text;
}
