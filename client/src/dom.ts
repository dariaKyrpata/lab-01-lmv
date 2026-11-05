export function requireElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  elementType: { new(): T },
): T {
  const element = root.querySelector(selector);

  if (!(element instanceof elementType)) {
    throw new Error("Missing or invalid UI element: " + selector);
  }

  return element;
}
