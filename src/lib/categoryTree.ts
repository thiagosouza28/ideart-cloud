import type { Category, Product } from "@/types/database";

export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

const compareCategory = (a: Category, b: Category) => {
  const orderDiff = Number(a.order_position ?? 0) - Number(b.order_position ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, "pt-BR");
};

export const buildCategoryChildrenMap = (categories: Category[]) => {
  const map = new Map<string | null, Category[]>();

  categories.forEach((category) => {
    const key = category.parent_id ?? null;
    const bucket = map.get(key) ?? [];
    bucket.push(category);
    map.set(key, bucket);
  });

  map.forEach((items) => items.sort(compareCategory));
  return map;
};

export const buildCategoryTree = (categories: Category[]) => {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const childrenMap = buildCategoryChildrenMap(categories);

  const walk = (parentId: string | null): CategoryTreeNode[] => {
    const items = childrenMap.get(parentId) ?? [];
    return items.map((item) => ({
      ...item,
      children: walk(item.id),
    }));
  };

  const roots = categories
    .filter((category) => !category.parent_id || !byId.has(category.parent_id))
    .sort(compareCategory);

  return roots.map((root) => ({
    ...root,
    children: walk(root.id),
  }));
};

export const flattenCategoryTree = (
  nodes: CategoryTreeNode[],
  level = 0,
): Array<{ category: Category; level: number }> => {
  return nodes.flatMap((node) => [
    { category: node, level },
    ...flattenCategoryTree(node.children, level + 1),
  ]);
};

export const collectDescendantIds = (categories: Category[], categoryId: string) => {
  const childrenMap = buildCategoryChildrenMap(categories);
  const collected = new Set<string>();
  const stack = [categoryId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;

    const children = childrenMap.get(currentId) ?? [];
    children.forEach((child) => {
      if (!collected.has(child.id)) {
        collected.add(child.id);
        stack.push(child.id);
      }
    });
  }

  return collected;
};

export const buildCategoryProductCountMap = (categories: Category[], products: Array<Pick<Product, "category_id">>) => {
  const childrenMap = buildCategoryChildrenMap(categories);
  const directCount = new Map<string, number>();

  products.forEach((product) => {
    if (!product.category_id) return;
    directCount.set(product.category_id, (directCount.get(product.category_id) || 0) + 1);
  });

  const totalCount = new Map<string, number>();
  const countNode = (categoryId: string) => {
    if (totalCount.has(categoryId)) return totalCount.get(categoryId) || 0;
    const current = directCount.get(categoryId) || 0;
    const children = childrenMap.get(categoryId) ?? [];
    const nested = children.reduce((sum, child) => sum + countNode(child.id), 0);
    const total = current + nested;
    totalCount.set(categoryId, total);
    return total;
  };

  categories.forEach((category) => {
    countNode(category.id);
  });

  return totalCount;
};

export const collectCategoryScopeIds = (categories: Category[], categoryId: string | null) => {
  if (!categoryId) return null;
  const ids = collectDescendantIds(categories, categoryId);
  ids.add(categoryId);
  return ids;
};
