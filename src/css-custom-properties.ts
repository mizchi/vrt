import type { CssDeclaration, ComputedStyleDiff } from "./css-challenge-core.ts";

export interface ComputedStyleTarget {
  selector: string;
  property: string;
  viaCustomProperties: string[];
}

export interface CustomPropertyUsageIndex {
  findImpactedTargets(customProperty: string): ComputedStyleTarget[];
}

interface CustomPropertyConsumer {
  selector: string;
  property: string;
}

export function isCustomProperty(property: string): boolean {
  return property.startsWith("--");
}

export function extractCustomPropertyReferences(value: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  const regex = /var\(\s*(--[\w-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const ref = match[1];
    if (seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  return refs;
}

export function collectComputedStyleTrackingProperties(
  declarations: CssDeclaration[],
): string[] {
  const properties = new Set<string>();
  for (const declaration of declarations) {
    if (isCustomProperty(declaration.property)) continue;
    if (extractCustomPropertyReferences(declaration.value).length === 0) continue;
    properties.add(declaration.property);
  }
  return [...properties].sort();
}

export function mergeComputedStyleProperties(
  ...groups: readonly string[][]
): string[] {
  return [...new Set(groups.flat())].sort();
}

export function buildCustomPropertyUsageIndex(
  declarations: CssDeclaration[],
): CustomPropertyUsageIndex {
  const consumersByCustomProperty = new Map<string, CustomPropertyConsumer[]>();

  for (const declaration of declarations) {
    const refs = extractCustomPropertyReferences(declaration.value);
    for (const ref of refs) {
      const consumers = consumersByCustomProperty.get(ref) ?? [];
      consumers.push({
        selector: declaration.selector,
        property: declaration.property,
      });
      consumersByCustomProperty.set(ref, consumers);
    }
  }

  return {
    findImpactedTargets(customProperty: string): ComputedStyleTarget[] {
      const queue: Array<{ customProperty: string; path: string[] }> = [
        { customProperty, path: [customProperty] },
      ];
      const seenCustomProperties = new Set<string>([customProperty]);
      const targets = new Map<string, ComputedStyleTarget>();

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const consumer of consumersByCustomProperty.get(current.customProperty) ?? []) {
          if (isCustomProperty(consumer.property)) {
            if (seenCustomProperties.has(consumer.property)) continue;
            seenCustomProperties.add(consumer.property);
            queue.push({
              customProperty: consumer.property,
              path: [...current.path, consumer.property],
            });
            continue;
          }

          const key = `${consumer.selector}\u0000${consumer.property}\u0000${current.path.join("->")}`;
          if (targets.has(key)) continue;
          targets.set(key, {
            selector: consumer.selector,
            property: consumer.property,
            viaCustomProperties: current.path,
          });
        }
      }

      return [...targets.values()].sort(compareTargets);
    },
  };
}

export function findExpectedComputedStyleTargets(
  removed: Pick<CssDeclaration, "selector" | "property" | "value">,
  usageIndex: CustomPropertyUsageIndex | null,
): ComputedStyleTarget[] {
  if (isCustomProperty(removed.property)) {
    return usageIndex?.findImpactedTargets(removed.property) ?? [];
  }

  const refs = extractCustomPropertyReferences(removed.value);
  if (refs.length === 0) return [];

  return [
    {
      selector: removed.selector,
      property: removed.property,
      viaCustomProperties: refs,
    },
  ];
}

export function filterComputedStyleDiffsByTargets(
  diffs: ComputedStyleDiff[],
  targets: Pick<ComputedStyleTarget, "selector" | "property">[],
): ComputedStyleDiff[] {
  if (targets.length === 0) return diffs;
  return diffs.filter((diff) =>
    targets.some((target) =>
      target.property === diff.property &&
      matchesComputedStyleTargetSelector(diff.selector, target.selector)
    )
  );
}

function compareTargets(a: ComputedStyleTarget, b: ComputedStyleTarget): number {
  const selectorCmp = a.selector.localeCompare(b.selector);
  if (selectorCmp !== 0) return selectorCmp;
  const propertyCmp = a.property.localeCompare(b.property);
  if (propertyCmp !== 0) return propertyCmp;
  return a.viaCustomProperties.join("->").localeCompare(b.viaCustomProperties.join("->"));
}

function normalizeComputedStyleTargetSelector(selector: string): string {
  return selector
    .replace(/:(hover|focus|active|focus-within|focus-visible|checked|disabled|invalid|valid|required|read-only)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesComputedStyleTargetSelector(
  diffSelector: string,
  targetSelector: string,
): boolean {
  const normalizedTarget = normalizeComputedStyleTargetSelector(targetSelector);
  if (diffSelector === targetSelector || diffSelector === normalizedTarget) return true;

  const semanticPrefix = buildSemanticSnapshotSelectorPrefix(normalizedTarget);
  if (!semanticPrefix) return false;

  return diffSelector === semanticPrefix ||
    diffSelector.startsWith(`${semanticPrefix}[`) ||
    diffSelector.startsWith(`${semanticPrefix}::`);
}

function buildSemanticSnapshotSelectorPrefix(selector: string): string | null {
  const parts = selector
    .split(/\s*[>+~]\s*|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1);
  if (!last) return null;

  if (last.startsWith(".") || last.startsWith("#")) return last;

  const isTag = /^[a-zA-Z][\w-]*$/.test(last);
  if (!isTag) return null;

  const parent = parts.at(-2);
  if (parent && (parent.startsWith(".") || parent.startsWith("#"))) {
    return `${parent}>${last}`;
  }

  return `>${last}`;
}
