export type SourceLocation = {
  filename?: string;
  offset: number;
  line: number;
  column: number;
};

export class MikuruCompileError extends Error {
  readonly filename?: string;
  readonly offset: number;
  readonly line: number;
  readonly column: number;
  readonly frame?: string;

  constructor(message: string, location: SourceLocation, frame?: string) {
    super(formatMessage(message, location));
    this.name = "MikuruCompileError";
    this.filename = location.filename;
    this.offset = location.offset;
    this.line = location.line;
    this.column = location.column;
    this.frame = frame;
  }
}

export function createCompileError(message: string, source: string, offset: number, filename?: string): MikuruCompileError {
  const location = getSourceLocation(source, offset, filename);
  return new MikuruCompileError(message, location, createCodeFrame(source, location));
}

export function getSourceLocation(source: string, offset: number, filename?: string): SourceLocation {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;

  for (let index = 0; index < safeOffset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return {
    filename,
    offset: safeOffset,
    line,
    column
  };
}

export function createCodeFrame(source: string, location: SourceLocation): string {
  const lines = source.split(/\r?\n/);
  const lineText = lines[location.line - 1] ?? "";
  const gutter = String(location.line).padStart(4, " ");

  return `${gutter} | ${lineText}\n     | ${" ".repeat(Math.max(0, location.column - 1))}^`;
}

function formatMessage(message: string, location: SourceLocation): string {
  const filePart = location.filename ? `${location.filename}:` : "";
  return `${message} (${filePart}${location.line}:${location.column})`;
}
