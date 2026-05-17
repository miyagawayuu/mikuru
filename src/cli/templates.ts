export const availableTemplates = ["starter", "basic", "video-player"] as const;

export type TemplateName = (typeof availableTemplates)[number];

export const templateDescriptions: Record<TemplateName, string> = {
  starter: "minimal Vite app",
  basic: "component composition example",
  "video-player": "MikuruVideoPlayer media app"
};

export function formatTemplateList(): string {
  return availableTemplates.map((name) => `${name} - ${templateDescriptions[name]}`).join("\n");
}

export function formatTemplatesForError(): string {
  return availableTemplates.map((name) => `  ${name} - ${templateDescriptions[name]}`).join("\n");
}

export function isTemplateName(value: string): value is TemplateName {
  return (availableTemplates as readonly string[]).includes(value);
}

export function suggestTemplateName(value: string): TemplateName | undefined {
  let bestName: TemplateName | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const templateName of availableTemplates) {
    const distance = levenshtein(value, templateName);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = templateName;
    }
  }

  return bestDistance <= 2 ? bestName : undefined;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}
