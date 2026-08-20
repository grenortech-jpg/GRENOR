import { describe, expect, it } from "vitest";

import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
  DEFAULT_CATEGORIES,
} from "@/lib/categories/default-plan";

describe("plano de contas padrao", () => {
  it("tem ids unicos", () => {
    const ids = new Set(DEFAULT_CATEGORIES.map((category) => category.id));
    expect(ids.size).toBe(DEFAULT_CATEGORIES.length);
  });

  it("cobre todos os grupos da DRE", () => {
    const groups = new Set(DEFAULT_CATEGORIES.map((category) => category.group));
    for (const group of CATEGORY_GROUP_ORDER) {
      expect(groups).toContain(group);
    }
  });

  it("rotula todos os grupos", () => {
    for (const group of CATEGORY_GROUP_ORDER) {
      expect(CATEGORY_GROUP_LABELS[group]).toBeTruthy();
    }
  });

  it("tem exatamente uma categoria neutra de transferencia", () => {
    const neutral = DEFAULT_CATEGORIES.filter(
      (category) => category.isTransferNeutral,
    );
    expect(neutral).toHaveLength(1);
    expect(neutral[0]?.group).toBe("TRANSFERS");
  });

  it("nao repete sortOrder", () => {
    const orders = DEFAULT_CATEGORIES.map((category) => category.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("ordena os grupos conforme a apresentacao da DRE", () => {
    const groupPosition = new Map(
      CATEGORY_GROUP_ORDER.map((group, index) => [group, index]),
    );
    const sorted = [...DEFAULT_CATEGORIES].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    let previous = -1;
    for (const category of sorted) {
      const position = groupPosition.get(category.group)!;
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
  });
});
